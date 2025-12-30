import type { ResizeState, Scanline } from './types';

/**
 * Create a resize state for scanline-based bilinear interpolation
 *
 * This implements memory-efficient resizing that only needs 2 source rows
 * in memory at any time, regardless of image size.
 */
export function createResizeState(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): ResizeState {
  return {
    srcWidth,
    srcHeight,
    dstWidth,
    dstHeight,
    bufferA: null,
    bufferB: null,
    bufferAY: -1,
    bufferBY: -1,
    currentOutputY: 0,
  };
}

/**
 * Horizontally resize a single scanline using bilinear interpolation
 *
 * @param src - Source scanline (RGB, 3 bytes per pixel)
 * @param srcWidth - Source width
 * @param dstWidth - Destination width
 * @returns Resized scanline
 */
function resizeRowHorizontal(
  src: Uint8Array,
  srcWidth: number,
  dstWidth: number
): Uint8Array {
  const dst = new Uint8Array(dstWidth * 3);
  const xScale = srcWidth / dstWidth;

  for (let dstX = 0; dstX < dstWidth; dstX++) {
    // Map destination X to source X
    const srcXFloat = dstX * xScale;
    const srcX0 = Math.floor(srcXFloat);
    const srcX1 = Math.min(srcX0 + 1, srcWidth - 1);
    const t = srcXFloat - srcX0;
    const invT = 1 - t;

    // Source pixel offsets
    const src0 = srcX0 * 3;
    const src1 = srcX1 * 3;
    const dstOffset = dstX * 3;

    // Bilinear interpolation for RGB
    dst[dstOffset] = Math.round(src[src0] * invT + src[src1] * t);
    dst[dstOffset + 1] = Math.round(src[src0 + 1] * invT + src[src1 + 1] * t);
    dst[dstOffset + 2] = Math.round(src[src0 + 2] * invT + src[src1 + 2] * t);
  }

  return dst;
}

/**
 * Blend two horizontally-resized rows vertically
 *
 * @param rowA - First row (already horizontally resized)
 * @param rowB - Second row (already horizontally resized)
 * @param t - Blend factor (0 = all rowA, 1 = all rowB)
 * @param width - Width in pixels
 * @returns Blended row
 */
function blendRows(
  rowA: Uint8Array,
  rowB: Uint8Array,
  t: number,
  width: number
): Uint8Array {
  const result = new Uint8Array(width * 3);
  const invT = 1 - t;

  for (let i = 0; i < width * 3; i++) {
    result[i] = Math.round(rowA[i] * invT + rowB[i] * t);
  }

  return result;
}

/**
 * Process a source scanline and potentially output resized scanlines
 *
 * This is the core of the streaming resize algorithm. Call this for each
 * source scanline in order (y = 0, 1, 2, ...). It will return output
 * scanlines as they become available.
 *
 * Memory usage: Only keeps 2 horizontally-resized rows in memory at a time
 *
 * @param state - Resize state (mutated)
 * @param srcScanline - Source scanline (RGB, 3 bytes per pixel)
 * @param srcY - Source Y position (must be called in order)
 * @returns Array of output scanlines (may be 0, 1, or more)
 */
export function processScanline(
  state: ResizeState,
  srcScanline: Uint8Array,
  srcY: number
): Scanline[] {
  const { srcWidth, srcHeight, dstWidth, dstHeight } = state;
  const yScale = srcHeight / dstHeight;
  const output: Scanline[] = [];

  // Horizontally resize this source row
  const resizedRow = resizeRowHorizontal(srcScanline, srcWidth, dstWidth);

  // Update buffers - rotate A ← B, B ← new
  state.bufferA = state.bufferB;
  state.bufferAY = state.bufferBY;
  state.bufferB = resizedRow;
  state.bufferBY = srcY;

  // Generate output rows that fall within [bufferAY, bufferBY]
  while (state.currentOutputY < dstHeight) {
    const srcYFloat = state.currentOutputY * yScale;
    const srcYFloor = Math.floor(srcYFloat);
    const srcYCeil = Math.min(srcYFloor + 1, srcHeight - 1);

    // Can we generate this output row with current buffers?
    if (srcYCeil > srcY) {
      // Need more source rows
      break;
    }

    // Handle edge cases at the beginning
    if (state.bufferA === null) {
      // First row - just use bufferB
      output.push({
        data: state.bufferB,
        width: dstWidth,
        y: state.currentOutputY,
      });
      state.currentOutputY++;
      continue;
    }

    // Both buffers available - do bilinear blend
    const t = srcYFloat - srcYFloor;

    // Determine which buffers to use
    let rowA = state.bufferA;
    let rowB = state.bufferB;

    // If srcYFloor matches bufferBY, we need to use bufferB for both
    if (srcYFloor === state.bufferBY) {
      rowA = state.bufferB;
      rowB = state.bufferB;
    } else if (srcYCeil === state.bufferAY) {
      // Edge case: use bufferA for both
      rowA = state.bufferA;
      rowB = state.bufferA;
    }

    const blended = blendRows(rowA, rowB, t, dstWidth);
    output.push({
      data: blended,
      width: dstWidth,
      y: state.currentOutputY,
    });

    state.currentOutputY++;
  }

  return output;
}

/**
 * Flush any remaining output rows after all source rows have been processed
 *
 * @param state - Resize state
 * @returns Remaining output scanlines
 */
export function flushResize(state: ResizeState): Scanline[] {
  const output: Scanline[] = [];

  // Generate any remaining rows using the last available buffer
  while (state.currentOutputY < state.dstHeight) {
    if (state.bufferB === null) break;

    output.push({
      data: state.bufferB,
      width: state.dstWidth,
      y: state.currentOutputY,
    });
    state.currentOutputY++;
  }

  return output;
}

/**
 * Calculate target dimensions while preserving aspect ratio
 *
 * @param srcWidth - Source width
 * @param srcHeight - Source height
 * @param maxWidth - Maximum target width
 * @param maxHeight - Maximum target height
 * @returns Target dimensions
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number; scale: number } {
  const scaleX = maxWidth / srcWidth;
  const scaleY = maxHeight / srcHeight;
  const scale = Math.min(scaleX, scaleY, 1); // Never upscale

  return {
    width: Math.round(srcWidth * scale),
    height: Math.round(srcHeight * scale),
    scale,
  };
}

/**
 * Calculate optimal JPEG DCT scale factor
 *
 * JPEG can decode at 1/1, 1/2, 1/4, or 1/8 scale using DCT scaling.
 * This dramatically reduces memory usage during decode.
 *
 * @param srcWidth - Source image width
 * @param srcHeight - Source image height
 * @param targetWidth - Desired output width
 * @param targetHeight - Desired output height
 * @returns Scale denominator (1, 2, 4, or 8)
 */
export function calculateDctScaleFactor(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number
): 1 | 2 | 4 | 8 {
  // We want the smallest DCT scale that still gives us enough pixels
  // to resize down to target dimensions without upscaling

  const scales: (1 | 2 | 4 | 8)[] = [8, 4, 2, 1];

  for (const scale of scales) {
    const scaledWidth = Math.ceil(srcWidth / scale);
    const scaledHeight = Math.ceil(srcHeight / scale);

    // If scaled dimensions are >= target, this scale works
    if (scaledWidth >= targetWidth && scaledHeight >= targetHeight) {
      return scale;
    }
  }

  // Fallback to no scaling
  return 1;
}
