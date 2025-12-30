import type { ImageFormat, ProbeResult } from './types';

/**
 * Magic bytes for format detection
 */
const MAGIC = {
  // JPEG: FFD8FF
  JPEG: [0xff, 0xd8, 0xff],
  // PNG: 89504E47 0D0A1A0A
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  // WebP: RIFF....WEBP
  RIFF: [0x52, 0x49, 0x46, 0x46], // "RIFF"
  WEBP: [0x57, 0x45, 0x42, 0x50], // "WEBP"
  // AVIF: ....ftypavif or ....ftypavis
  FTYP: [0x66, 0x74, 0x79, 0x70], // "ftyp"
};

/**
 * Detect image format from magic bytes
 */
function detectFormat(data: Uint8Array): ImageFormat {
  if (data.length < 12) return 'unknown';

  // Check JPEG
  if (
    data[0] === MAGIC.JPEG[0] &&
    data[1] === MAGIC.JPEG[1] &&
    data[2] === MAGIC.JPEG[2]
  ) {
    return 'jpeg';
  }

  // Check PNG
  if (
    data[0] === MAGIC.PNG[0] &&
    data[1] === MAGIC.PNG[1] &&
    data[2] === MAGIC.PNG[2] &&
    data[3] === MAGIC.PNG[3] &&
    data[4] === MAGIC.PNG[4] &&
    data[5] === MAGIC.PNG[5] &&
    data[6] === MAGIC.PNG[6] &&
    data[7] === MAGIC.PNG[7]
  ) {
    return 'png';
  }

  // Check WebP (RIFF....WEBP)
  if (
    data[0] === MAGIC.RIFF[0] &&
    data[1] === MAGIC.RIFF[1] &&
    data[2] === MAGIC.RIFF[2] &&
    data[3] === MAGIC.RIFF[3] &&
    data[8] === MAGIC.WEBP[0] &&
    data[9] === MAGIC.WEBP[1] &&
    data[10] === MAGIC.WEBP[2] &&
    data[11] === MAGIC.WEBP[3]
  ) {
    return 'webp';
  }

  // Check AVIF (....ftypavif, ....ftypmif1, ....ftypavis, etc.)
  if (
    data[4] === MAGIC.FTYP[0] &&
    data[5] === MAGIC.FTYP[1] &&
    data[6] === MAGIC.FTYP[2] &&
    data[7] === MAGIC.FTYP[3]
  ) {
    // Check for AVIF-related brands
    const brand = String.fromCharCode(data[8], data[9], data[10], data[11]);
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'msf1') {
      return 'avif';
    }
  }

  return 'unknown';
}

/**
 * Read JPEG dimensions from SOF marker
 * JPEG structure: FFD8 (SOI) followed by segments
 * We need to find SOF0 (FFC0), SOF1 (FFC1), or SOF2 (FFC2)
 */
function probeJpeg(data: Uint8Array): { width: number; height: number } | null {
  let offset = 2; // Skip FFD8

  while (offset < data.length - 1) {
    // Each marker starts with FF
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }

    // Skip padding FF bytes
    while (offset < data.length && data[offset] === 0xff) {
      offset++;
    }

    if (offset >= data.length) break;

    const marker = data[offset++];

    // SOF markers (Start of Frame) - various types
    // FFC0-FFC3, FFC5-FFC7, FFC9-FFCB, FFCD-FFCF
    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSOF) {
      if (offset + 7 > data.length) return null;
      // SOF structure: length(2) + precision(1) + height(2) + width(2)
      const height = (data[offset + 3] << 8) | data[offset + 4];
      const width = (data[offset + 5] << 8) | data[offset + 6];
      return { width, height };
    }

    // Skip to next segment
    // Most markers have a length field (except RST, SOI, EOI)
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      // SOI, EOI, RST markers have no length
      continue;
    }

    if (offset + 1 >= data.length) break;
    const segmentLength = (data[offset] << 8) | data[offset + 1];
    offset += segmentLength;
  }

  return null;
}

/**
 * Read PNG dimensions from IHDR chunk
 * PNG structure: 8-byte signature, then chunks (length + type + data + CRC)
 * IHDR is always the first chunk: width(4) + height(4) + ...
 */
function probePng(data: Uint8Array): { width: number; height: number; hasAlpha: boolean } | null {
  if (data.length < 24) return null;

  // Skip 8-byte signature, read first chunk (IHDR)
  // Chunk structure: length(4) + type(4) + data + crc(4)
  const chunkType = String.fromCharCode(data[12], data[13], data[14], data[15]);
  if (chunkType !== 'IHDR') return null;

  // IHDR data starts at offset 16
  const width =
    (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
  const height =
    (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];

  // Color type is at offset 24 (after width + height)
  // 4 = grayscale + alpha, 6 = RGBA
  const colorType = data[25];
  const hasAlpha = colorType === 4 || colorType === 6;

  return { width, height, hasAlpha };
}

/**
 * Read WebP dimensions
 * WebP has multiple formats: VP8 (lossy), VP8L (lossless), VP8X (extended)
 */
function probeWebp(data: Uint8Array): { width: number; height: number; hasAlpha: boolean } | null {
  if (data.length < 30) return null;

  // After RIFF header (12 bytes), check chunk type
  const chunkType = String.fromCharCode(data[12], data[13], data[14], data[15]);

  if (chunkType === 'VP8 ') {
    // Lossy WebP
    // VP8 bitstream starts at offset 20 (after chunk size)
    // Frame tag at offset 23: 3 bytes
    if (data.length < 30) return null;
    // Check for VP8 frame tag (0x9D 0x01 0x2A for keyframe)
    if (data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a) return null;
    // Width and height are 14-bit values
    const width = (data[26] | (data[27] << 8)) & 0x3fff;
    const height = (data[28] | (data[29] << 8)) & 0x3fff;
    return { width, height, hasAlpha: false };
  }

  if (chunkType === 'VP8L') {
    // Lossless WebP
    // Signature byte at offset 20 should be 0x2f
    if (data[20] !== 0x2f) return null;
    // Width and height encoded in next 4 bytes
    const bits = data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    const hasAlpha = ((bits >> 28) & 1) === 1;
    return { width, height, hasAlpha };
  }

  if (chunkType === 'VP8X') {
    // Extended WebP format
    // Flags at offset 20
    const flags = data[20];
    const hasAlpha = (flags & 0x10) !== 0;
    // Width at offset 24 (24-bit, little-endian, +1)
    const width = (data[24] | (data[25] << 8) | (data[26] << 16)) + 1;
    // Height at offset 27 (24-bit, little-endian, +1)
    const height = (data[27] | (data[28] << 8) | (data[29] << 16)) + 1;
    return { width, height, hasAlpha };
  }

  return null;
}

/**
 * Read AVIF dimensions from HEIF/ISOBMFF structure
 * This is complex - AVIF uses HEIF container (ISO Base Media File Format)
 */
function probeAvif(data: Uint8Array): { width: number; height: number } | null {
  // AVIF parsing is complex (ISOBMFF boxes)
  // For now, we'll look for the ispe (image spatial extents) box
  // which contains width and height

  let offset = 0;
  while (offset + 8 <= data.length) {
    // Box structure: size(4) + type(4) + data
    const size =
      (data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3];
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7]
    );

    if (size === 0) break; // Box extends to end of file
    if (size < 8) break; // Invalid box

    // Look for ispe box (can be nested in meta > iprp > ipco)
    if (type === 'ispe' && offset + 20 <= data.length) {
      // ispe: version(1) + flags(3) + width(4) + height(4)
      const width =
        (data[offset + 12] << 24) |
        (data[offset + 13] << 16) |
        (data[offset + 14] << 8) |
        data[offset + 15];
      const height =
        (data[offset + 16] << 24) |
        (data[offset + 17] << 16) |
        (data[offset + 18] << 8) |
        data[offset + 19];
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }

    // Container boxes that we should descend into
    if (type === 'meta' || type === 'iprp' || type === 'ipco') {
      // For meta, skip 4 bytes (version + flags)
      const headerSize = type === 'meta' ? 12 : 8;
      offset += headerSize;
      continue;
    }

    offset += size;
  }

  return null;
}

/**
 * Probe an image to get format and dimensions
 * Only reads the header bytes - very memory efficient
 *
 * @param input - Image data as ArrayBuffer or Uint8Array
 * @returns ProbeResult with format, dimensions, and alpha info
 */
export function probe(input: ArrayBuffer | Uint8Array): ProbeResult {
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;

  const format = detectFormat(data);

  let result: { width: number; height: number; hasAlpha?: boolean } | null = null;

  switch (format) {
    case 'jpeg':
      result = probeJpeg(data);
      break;
    case 'png':
      result = probePng(data);
      break;
    case 'webp':
      result = probeWebp(data);
      break;
    case 'avif':
      result = probeAvif(data);
      break;
  }

  if (!result) {
    return {
      format: 'unknown',
      width: 0,
      height: 0,
      hasAlpha: false,
    };
  }

  return {
    format,
    width: result.width,
    height: result.height,
    hasAlpha: result.hasAlpha ?? false,
  };
}

/**
 * Detect just the format (faster if you don't need dimensions)
 */
export function detectImageFormat(input: ArrayBuffer | Uint8Array): ImageFormat {
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return detectFormat(data);
}
