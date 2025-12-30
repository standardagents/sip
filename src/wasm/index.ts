/**
 * WASM Module Exports
 *
 * Provides memory-efficient image processing using:
 * - libjpeg-turbo for JPEG (decode/encode with scaled DCT)
 * - libspng for PNG (row-by-row decode)
 */

export * from './types';
export { loadWasm, isWasmAvailable, getWasmModule, initWithWasmModule } from './loader';
export { WasmJpegDecoder, calculateOptimalScale } from './decoder';
export { WasmJpegEncoder } from './encoder';
export { WasmPngDecoder } from './png-decoder';
