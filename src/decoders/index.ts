/**
 * Decoder exports
 *
 * Currently exports a simple canvas-based decoder that works in Workers.
 * WASM decoders with scaled DCT support will be added here.
 */

export * from './types';
export { SimpleDecoder } from './simple';
