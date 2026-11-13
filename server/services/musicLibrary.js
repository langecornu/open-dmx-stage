// The music library for the decks on Perform: a folder on this computer (the Mac or the Pi running the app), scanned for
// audio files, with each track's title, artist, album, length and BPM tag. Any device on the network can list it and
// stream a track to play it there; only audio files inside the chosen folder can ever be read. A track's beat analysis
// (worked out in the browser) is kept here, so a track is analysed once.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parseFile } from 'music-metadata';

import { logger } from '../logger.js';
import { httpError } from '../utils/httpError.js';

const log = logger.child({ module: 'music' });

export const AUDIO_TYPES = /** @type {Record<string, string>} */ ({
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
});
const MAX_DEPTH = 6;
const MAX_TRACKS = 5000;
// A folder chosen by mistake (the whole disk) must not keep the server busy for minutes: the walk stops after this many
// folder entries, whatever it has found.
const MAX_ENTRIES = 50_000;
// Tags are read a few files at a time: quicker than one by one, without opening thousands of files at once.
const TAG_READERS = 8;

/**
 * @typedef {{ id: string, file: string, title: string, artist: string, album: string, duration: number | null,
 *   bpm: number | null, size: number, modified: number }} Track `file`: relative to the folder
 * @typedef {{ bpm: number, firstBeatSeconds: number, durationSeconds: number, peaks: number[] }} TrackAnalysis
 */

/** @param {string} file relative path @returns {string} a stable, URL-safe id */
const idOf = (file) => createHash('sha1').update(file).digest('base64url').slice(0, 16);

/** Writes a JSON file atomically. @param {string} file @param {unknown} value */
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(value), 'utf8');
  await rename(temp, file);
}

export class MusicLibrary {
  /** @param {{ dataDir: string, defaultFolder?: string }} options */
  constructor({ dataDir, defaultFolder = path.join(os.homedir(), 'Music') }) {
    this.settingsFile = path.join(dataDir, 'music.json');
    this.analysisFile = path.join(dataDir, 'music-analysis.json');
    this.defaultFolder = defaultFolder;
    /** @type {{ folder: string, tracks: Track[], scannedAt: number } | null} */
    this.index = null;
    /** @type {Record<string, TrackAnalysis & { modified: number }> | null} */
    this.analyses = null;
    /** @type {Promise<{ folder: string, exists: boolean, tracks: Track[] }> | null} a scan under way, shared */
    this.scanning = null;
  }

  /** @returns {Promise<string>} the folder the library reads */
  async folder() {
    try {
      const saved = JSON.parse(await readFile(this.settingsFile, 'utf8'));
      if (typeof saved.folder === 'string' && saved.folder) {
        return saved.folder;
      }
    } catch {
      // Not set yet: the computer's Music folder.
    }
    return this.defaultFolder;
  }

  /**
   * Chooses the folder, after checking it is one.
   * @param {string} folder an absolute path, or one starting with ~
   */
  async setFolder(folder) {
    const resolved = path.resolve(folder.replace(/^~(?=$|\/)/, os.homedir()));
    let info;
    try {
      info = await stat(resolved);
    } catch {
      throw httpError(400, `There is no folder at ${resolved} on this computer.`);
    }
    if (!info.isDirectory()) {
      throw httpError(400, `${resolved} is a file, not a folder.`);
    }
    await writeJson(this.settingsFile, { folder: resolved });
    this.index = null;
    return resolved;
  }

  /**
   * The tracks in the folder, read once and kept until a rescan.
   * @param {{ rescan?: boolean }} [options]
   * @returns {Promise<{ folder: string, exists: boolean, tracks: Track[] }>}
   */
  async list({ rescan = false } = {}) {
    const folder = await this.folder();
    if (this.index && this.index.folder === folder && !rescan) {
      return { folder, exists: true, tracks: this.index.tracks };
    }
    // Several devices asking at once share one scan.
    if (!this.scanning) {
      this.scanning = this.scan(folder).finally(() => {
        this.scanning = null;
      });
    }
    return this.scanning;
  }

  /**
   * Walks the folder for audio files and reads their tags, reusing what is known about files that have not changed.
   * @param {string} folder
   * @returns {Promise<{ folder: string, exists: boolean, tracks: Track[] }>}
   */
  async scan(folder) {
    let exists = true;
    let entriesSeen = 0;
    /** @type {string[]} */
    const files = [];
    /** @param {string} relative @param {number} depth */
    const walk = async (relative, depth) => {
      if (files.length >= MAX_TRACKS || entriesSeen >= MAX_ENTRIES || depth > MAX_DEPTH) {
        return;
      }
      let entries;
      try {
        entries = await readdir(path.join(folder, relative), { withFileTypes: true });
      } catch (error) {
        if (depth === 0) {
          exists = false;
        }
        log.warn({ err: error, folder: relative }, 'A music folder could not be read');
        return;
      }
      entriesSeen += entries.length;
      // Symbolic links are neither files nor folders here, so the walk never leaves the folder.
      for (const entry of entries) {
        if (entry.name.startsWith('.')) {
          continue;
        }
        const child = relative ? path.join(relative, entry.name) : entry.name;
        if (entry.isDirectory()) {
          await walk(child, depth + 1);
        } else if (entry.isFile() && AUDIO_TYPES[path.extname(entry.name).toLowerCase()]) {
          files.push(child);
        }
        if (files.length >= MAX_TRACKS || entriesSeen >= MAX_ENTRIES) {
          return;
        }
      }
    };
    await walk('', 0);
    if (entriesSeen >= MAX_ENTRIES) {
      log.warn({ folder }, 'The music folder is very large; only part of it was read');
    }

    const previous = new Map(
      (this.index?.folder === folder ? this.index.tracks : []).map((track) => [track.file, track]),
    );
    /** @type {(Track | null)[]} */
    const tracks = new Array(files.length).fill(null);
    let next = 0;
    const reader = async () => {
      while (next < files.length) {
        const at = next;
        next += 1;
        tracks[at] = await this.readTrack(folder, files[at], previous.get(files[at]));
      }
    };
    await Promise.all(Array.from({ length: TAG_READERS }, reader));
    const found = /** @type {Track[]} */ (tracks.filter(Boolean));
    found.sort((a, b) => (a.artist + a.title).localeCompare(b.artist + b.title));
    this.index = { folder, tracks: found, scannedAt: Date.now() };
    return { folder, exists, tracks: found };
  }

  /**
   * One track's details, from what is known when the file has not changed, or from its tags.
   * @param {string} folder
   * @param {string} file relative to the folder
   * @param {Track | undefined} known
   * @returns {Promise<Track | null>} null when the file has gone
   */
  async readTrack(folder, file, known) {
    const full = path.join(folder, file);
    let info;
    try {
      info = await stat(full);
    } catch {
      return null; // removed while the folder was being read
    }
    if (known && known.modified === info.mtimeMs && known.size === info.size) {
      return known;
    }
    /** @type {Track} */
    const track = {
      id: idOf(file),
      file,
      title: path.basename(file, path.extname(file)),
      artist: '',
      album: '',
      duration: null,
      bpm: null,
      size: info.size,
      modified: info.mtimeMs,
    };
    try {
      const { common, format } = await parseFile(full, { duration: false, skipCovers: true });
      track.title = common.title || track.title;
      track.artist = common.artist || '';
      track.album = common.album || '';
      track.duration = typeof format.duration === 'number' ? Math.round(format.duration * 10) / 10 : null;
      track.bpm = typeof common.bpm === 'number' && common.bpm > 0 ? Math.round(common.bpm * 10) / 10 : null;
    } catch (error) {
      log.warn({ err: error, file }, 'Could not read the tags of a track');
    }
    return track;
  }

  /**
   * A track's file and media type, for streaming. Only a track from the scanned list can be read, so no path from a
   * request ever reaches the file system.
   * @param {string} id
   * @returns {Promise<{ root: string, file: string, type: string }>}
   */
  async audio(id) {
    const { folder, tracks } = await this.list();
    const track = tracks.find((candidate) => candidate.id === id);
    if (!track) {
      throw httpError(404, 'That track is no longer in the music folder.');
    }
    return { root: folder, file: track.file, type: AUDIO_TYPES[path.extname(track.file).toLowerCase()] };
  }

  async loadAnalyses() {
    if (!this.analyses) {
      try {
        this.analyses = JSON.parse(await readFile(this.analysisFile, 'utf8'));
      } catch {
        this.analyses = {};
      }
    }
    return /** @type {Record<string, TrackAnalysis & { modified: number }>} */ (this.analyses);
  }

  /**
   * @param {string} id
   * @returns {Promise<TrackAnalysis | null>} the saved analysis, if the file has not changed since
   */
  async analysis(id) {
    const { tracks } = await this.list();
    const track = tracks.find((candidate) => candidate.id === id);
    const saved = (await this.loadAnalyses())[id];
    if (!track || !saved || saved.modified !== track.modified) {
      return null;
    }
    const { modified: _modified, ...analysis } = saved;
    void _modified;
    return analysis;
  }

  /**
   * @param {string} id
   * @param {TrackAnalysis} analysis
   */
  async saveAnalysis(id, analysis) {
    const { tracks } = await this.list();
    const track = tracks.find((candidate) => candidate.id === id);
    if (!track) {
      throw httpError(404, 'That track is no longer in the music folder.');
    }
    const analyses = await this.loadAnalyses();
    analyses[id] = { ...analysis, modified: track.modified };
    await writeJson(this.analysisFile, analyses);
  }
}
