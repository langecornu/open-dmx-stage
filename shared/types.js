// Shared JSDoc typedefs. Data shapes are inferred from the zod schemas, which stay the single source of truth, so the
// types and the runtime validation cannot drift apart. This file has no runtime code; it exists for `tsc` (ADR 0002).

/** @typedef {import('zod').z.infer<typeof import('../server/schemas/projectSchema.js').projectSchema>} Project */
/** @typedef {Project['fixtureTypes'][number]} FixtureType */
/** @typedef {Project['fixtures'][number]} Fixture */
/** @typedef {Project['scenes'][number]} Scene */
/** @typedef {Project['chases'][number]} Chase */
/** @typedef {import('zod').z.infer<typeof import('../server/schemas/projectSchema.js').outputSettingsSchema>} OutputSettings */

/** @typedef {OutputSettings & { universe: number }} ResolvedOutputSettings output settings with the universe filled in */

/**
 * What a driver reports about itself. `path`, `host` and `universe` are present for the drivers that have them.
 * @typedef {{ driver: string, connected: boolean, error: string | null, path?: string, host?: string, universe?: number }} DriverStatus
 */

/**
 * A DMX output. Drivers live in server/clients and are registered in server/services/outputManager.js.
 * @typedef {object} Driver
 * @property {string} name
 * @property {string} [path] serial port, for serial drivers
 * @property {() => Promise<void>} open
 * @property {(frame: Uint8Array) => void} send a full 512-slot frame, 0 to 255 per slot
 * @property {() => Promise<void>} close
 * @property {() => DriverStatus} getStatus
 */

/**
 * @typedef {object} PatchChannel
 * @property {string} fixtureId
 * @property {string} fixtureName
 * @property {string} channelName
 * @property {string} type
 * @property {number} defaultValue
 * @property {number} offset
 */

/**
 * @typedef {object} FixtureRange
 * @property {string} id
 * @property {number} start first DMX channel, 1 to 512
 * @property {number} end last DMX channel
 * @property {boolean} [outOfRange] true when the fixture runs past channel 512
 * @property {string[]} [overlaps] ids of fixtures it shares channels with
 * @property {boolean} [missingType] true when its fixture type or mode cannot be found
 */

/** @typedef {{ channels: Map<number, PatchChannel>, fixtures: FixtureRange[] }} Patch */

/**
 * The part of a serial port the drivers use. Real ports come from the `serialport` package; tests pass a mock.
 * @typedef {object} SerialPortLike
 * @property {boolean} isOpen
 * @property {boolean} [writableNeedDrain] true while the write buffer is backed up
 * @property {(event: string, listener: (...args: any[]) => void) => unknown} on
 * @property {(options: { brk?: boolean }, done: (error?: Error | null) => void) => unknown} set
 * @property {(data: Uint8Array | Buffer, done?: (error?: Error | null) => void) => unknown} write
 * @property {(done: (error?: Error | null) => void) => unknown} drain
 * @property {(done: (error?: Error | null) => void) => unknown} close
 */

/** @typedef {{ path: string, baudRate: number, dataBits?: number, stopBits?: 1 | 2, parity?: 'none' | 'even' | 'odd' }} SerialOptions */

export {};
