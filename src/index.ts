/**
 * @standardagents/sip - Small Image Processor
 *
 * Ultra memory-efficient image processing for Cloudflare Workers.
 *
 * Features:
 * - Format detection without full decode (probe)
 * - Scanline-based bilinear resize (constant memory)
 * - JPEG output with quality control
 * - Support for JPEG, PNG, WebP, AVIF input formats
 *
 * @example
 * ```typescript
 * import { sip } from '@standardagents/sip';
 *
 * // Process an image
 * const result = await sip.process(imageBuffer, {
 *   maxWidth: 2048,
 *   maxHeight: 2048,
 *   maxBytes: 1.5 * 1024 * 1024,
 *   quality: 85,
 * });
 *
 * // result.data: ArrayBuffer (JPEG)
 * // result.width, result.height: output dimensions
 * // result.mimeType: 'image/jpeg'
 *
 * // Just probe for info
 * const info = sip.probe(imageBuffer);
 * // info.format: 'jpeg' | 'png' | 'webp' | 'avif'
 * // info.width, info.height: original dimensions
 * ```
 */

export * from './types';
export { probe, detectImageFormat } from './probe';
export { process } from './pipeline';
export {
  createResizeState,
  processScanline,
  flushResize,
  calculateTargetDimensions,
  calculateDctScaleFactor,
} from './resize';
export {
  processJpegStreaming,
  isStreamingAvailable,
  initStreaming,
} from './streaming';

// WASM module exports (for advanced usage)
export * from './wasm';

// Convenience namespace
import { process } from './pipeline';
import { probe, detectImageFormat } from './probe';
import { initStreaming, isStreamingAvailable } from './streaming';

export const sip = {
  process,
  probe,
  detectImageFormat,
  initStreaming,
  isStreamingAvailable,
};
