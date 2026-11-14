// Tests for AI show generation's own rules: which toggles a venue offers, what the AI is told about the rig, and how its
// answer becomes looks and sequences on this rig's channels, with every mistake checked and clamped.
import { describe, expect, it } from 'vitest';

import { buildGeneratedShow, describeRig, describeStage, settingsFor, venueFeatures } from '../../shared/aiShow.js';
import { describePlace, unplacedLights } from '../../shared/stageRig.js';
import { BUILTIN_TYPES } from './fixtures.js';

const head = {
  id: 'head-type',
  manufacturer: 'Acme',
  name: 'Spot head',
  description: '',
  category: 'moving-head',
  modes: [
    {
      name: '5 channel',
      channels: [
        { name: 'Pan', type: 'pan', defaultValue: 128 },
        { name: 'Tilt', type: 'tilt', defaultValue: 128 },
        {
          name: 'Gobo',
          type: 'gobo',
          defaultValue: 0,
          capabilities: [
            { from: 0, to: 9, type: 'gobo-slot', label: 'Open' },
            { from: 10, to: 19, type: 'gobo-slot', label: 'Star' },
            { from: 20, to: 255, type: 'gobo-shake', label: 'Star shake' },
          ],
        },
        { name: 'Dimmer', type: 'intensity', defaultValue: 0 },
        { name: 'Red', type: 'red', defaultValue: 0 },
      ],
    },
  ],
};

const pars = {
  schemaVersion: 7,
  id: 'show',
  name: 'Show',
  venue: { id: 'main', name: 'Club' },
  venues: [],
  fixtureTypes: [head],
  fixtures: [
    { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
    { id: 'p2', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
  ],
  groups: [{ id: 'g', name: 'Front', fixtureIds: ['p1', 'p2'] }],
  scenes: [{ id: 's', name: 'Ocean', values: {} }],
  chases: [],
};
const withHead = {
  ...pars,
  fixtures: [...pars.fixtures, { id: 'h1', name: 'Head', typeId: 'head-type', mode: 0, address: 10 }],
};

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

describe('venueFeatures', () => {
  it('offers only strobe for pars, and movement and gobos once a moving head is there', () => {
    expect(venueFeatures(pars, BUILTIN_TYPES).map((feature) => feature.id)).toEqual(['strobe']);
    const features = venueFeatures(withHead, BUILTIN_TYPES);
    expect(features.map((feature) => feature.id)).toEqual(['strobe', 'movement', 'gobos']);
    expect(features.find((feature) => feature.id === 'movement').lights).toEqual(['Head']);
  });
});

describe('describeRig', () => {
  it('tells the AI each light, how it makes colour, and every control with its choices', () => {
    const rig = describeRig(withHead, BUILTIN_TYPES);
    expect(rig.venue).toBe('Club');
    expect(rig.lights[0]).toMatchObject({ lightId: 'p1', colour: 'mixes any colour (red, green, blue)', controls: [] });
    expect(rig.lights[2]).toMatchObject({ lightId: 'h1', type: 'moving-head', dimmer: true });
    expect(rig.lights[2].controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ control: 'pan', kind: 'level 0 to 100' }),
        expect.objectContaining({
          control: 'gobo',
          kind: 'choice',
          options: ['Open', 'Star', 'Star shake (takes a level 0 to 100)'],
        }),
      ]),
    );
    expect(rig.groups).toEqual([{ name: 'Front', lightIds: ['p1', 'p2'] }]);
  });
});

describe('describeStage', () => {
  const square = {
    ...withHead,
    rig: { shape: 'square', uprights: true, width: 10, depth: 6, height: 4 },
    fixtures: [
      {
        id: 'pr',
        name: 'Par right',
        typeId: 'generic-rgb-par',
        mode: 0,
        address: 1,
        stage: { rail: 'front', at: 0.8 },
      },
      { id: 'pl', name: 'Par left', typeId: 'generic-rgb-par', mode: 0, address: 4, stage: { rail: 'front', at: 0.2 } },
      { id: 'h1', name: 'Head', typeId: 'head-type', mode: 0, address: 10, stage: { rail: 'back', at: 0.5 } },
      {
        id: 'side',
        name: 'Side par',
        typeId: 'generic-rgb-par',
        mode: 0,
        address: 7,
        stage: { rail: 'left', at: 0.9 },
      },
      {
        id: 'up',
        name: 'Upright par',
        typeId: 'generic-rgb-par',
        mode: 0,
        address: 13,
        stage: { rail: 'post-back-right', at: 0.3 },
      },
      {
        id: 'low',
        name: 'Floor par',
        typeId: 'generic-rgb-par',
        mode: 0,
        address: 16,
        stage: { rail: 'floor', x: 0.1, z: 0.9 },
      },
    ],
  };
  const categoryFn = (fixture) => (fixture.typeId === 'head-type' ? 'moving-head' : 'par');

  it('says where each light is, in words and metres as the audience sees the stage', () => {
    const { places } = describeStage(square, categoryFn);
    expect(places.get('pl')).toEqual({
      where: 'Front truss, left of centre',
      x: -3,
      y: 3.8,
      z: 3,
      aim: 'hangs from the truss, pointing down at the floor',
    });
    expect(places.get('pr').where).toBe('Front truss, right of centre');
    expect(places.get('h1').where).toBe('Back truss, centre');
    expect(places.get('side').where).toBe('Left truss, front end');
    expect(places.get('up')).toMatchObject({
      where: 'Upright, back right, low',
      aim: 'on an upright, facing the middle',
    });
    expect(places.get('low')).toMatchObject({
      where: 'On the floor, at the front, far left',
      aim: 'stands on the floor, facing the middle',
    });
  });

  it('lists the lights on each rail in order, what each rail faces, and the mirror pairs', () => {
    const { layout } = describeStage(square, categoryFn);
    expect(layout.truss).toBe('Square around the floor');
    expect(layout.size).toBe('10 m wide, 6 m deep, 4 m high');
    expect(layout.rows).toEqual([
      { rail: 'Back truss', order: 'left to right', lightIds: ['h1'], facesAcrossTheFloor: 'Front truss' },
      { rail: 'Front truss', order: 'left to right', lightIds: ['pl', 'pr'], facesAcrossTheFloor: 'Back truss' },
      { rail: 'Left truss', order: 'back to front', lightIds: ['side'], facesAcrossTheFloor: 'Right truss' },
      { rail: 'Upright, back right', order: 'bottom to top', lightIds: ['up'] },
      { rail: 'The floor', order: 'left to right', lightIds: ['low'] },
    ]);
    expect(layout.mirrorPairs).toEqual([['pl', 'pr']]);
  });

  it('is part of the rig the AI reads, and uses first places for lights not arranged yet', () => {
    const rig = describeRig(withHead, BUILTIN_TYPES);
    expect(rig.stage.truss).toBe('One truss, at the back');
    expect(rig.lights.every((light) => light.place.where.startsWith('Back truss'))).toBe(true);
    expect(unplacedLights(withHead.fixtures)).toHaveLength(3);
    expect(unplacedLights(square.fixtures)).toHaveLength(0);
  });

  it('puts a rail that no longer exists on the floor', () => {
    expect(describePlace({ shape: 'line' }, { rail: 'front', at: 0.5 })).toBe('On the floor, in the middle, centre');
  });
});

describe('settingsFor', () => {
  const controls = [
    { key: 'pan', kind: 'range', options: [] },
    {
      key: 'gobo',
      kind: 'choice',
      options: [{ label: 'Open' }, { label: 'Star' }, { label: 'Star shake' }],
    },
  ];
  it('keeps known controls, finds options by label, clamps levels, and drops the rest', () => {
    expect(
      settingsFor(
        [
          { control: 'pan', option: null, level: 140 },
          { control: 'gobo', option: 'star shake (takes a level 0 to 100)', level: 30 },
          { control: 'zoom', option: null, level: 50 },
          { control: 'gobo', option: 'Heart', level: 50 },
        ],
        controls,
      ),
    ).toEqual({ pan: 100, gobo: { option: 2, level: 30 } });
  });
});

describe('buildGeneratedShow', () => {
  const answer = {
    summary: 'A cool start that heats up.',
    looks: [
      {
        name: 'Ocean',
        lights: [
          { lightId: 'p1', color: '#0080ff', intensity: 50, settings: [] },
          { lightId: 'nope', color: '#ffffff', intensity: 100, settings: [] },
          {
            lightId: 'h1',
            color: '#ff0000',
            intensity: 100,
            settings: [{ control: 'gobo', option: 'Star', level: 0 }],
          },
        ],
      },
      { name: '', lights: [] },
    ],
    sequences: [
      {
        name: 'Build',
        loop: true,
        lengthBeats: 32.1,
        steps: [
          { look: 'Ocean', fadeBeats: 2, holdBeats: 6 },
          { look: 'Missing', fadeBeats: 1, holdBeats: 1 },
        ],
        blocks: [
          {
            lightId: 'h1',
            startBeat: -3,
            lengthBeats: 4.37,
            color: 'red',
            intensity: 250,
            fadeTo: { color: '#0000FF', intensity: 20 },
            strobe: null,
            rhythm: { kind: 'flash', everyBeats: 0.6, offsetBeats: 0.3 },
            settings: [{ control: 'pan', option: null, level: 0 }],
            endSettings: [{ control: 'pan', option: null, level: 100 }],
          },
          {
            lightId: 'ghost',
            startBeat: 0,
            lengthBeats: 4,
            color: '#fff',
            intensity: 1,
            fadeTo: null,
            strobe: 80,
            rhythm: { kind: 'pulse', everyBeats: 1, offsetBeats: 0 },
            settings: [],
            endSettings: [],
          },
        ],
      },
      { name: 'Empty', loop: true, lengthBeats: 8, steps: [], blocks: [] },
    ],
  };

  it('turns looks into channel values on this rig, leaving out unknown lights, and names them uniquely', () => {
    const show = buildGeneratedShow(answer, withHead, BUILTIN_TYPES, { makeId });
    expect(show.summary).toBe('A cool start that heats up.');
    const [ocean, unnamed] = show.looks;
    // The par mixes colour itself (no dimmer), so the colour is scaled by the intensity.
    expect(ocean.values).toMatchObject({ 1: 0, 2: 64, 3: 128 });
    // The head: dimmer full, red, and the Star gobo in the middle of its range.
    expect(ocean.values).toMatchObject({ 12: 15, 13: 255, 14: 255 });
    expect(ocean).toMatchObject({ name: 'Ocean 2', origin: 'ai' }); // "Ocean" is taken in the show
    expect(unnamed.name).toBe('AI look 2');
  });

  it('builds sequences from known looks and lights, clamping times, colours and levels', () => {
    const show = buildGeneratedShow(answer, withHead, BUILTIN_TYPES, { makeId });
    expect(show.sequences).toHaveLength(1); // the empty one is left out
    const [build] = show.sequences;
    expect(build).toMatchObject({ name: 'Build', loop: true, timing: 'beats', length: 32, origin: 'ai' });
    expect(build.steps).toEqual([
      expect.objectContaining({ sceneId: show.looks[0].id, fadeBeats: 2, holdBeats: 6, fadeMs: 1000, holdMs: 3000 }),
    ]);
    expect(build.blocks).toEqual([
      expect.objectContaining({
        fixtureId: 'h1',
        start: 0,
        length: 4.25,
        color: '#ffffff',
        intensity: 100,
        transition: 'fade',
        endColor: '#0000ff',
        endIntensity: 20,
        effect: 'flash',
        rhythmBeats: 0.5, // the offered rhythm nearest 0.6 beats
        rhythmOffset: 0.25,
        settings: { pan: 0 },
        endSettings: { pan: 100 },
      }),
    ]);
  });

  it('makes a sequence for a song play once at the song tempo', () => {
    const show = buildGeneratedShow(answer, withHead, BUILTIN_TYPES, { makeId, tempo: 127.96 });
    expect(show.sequences[0]).toMatchObject({ loop: false, tempo: 128 });
  });

  it('survives an answer that is not the expected shape', () => {
    expect(buildGeneratedShow(null, pars, BUILTIN_TYPES, { makeId })).toEqual({
      summary: '',
      looks: [],
      sequences: [],
    });
  });
});
