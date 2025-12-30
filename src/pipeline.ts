import type { ProcessOptions, ProcessResult, ImageFormat } from './types';
import { probe, detectImageFormat } from './probe';
import { createDecoder } from './decoders/simple';
import { createEncoder } from './encoder';
import {
  createResizeState,
  processScanline,
  flushResize,
  calculateTargetDimensions,
} from './resize';
import { processJpegStreaming, processPngStreaming, isStreamingAvailable, initStreaming } from './streaming';
import { loadWasm } from './wasm';

/**
 * Default processing options
 */
const DEFAULT_OPTIONS: Required<ProcessOptions> = {
  maxWidth: 4096,
  maxHeight: 4096,
  maxBytes: 1.5 * 1024 * 1024, // 1.5MB
  quality: 85,
};

/**
 * Process an image: decode, resize, and encode to JPEG
 *
 * For JPEG images, uses ultra-memory-efficient streaming pipeline when WASM
 * is available (DCT scaling + scanline processing). Falls back to full-memory
 * decode for other formats or when WASM is not built.
 *
 * @param input - Image data as ArrayBuffer
 * @param options - Processing options
 * @returns Processed image result
 */
export async function process(
  input: ArrayBuffer,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Probe for format and dimensions
  const probeResult = probe(input);
  if (probeResult.format === 'unknown') {
    throw new Error('Unknown image format');
  }

  const { format, width: srcWidth, height: srcHeight } = probeResult;

  // JPEG: Use WASM streaming pipeline
  if (format === 'jpeg') {
    return await processJpegStreaming(input, opts);
  }

  // PNG: Use WASM streaming pipeline
  if (format === 'png') {
    return await processPngStreaming(input, opts);
  }

  // WebP and AVIF use @jsquash decoder + WASM encoder
  // These formats don't have native WASM decoders yet
  // Ensure WASM is loaded for the encoder
  await loadWasm();

  // Calculate target dimensions
  const target = calculateTargetDimensions(
    srcWidth,
    srcHeight,
    opts.maxWidth,
    opts.maxHeight
  );

  // Decode with @jsquash (full memory decode for WebP/AVIF)
  const decoder = await createDecoder(format, input);
  const { pixels: srcPixels, width: decodedWidth, height: decodedHeight } = await decoder.decode();
  decoder.dispose();

  // Resize using scanline method (still more memory efficient than alternatives)
  const resizedPixels = resizePixelBuffer(
    srcPixels,
    decodedWidth,
    decodedHeight,
    target.width,
    target.height
  );

  // Encode to JPEG
  let quality = opts.quality;
  let jpegData = await encodeToJpeg(resizedPixels, target.width, target.height, quality);

  // If too large, reduce quality and retry
  while (jpegData.byteLength > opts.maxBytes && quality > 45) {
    quality -= 10;
    jpegData = await encodeToJpeg(resizedPixels, target.width, target.height, quality);
  }

  // If still too large, resize further
  if (jpegData.byteLength > opts.maxBytes) {
    const scaleFactor = Math.sqrt(opts.maxBytes / jpegData.byteLength) * 0.9; // 10% margin
    const newWidth = Math.round(target.width * scaleFactor);
    const newHeight = Math.round(target.height * scaleFactor);

    const smallerPixels = resizePixelBuffer(
      resizedPixels,
      target.width,
      target.height,
      newWidth,
      newHeight
    );

    jpegData = await encodeToJpeg(smallerPixels, newWidth, newHeight, quality);

    return {
      data: jpegData,
      width: newWidth,
      height: newHeight,
      mimeType: 'image/jpeg',
      originalFormat: format,
    };
  }

  return {
    data: jpegData,
    width: target.width,
    height: target.height,
    mimeType: 'image/jpeg',
    originalFormat: format,
  };
}

/**
 * Resize a full pixel buffer using the scanline method
 *
 * This is more memory efficient than matrix-based resize because it only
 * keeps 2 rows in memory at a time during the resize operation.
 */
function resizePixelBuffer(
  srcPixels: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8Array {
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    return srcPixels;
  }

  const state = createResizeState(srcWidth, srcHeight, dstWidth, dstHeight);
  const outputRows: Uint8Array[] = new Array(dstHeight);

  // Process each source row
  const srcRowSize = srcWidth * 3;
  for (let y = 0; y < srcHeight; y++) {
    const srcRow = srcPixels.subarray(y * srcRowSize, (y + 1) * srcRowSize);
    const outputScanlines = processScanline(state, srcRow, y);

    for (const scanline of outputScanlines) {
      outputRows[scanline.y] = scanline.data;
    }
  }

  // Flush remaining rows
  const remaining = flushResize(state);
  for (const scanline of remaining) {
    outputRows[scanline.y] = scanline.data;
  }

  // Combine into single buffer
  const dstRowSize = dstWidth * 3;
  const result = new Uint8Array(dstWidth * dstHeight * 3);
  for (let y = 0; y < dstHeight; y++) {
    if (outputRows[y]) {
      result.set(outputRows[y], y * dstRowSize);
    }
  }

  return result;
}

/**
 * Encode RGB pixels to JPEG
 */
async function encodeToJpeg(
  pixels: Uint8Array,
  width: number,
  height: number,
  quality: number
): Promise<ArrayBuffer> {
  const encoder = await createEncoder(width, height, quality);
  const result = await encoder.encode(pixels);
  encoder.dispose();
  return result;
}

/**
 * Get information about an image without decoding it
 */
export { probe, detectImageFormat };
