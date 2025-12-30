/**
 * Supported input image formats
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'unknown';

/**
 * Result from probing an image's format and dimensions
 */
export interface ProbeResult {
  /** Detected format */
  format: ImageFormat;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Whether the image has an alpha channel */
  hasAlpha: boolean;
}

/**
 * Options for image processing
 */
export interface ProcessOptions {
  /** Maximum output width */
  maxWidth?: number;
  /** Maximum output height */
  maxHeight?: number;
  /** Target output size in bytes (quality will be reduced to achieve this) */
  maxBytes?: number;
  /** JPEG quality (1-100, default: 85) */
  quality?: number;
}

/**
 * Result from processing an image
 */
export interface ProcessResult {
  /** Processed image data */
  data: ArrayBuffer;
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Output MIME type (always image/jpeg) */
  mimeType: 'image/jpeg';
  /** Original format that was converted */
  originalFormat: ImageFormat;
}

/**
 * Internal: A single scanline of RGB pixel data
 */
export interface Scanline {
  /** RGB pixel data (width * 3 bytes) */
  data: Uint8Array;
  /** Width in pixels */
  width: number;
  /** Y position in the image (0-indexed) */
  y: number;
}

/**
 * Internal: Decoder state for streaming decode
 */
export interface DecoderState {
  /** Original image width */
  width: number;
  /** Original image height */
  height: number;
  /** Current scanline index */
  currentLine: number;
  /** Scale factor (1, 2, 4, or 8 for JPEG DCT scaling) */
  scaleFactor: number;
  /** Scaled width after DCT scaling */
  scaledWidth: number;
  /** Scaled height after DCT scaling */
  scaledHeight: number;
}

/**
 * Internal: Encoder state for streaming encode
 */
export interface EncoderState {
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** JPEG quality (1-100) */
  quality: number;
  /** Current scanline being encoded */
  currentLine: number;
  /** Accumulated output chunks */
  chunks: Uint8Array[];
}

/**
 * Internal: Resize state for scanline-based bilinear interpolation
 */
export interface ResizeState {
  /** Source width */
  srcWidth: number;
  /** Source height */
  srcHeight: number;
  /** Target width */
  dstWidth: number;
  /** Target height */
  dstHeight: number;
  /** Buffer A (previous source row, already scaled horizontally) */
  bufferA: Uint8Array | null;
  /** Buffer B (current source row, already scaled horizontally) */
  bufferB: Uint8Array | null;
  /** Source Y index for buffer A */
  bufferAY: number;
  /** Source Y index for buffer B */
  bufferBY: number;
  /** Current output Y position */
  currentOutputY: number;
}
