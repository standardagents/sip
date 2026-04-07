/**
 * SIP WASM Bindings for libjpeg-turbo and libspng
 *
 * Provides memory-efficient image processing with:
 * - Scaled DCT decoding (1/1, 1/2, 1/4, 1/8) for JPEG
 * - Row-by-row PNG decoding
 * - Scanline-by-scanline processing
 * - Streaming JPEG encoding
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stddef.h>
#include <setjmp.h>
#include <jpeglib.h>
#include <spng.h>
#include <emscripten.h>

typedef struct SipChunk {
    uint8_t *data;
    uint32_t size;
    uint32_t offset;
    struct SipChunk *next;
} SipChunk;

#define SIP_MAX_JPEG_COMPONENTS 4

// ============================================================================
// Decoder State
// ============================================================================

typedef struct SipDecoder SipDecoder;
typedef struct SipJpegErrorManager SipJpegErrorManager;

struct SipJpegErrorManager {
    struct jpeg_error_mgr pub;
    jmp_buf setjmp_buffer;
};

typedef struct {
    struct jpeg_source_mgr pub;
    SipDecoder *owner;
    JOCTET eoi_buffer[2];
} SipDecoderSourceManager;

struct SipDecoder {
    struct jpeg_decompress_struct cinfo;
    SipJpegErrorManager jerr;
    JSAMPROW row_buffer;
    uint32_t row_stride;
    uint32_t current_output_row;
    int use_raw_data;
    int raw_color_space;
    int raw_num_components;
    uint32_t raw_lines_per_iMCU;
    uint32_t raw_rows_available;
    uint32_t raw_rows_emitted;
    uint32_t raw_buffer_bytes;
    uint32_t raw_component_rows[SIP_MAX_JPEG_COMPONENTS];
    uint32_t raw_component_widths[SIP_MAX_JPEG_COMPONENTS];
    JSAMPARRAY raw_component_buffers[SIP_MAX_JPEG_COMPONENTS];
    JSAMPLE *raw_component_storage[SIP_MAX_JPEG_COMPONENTS];
    JSAMPARRAY raw_image[SIP_MAX_JPEG_COMPONENTS];
    SipChunk *input_head;
    SipChunk *input_tail;
    uint8_t *input_buffer;
    uint32_t input_capacity;
    uint8_t *buffered_source_data;
    uint32_t buffered_source_size;
    int using_buffered_source;
    uint32_t queued_input_bytes;
    uint32_t pending_skip;
    int input_finished;
    SipDecoderSourceManager source_mgr;
    int initialized;
    int header_read;
    int decompressing;
};

// ============================================================================
// Encoder State
// ============================================================================

typedef struct SipEncoder SipEncoder;

typedef struct {
    struct jpeg_destination_mgr pub;
    SipEncoder *owner;
} SipEncoderDestinationManager;

struct SipEncoder {
    struct jpeg_compress_struct cinfo;
    SipJpegErrorManager jerr;
    uint8_t *output_buffer;
    uint32_t output_capacity;
    uint32_t total_output_size;
    uint32_t queued_output_bytes;
    SipChunk *output_head;
    SipChunk *output_tail;
    JSAMPROW row_buffer;
    SipEncoderDestinationManager dest_mgr;
    int initialized;
    int compressing;
};

// ============================================================================
// Error Handling
// ============================================================================

static char last_error[256] = "";

static void sip_error_exit(j_common_ptr cinfo) {
    SipJpegErrorManager *err = (SipJpegErrorManager *)cinfo->err;
    (*cinfo->err->format_message)(cinfo, last_error);
    longjmp(err->setjmp_buffer, 1);
}

static void sip_emit_message(j_common_ptr cinfo, int msg_level) {
    if (msg_level < 0) {
        (*cinfo->err->format_message)(cinfo, last_error);
        cinfo->err->num_warnings++;
    }
}

EMSCRIPTEN_KEEPALIVE
const char* sip_get_error() {
    return last_error;
}

// ============================================================================
// Shared Helpers
// ============================================================================

static void sip_free_chunks(SipChunk **head, SipChunk **tail) {
    SipChunk *chunk = *head;
    while (chunk) {
        SipChunk *next = chunk->next;
        free(chunk->data);
        free(chunk);
        chunk = next;
    }

    *head = NULL;
    *tail = NULL;
}

static uint8_t sip_clamp_u8(int value) {
    if (value < 0) {
        return 0;
    }
    if (value > 255) {
        return 255;
    }
    return (uint8_t)value;
}

static void sip_decoder_free_raw_buffers(SipDecoder *dec) {
    for (int i = 0; i < SIP_MAX_JPEG_COMPONENTS; i++) {
        if (dec->raw_component_buffers[i]) {
            free(dec->raw_component_buffers[i]);
            dec->raw_component_buffers[i] = NULL;
        }
        if (dec->raw_component_storage[i]) {
            free(dec->raw_component_storage[i]);
            dec->raw_component_storage[i] = NULL;
        }
        dec->raw_image[i] = NULL;
        dec->raw_component_rows[i] = 0;
        dec->raw_component_widths[i] = 0;
    }

    dec->raw_buffer_bytes = 0;
    dec->raw_rows_available = 0;
    dec->raw_rows_emitted = 0;
    dec->raw_lines_per_iMCU = 0;
    dec->raw_num_components = 0;
    dec->raw_color_space = 0;
    dec->use_raw_data = 0;
}

static int sip_decoder_supports_raw_mode(SipDecoder *dec) {
    if (dec->cinfo.num_components == 3 &&
        (dec->cinfo.jpeg_color_space == JCS_YCbCr ||
         dec->cinfo.jpeg_color_space == JCS_RGB)) {
        return 1;
    }

    return 0;
}

static int sip_decoder_alloc_raw_buffers(SipDecoder *dec) {
    if (dec->cinfo.num_components < 1 ||
        dec->cinfo.num_components > SIP_MAX_JPEG_COMPONENTS) {
        return -1;
    }

    dec->raw_num_components = dec->cinfo.num_components;
    dec->raw_color_space = dec->cinfo.jpeg_color_space;
    dec->raw_lines_per_iMCU =
        (uint32_t)(dec->cinfo.max_v_samp_factor * dec->cinfo.min_DCT_scaled_size);
    dec->raw_rows_available = 0;
    dec->raw_rows_emitted = 0;
    dec->raw_buffer_bytes = 0;

    for (int i = 0; i < dec->raw_num_components; i++) {
        jpeg_component_info *comp = &dec->cinfo.comp_info[i];
        uint32_t rows = (uint32_t)(comp->v_samp_factor * comp->DCT_scaled_size);
        uint32_t stride = (uint32_t)(comp->width_in_blocks * comp->DCT_scaled_size);
        size_t storage_size = (size_t)rows * stride;

        dec->raw_component_rows[i] = rows;
        dec->raw_component_widths[i] = (uint32_t)comp->downsampled_width;

        dec->raw_component_storage[i] = (JSAMPLE *)malloc(storage_size);
        dec->raw_component_buffers[i] = (JSAMPARRAY)malloc(sizeof(JSAMPROW) * rows);
        if (!dec->raw_component_storage[i] || !dec->raw_component_buffers[i]) {
            snprintf(last_error, sizeof(last_error), "Failed to allocate JPEG raw buffers");
            sip_decoder_free_raw_buffers(dec);
            return -1;
        }

        for (uint32_t row = 0; row < rows; row++) {
            dec->raw_component_buffers[i][row] =
                dec->raw_component_storage[i] + ((size_t)row * stride);
        }

        dec->raw_image[i] = dec->raw_component_buffers[i];
        dec->raw_buffer_bytes += (uint32_t)storage_size;
    }

    dec->use_raw_data = 1;
    return 0;
}

static void sip_decoder_render_raw_scanline(SipDecoder *dec, uint32_t local_y) {
    uint32_t output_width = (uint32_t)dec->cinfo.output_width;
    uint8_t *dst = dec->row_buffer;

    if (dec->raw_color_space == JCS_GRAYSCALE) {
        uint32_t y_row = local_y;
        uint32_t y_width = dec->raw_component_widths[0];
        JSAMPROW y_plane = dec->raw_component_buffers[0][y_row];
        for (uint32_t x = 0; x < output_width; x++) {
            uint32_t y_x = (uint32_t)(((uint64_t)x * y_width) / output_width);
            if (y_x >= y_width) {
                y_x = y_width - 1;
            }
            uint8_t y = y_plane[y_x];
            uint32_t dst_x = x * 3;
            dst[dst_x] = y;
            dst[dst_x + 1] = y;
            dst[dst_x + 2] = y;
        }
        return;
    }

    uint32_t row0 = (uint32_t)(((uint64_t)local_y * dec->raw_component_rows[0]) / dec->raw_lines_per_iMCU);
    uint32_t row1 = (uint32_t)(((uint64_t)local_y * dec->raw_component_rows[1]) / dec->raw_lines_per_iMCU);
    uint32_t row2 = (uint32_t)(((uint64_t)local_y * dec->raw_component_rows[2]) / dec->raw_lines_per_iMCU);
    if (row0 >= dec->raw_component_rows[0]) row0 = dec->raw_component_rows[0] - 1;
    if (row1 >= dec->raw_component_rows[1]) row1 = dec->raw_component_rows[1] - 1;
    if (row2 >= dec->raw_component_rows[2]) row2 = dec->raw_component_rows[2] - 1;

    JSAMPROW plane0 = dec->raw_component_buffers[0][row0];
    JSAMPROW plane1 = dec->raw_component_buffers[1][row1];
    JSAMPROW plane2 = dec->raw_component_buffers[2][row2];
    uint32_t width0 = dec->raw_component_widths[0];
    uint32_t width1 = dec->raw_component_widths[1];
    uint32_t width2 = dec->raw_component_widths[2];

    for (uint32_t x = 0; x < output_width; x++) {
        uint32_t x0 = (uint32_t)(((uint64_t)x * width0) / output_width);
        uint32_t x1 = (uint32_t)(((uint64_t)x * width1) / output_width);
        uint32_t x2 = (uint32_t)(((uint64_t)x * width2) / output_width);
        if (x0 >= width0) x0 = width0 - 1;
        if (x1 >= width1) x1 = width1 - 1;
        if (x2 >= width2) x2 = width2 - 1;

        uint32_t dst_x = x * 3;

        if (dec->raw_color_space == JCS_RGB) {
            dst[dst_x] = plane0[x0];
            dst[dst_x + 1] = plane1[x1];
            dst[dst_x + 2] = plane2[x2];
            continue;
        }

        int y = plane0[x0];
        int cb = plane1[x1] - 128;
        int cr = plane2[x2] - 128;
        int r = y + ((91881 * cr) >> 16);
        int g = y - ((22554 * cb + 46802 * cr) >> 16);
        int b = y + ((116130 * cb) >> 16);

        dst[dst_x] = sip_clamp_u8(r);
        dst[dst_x + 1] = sip_clamp_u8(g);
        dst[dst_x + 2] = sip_clamp_u8(b);
    }
}

// ============================================================================
// JPEG Decoder Streaming Source Manager
// ============================================================================

#define SIP_DECODER_INPUT_CAPACITY 65536

static void sip_decoder_use_stream_source(SipDecoder *dec) {
    dec->cinfo.src = (struct jpeg_source_mgr *)&dec->source_mgr;
    dec->source_mgr.pub.bytes_in_buffer = 0;
    dec->source_mgr.pub.next_input_byte = NULL;
    dec->using_buffered_source = 0;
}

static int sip_decoder_queue_input(SipDecoder *dec, const uint8_t *data, uint32_t size) {
    if (!size) {
        return 0;
    }

    SipChunk *chunk = (SipChunk *)calloc(1, sizeof(SipChunk));
    if (!chunk) {
        snprintf(last_error, sizeof(last_error), "Failed to allocate decoder input chunk");
        return -1;
    }

    chunk->data = (uint8_t *)malloc(size);
    if (!chunk->data) {
        free(chunk);
        snprintf(last_error, sizeof(last_error), "Failed to allocate decoder input bytes");
        return -1;
    }

    memcpy(chunk->data, data, size);
    chunk->size = size;

    if (dec->input_tail) {
        dec->input_tail->next = chunk;
    } else {
        dec->input_head = chunk;
    }
    dec->input_tail = chunk;
    dec->queued_input_bytes += size;

    return 0;
}

static int sip_decoder_ensure_input_capacity(SipDecoder *dec, size_t required_size) {
    if (required_size <= dec->input_capacity) {
        return 0;
    }

    uint32_t old_capacity = dec->input_capacity;
    uint8_t *old_buffer = dec->input_buffer;
    size_t next_offset = 0;

    if (dec->source_mgr.pub.next_input_byte &&
        dec->source_mgr.pub.next_input_byte != dec->source_mgr.eoi_buffer &&
        dec->source_mgr.pub.next_input_byte >= old_buffer &&
        dec->source_mgr.pub.next_input_byte <= old_buffer + old_capacity) {
        next_offset = (size_t)(dec->source_mgr.pub.next_input_byte - old_buffer);
    }

    uint32_t new_capacity = old_capacity;
    while (new_capacity < required_size) {
        uint32_t next_capacity = new_capacity * 2;
        if (next_capacity <= new_capacity) {
            new_capacity = (uint32_t)required_size;
            break;
        }
        new_capacity = next_capacity;
    }

    uint8_t *resized = (uint8_t *)realloc(dec->input_buffer, new_capacity);
    if (!resized) {
        snprintf(last_error, sizeof(last_error), "Failed to grow JPEG input buffer");
        return -1;
    }

    dec->input_buffer = resized;
    dec->input_capacity = new_capacity;

    if (dec->source_mgr.pub.next_input_byte &&
        dec->source_mgr.pub.next_input_byte != dec->source_mgr.eoi_buffer) {
        dec->source_mgr.pub.next_input_byte = dec->input_buffer + next_offset;
    }

    return 0;
}

static uint32_t sip_decoder_pull_queued_bytes(SipDecoder *dec, uint8_t *dest, uint32_t capacity) {
    uint32_t written = 0;

    while (dec->input_head && written < capacity) {
        SipChunk *chunk = dec->input_head;
        uint32_t remaining = chunk->size - chunk->offset;
        uint32_t to_copy = remaining;
        if (to_copy > capacity - written) {
            to_copy = capacity - written;
        }

        memcpy(dest + written, chunk->data + chunk->offset, to_copy);
        written += to_copy;
        chunk->offset += to_copy;
        dec->queued_input_bytes -= to_copy;

        if (chunk->offset >= chunk->size) {
            dec->input_head = chunk->next;
            if (!dec->input_head) {
                dec->input_tail = NULL;
            }
            free(chunk->data);
            free(chunk);
        }
    }

    return written;
}

static uint32_t sip_decoder_compact_input_buffer(SipDecoder *dec) {
    const JOCTET *next = dec->source_mgr.pub.next_input_byte;
    size_t bytes = dec->source_mgr.pub.bytes_in_buffer;

    if (!next || next == dec->source_mgr.eoi_buffer || bytes == 0) {
        dec->source_mgr.pub.next_input_byte = dec->input_buffer;
        dec->source_mgr.pub.bytes_in_buffer = 0;
        return 0;
    }

    if (next != dec->input_buffer) {
        memmove(dec->input_buffer, next, bytes);
    }

    dec->source_mgr.pub.next_input_byte = dec->input_buffer;
    dec->source_mgr.pub.bytes_in_buffer = bytes;
    return (uint32_t)bytes;
}

static void sip_decoder_init_source(j_decompress_ptr cinfo) {
    SipDecoderSourceManager *src = (SipDecoderSourceManager *)cinfo->src;
    if (!src->pub.next_input_byte && src->pub.bytes_in_buffer == 0) {
        src->pub.next_input_byte = src->owner->input_buffer;
    }
}

static boolean sip_decoder_fill_input_buffer(j_decompress_ptr cinfo) {
    SipDecoderSourceManager *src = (SipDecoderSourceManager *)cinfo->src;
    SipDecoder *dec = src->owner;

    for (;;) {
        while (dec->pending_skip > 0) {
            if (src->pub.bytes_in_buffer == 0) {
                break;
            }

            if (dec->pending_skip >= src->pub.bytes_in_buffer) {
                dec->pending_skip -= (uint32_t)src->pub.bytes_in_buffer;
                src->pub.next_input_byte += src->pub.bytes_in_buffer;
                src->pub.bytes_in_buffer = 0;
                continue;
            }

            src->pub.next_input_byte += dec->pending_skip;
            src->pub.bytes_in_buffer -= dec->pending_skip;
            dec->pending_skip = 0;
        }

        if (src->pub.bytes_in_buffer > 0) {
            return TRUE;
        }

        uint32_t preserved = sip_decoder_compact_input_buffer(dec);
        uint32_t available = dec->input_capacity - preserved;
        uint32_t pulled = sip_decoder_pull_queued_bytes(
            dec,
            dec->input_buffer + preserved,
            available
        );

        if (preserved + pulled > 0) {
            src->pub.next_input_byte = dec->input_buffer;
            src->pub.bytes_in_buffer = preserved + pulled;
            continue;
        }

        if (!dec->input_finished) {
            return FALSE;
        }

        src->eoi_buffer[0] = (JOCTET)0xFF;
        src->eoi_buffer[1] = (JOCTET)JPEG_EOI;
        src->pub.next_input_byte = src->eoi_buffer;
        src->pub.bytes_in_buffer = 2;
        return TRUE;
    }
}

static void sip_decoder_skip_input_data(j_decompress_ptr cinfo, long num_bytes) {
    SipDecoderSourceManager *src = (SipDecoderSourceManager *)cinfo->src;
    SipDecoder *dec = src->owner;

    if (num_bytes <= 0) {
        return;
    }

    if (num_bytes >= (long)src->pub.bytes_in_buffer) {
        num_bytes -= (long)src->pub.bytes_in_buffer;
        src->pub.next_input_byte += src->pub.bytes_in_buffer;
        src->pub.bytes_in_buffer = 0;
        dec->pending_skip += (uint32_t)num_bytes;
        return;
    }

    src->pub.next_input_byte += num_bytes;
    src->pub.bytes_in_buffer -= (size_t)num_bytes;
}

static void sip_decoder_term_source(j_decompress_ptr cinfo) {
    (void)cinfo;
}

// ============================================================================
// JPEG Encoder Streaming Destination Manager
// ============================================================================

static int sip_encoder_queue_chunk(SipEncoder *enc, const uint8_t *data, uint32_t size) {
    if (!size) {
        return 0;
    }

    SipChunk *chunk = (SipChunk *)calloc(1, sizeof(SipChunk));
    if (!chunk) {
        snprintf(last_error, sizeof(last_error), "Failed to allocate encoder chunk");
        return -1;
    }

    chunk->data = (uint8_t *)malloc(size);
    if (!chunk->data) {
        free(chunk);
        snprintf(last_error, sizeof(last_error), "Failed to allocate encoder chunk bytes");
        return -1;
    }

    memcpy(chunk->data, data, size);
    chunk->size = size;

    if (enc->output_tail) {
        enc->output_tail->next = chunk;
    } else {
        enc->output_head = chunk;
    }
    enc->output_tail = chunk;
    enc->queued_output_bytes += size;
    enc->total_output_size += size;

    return 0;
}

static void sip_encoder_init_destination(j_compress_ptr cinfo) {
    SipEncoderDestinationManager *dest = (SipEncoderDestinationManager *)cinfo->dest;
    SipEncoder *enc = dest->owner;
    dest->pub.next_output_byte = enc->output_buffer;
    dest->pub.free_in_buffer = enc->output_capacity;
}

static boolean sip_encoder_empty_output_buffer(j_compress_ptr cinfo) {
    SipEncoderDestinationManager *dest = (SipEncoderDestinationManager *)cinfo->dest;
    SipEncoder *enc = dest->owner;

    if (sip_encoder_queue_chunk(enc, enc->output_buffer, enc->output_capacity) != 0) {
        return FALSE;
    }

    dest->pub.next_output_byte = enc->output_buffer;
    dest->pub.free_in_buffer = enc->output_capacity;
    return TRUE;
}

static void sip_encoder_term_destination(j_compress_ptr cinfo) {
    SipEncoderDestinationManager *dest = (SipEncoderDestinationManager *)cinfo->dest;
    SipEncoder *enc = dest->owner;
    uint32_t used = enc->output_capacity - (uint32_t)dest->pub.free_in_buffer;

    if (used > 0) {
        sip_encoder_queue_chunk(enc, enc->output_buffer, used);
    }
}

// ============================================================================
// Decoder Functions
// ============================================================================

/**
 * Create a new decoder instance
 */
EMSCRIPTEN_KEEPALIVE
SipDecoder* sip_decoder_create() {
    SipDecoder* dec = (SipDecoder*)calloc(1, sizeof(SipDecoder));
    if (!dec) return NULL;

    dec->input_capacity = SIP_DECODER_INPUT_CAPACITY;
    dec->input_buffer = (uint8_t *)malloc(dec->input_capacity);
    if (!dec->input_buffer) {
        free(dec);
        return NULL;
    }

    dec->cinfo.err = jpeg_std_error(&dec->jerr.pub);
    dec->jerr.pub.error_exit = sip_error_exit;
    dec->jerr.pub.emit_message = sip_emit_message;

    if (setjmp(dec->jerr.setjmp_buffer)) {
        if (dec->input_buffer) {
            free(dec->input_buffer);
        }
        free(dec);
        return NULL;
    }
    jpeg_create_decompress(&dec->cinfo);
    dec->source_mgr.owner = dec;
    dec->source_mgr.pub.init_source = sip_decoder_init_source;
    dec->source_mgr.pub.fill_input_buffer = sip_decoder_fill_input_buffer;
    dec->source_mgr.pub.skip_input_data = sip_decoder_skip_input_data;
    dec->source_mgr.pub.resync_to_restart = jpeg_resync_to_restart;
    dec->source_mgr.pub.term_source = sip_decoder_term_source;
    sip_decoder_use_stream_source(dec);
    dec->initialized = 1;

    return dec;
}

/**
 * Push more input bytes into the decoder
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_push_input(SipDecoder* dec, const uint8_t* data, uint32_t size, int is_final) {
    if (!dec || !dec->initialized) return -1;
    if (setjmp(dec->jerr.setjmp_buffer)) return -1;

    if (dec->using_buffered_source) {
        if (dec->buffered_source_data) {
            free(dec->buffered_source_data);
            dec->buffered_source_data = NULL;
        }
        dec->buffered_source_size = 0;
        sip_decoder_use_stream_source(dec);
    }

    if (size > 0) {
        if (sip_decoder_ensure_input_capacity(dec, dec->input_capacity) != 0) {
            return -1;
        }
        if (sip_decoder_queue_input(dec, data, size) != 0) {
            return -1;
        }
    } else if (!dec->source_mgr.pub.next_input_byte ||
               dec->source_mgr.pub.next_input_byte == dec->source_mgr.eoi_buffer) {
        dec->source_mgr.pub.next_input_byte = dec->input_buffer;
    }

    if (is_final) {
        dec->input_finished = 1;
    }

    return 0;
}

/**
 * Set full input data for decoder (buffered compatibility helper)
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_set_source(SipDecoder* dec, const uint8_t* data, uint32_t size) {
    if (!dec || !dec->initialized) return -1;
    if (setjmp(dec->jerr.setjmp_buffer)) return -1;
    sip_free_chunks(&dec->input_head, &dec->input_tail);
    dec->queued_input_bytes = 0;
    dec->input_finished = 0;
    dec->pending_skip = 0;
    sip_decoder_use_stream_source(dec);

    if (dec->buffered_source_data) {
        free(dec->buffered_source_data);
        dec->buffered_source_data = NULL;
    }

    if (sip_decoder_ensure_input_capacity(dec, size) != 0) {
        return -1;
    }

    memcpy(dec->input_buffer, data, size);
    dec->source_mgr.pub.next_input_byte = dec->input_buffer;
    dec->source_mgr.pub.bytes_in_buffer = size;
    dec->buffered_source_size = size;
    dec->input_finished = 1;
    return 0;
}

/**
 * Read JPEG header and return dimensions
 * Returns: 0 on success, 1 if more input is needed, -1 on error
 * After success, use sip_decoder_get_width/height to get dimensions
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_read_header(SipDecoder* dec) {
    if (!dec || !dec->initialized) return -1;
    if (setjmp(dec->jerr.setjmp_buffer)) return -1;

    int result = jpeg_read_header(&dec->cinfo, TRUE);
    if (result == JPEG_SUSPENDED) {
        return 1;
    }

    if (result != JPEG_HEADER_OK) {
        return -1;
    }

    dec->header_read = 1;
    return 0;
}

/**
 * Get original image width
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_width(SipDecoder* dec) {
    if (!dec || !dec->header_read) return 0;
    return dec->cinfo.image_width;
}

/**
 * Get original image height
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_height(SipDecoder* dec) {
    if (!dec || !dec->header_read) return 0;
    return dec->cinfo.image_height;
}

/**
 * Set scale factor for DCT-based scaling during decode
 * scale_denom: 1, 2, 4, or 8 (1/1, 1/2, 1/4, 1/8 scale)
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_set_scale(SipDecoder* dec, uint32_t scale_denom) {
    if (!dec || !dec->header_read) return -1;
    if (scale_denom != 1 && scale_denom != 2 && scale_denom != 4 && scale_denom != 8) {
        return -1;
    }
    if (setjmp(dec->jerr.setjmp_buffer)) return -1;

    dec->cinfo.scale_num = 1;
    dec->cinfo.scale_denom = scale_denom;

    // Calculate output dimensions with scaling
    jpeg_calc_output_dimensions(&dec->cinfo);

    return 0;
}

/**
 * Get scaled output width (after set_scale)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_output_width(SipDecoder* dec) {
    if (!dec || !dec->header_read) return 0;
    return dec->cinfo.output_width;
}

/**
 * Get scaled output height (after set_scale)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_output_height(SipDecoder* dec) {
    if (!dec || !dec->header_read) return 0;
    return dec->cinfo.output_height;
}

/**
 * Start decompression
 * Must be called after set_scale (or will use 1:1)
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_start(SipDecoder* dec) {
    if (!dec || !dec->header_read) return -1;
    if (dec->decompressing) return 0;
    if (setjmp(dec->jerr.setjmp_buffer)) return -1;

    dec->use_raw_data = sip_decoder_supports_raw_mode(dec);
    if (dec->use_raw_data) {
        dec->cinfo.raw_data_out = TRUE;
    } else {
        // Force RGB output for fallback scanline decode.
        dec->cinfo.out_color_space = JCS_RGB;
        dec->cinfo.do_fancy_upsampling = FALSE;
        dec->cinfo.do_block_smoothing = FALSE;
    }

    if (!jpeg_start_decompress(&dec->cinfo)) {
        return 1;
    }

    // Allocate row buffer
    int row_stride = dec->cinfo.output_width * dec->cinfo.output_components;
    dec->row_stride = (uint32_t)row_stride;
    dec->row_buffer = (JSAMPROW)malloc(row_stride);
    if (!dec->row_buffer) {
        return -1;
    }

    if (dec->use_raw_data && sip_decoder_alloc_raw_buffers(dec) != 0) {
        return -1;
    }

    dec->decompressing = 1;
    dec->current_output_row = 0;
    return 0;
}

/**
 * Get pointer to internal row buffer
 * Buffer contains RGB data for one scanline after read_scanline
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* sip_decoder_get_row_buffer(SipDecoder* dec) {
    if (!dec || !dec->decompressing) return NULL;
    return dec->row_buffer;
}

/**
 * Read one scanline into internal buffer
 * Returns: 1 if scanline was read, 0 if done, 2 if more input is needed, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_read_scanline(SipDecoder* dec) {
    if (!dec || !dec->decompressing) return -1;
    if (setjmp(dec->jerr.setjmp_buffer)) return -1;

    if (dec->current_output_row >= dec->cinfo.output_height) {
        return 0; // Done
    }

    if (dec->use_raw_data) {
        if (dec->raw_rows_emitted >= dec->raw_rows_available) {
            JDIMENSION lines = jpeg_read_raw_data(
                &dec->cinfo,
                dec->raw_image,
                dec->raw_lines_per_iMCU
            );
            if (lines == 0) {
                return 2;
            }

            dec->raw_rows_available = dec->raw_lines_per_iMCU;
            if (dec->raw_rows_available > (uint32_t)(dec->cinfo.output_height - dec->current_output_row)) {
                dec->raw_rows_available =
                    (uint32_t)(dec->cinfo.output_height - dec->current_output_row);
            }
            dec->raw_rows_emitted = 0;
        }

        sip_decoder_render_raw_scanline(dec, dec->raw_rows_emitted);
        dec->raw_rows_emitted++;
        dec->current_output_row++;
        return 1;
    }

    JSAMPROW rows[1];
    rows[0] = dec->row_buffer;
    JDIMENSION lines = jpeg_read_scanlines(&dec->cinfo, rows, 1);
    if (lines == 0) {
        return 2;
    }

    dec->current_output_row++;
    return 1;
}

/**
 * Get current scanline number (0-indexed)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_scanline(SipDecoder* dec) {
    if (!dec || !dec->decompressing) return 0;
    return dec->current_output_row;
}

/**
 * Finish decompression and clean up
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_finish(SipDecoder* dec) {
    if (!dec) return -1;

    if (dec->decompressing) {
        if (setjmp(dec->jerr.setjmp_buffer)) return -1;
        if (!jpeg_finish_decompress(&dec->cinfo)) {
            return 1;
        }
        dec->decompressing = 0;
    }

    if (dec->row_buffer) {
        free(dec->row_buffer);
        dec->row_buffer = NULL;
    }

    sip_decoder_free_raw_buffers(dec);
    dec->current_output_row = 0;
    dec->row_stride = 0;

    return 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_buffered_input_size(SipDecoder* dec) {
    if (!dec) return 0;
    if (dec->using_buffered_source) {
        return dec->buffered_source_size;
    }
    return dec->queued_input_bytes + (uint32_t)dec->source_mgr.pub.bytes_in_buffer;
}

EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_working_size(SipDecoder* dec) {
    if (!dec) return 0;
    return dec->row_stride + dec->raw_buffer_bytes;
}

EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_input_offset(SipDecoder* dec) {
    if (!dec || !dec->source_mgr.pub.next_input_byte) return 0;
    if (dec->source_mgr.pub.next_input_byte == dec->source_mgr.eoi_buffer) return 0;
    if (dec->source_mgr.pub.next_input_byte < dec->input_buffer ||
        dec->source_mgr.pub.next_input_byte > dec->input_buffer + dec->input_capacity) {
        return 0;
    }
    return (uint32_t)(dec->source_mgr.pub.next_input_byte - dec->input_buffer);
}

EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_bytes_in_buffer(SipDecoder* dec) {
    if (!dec) return 0;
    return (uint32_t)dec->source_mgr.pub.bytes_in_buffer;
}

EMSCRIPTEN_KEEPALIVE
int sip_decoder_get_unread_marker(SipDecoder* dec) {
    if (!dec) return 0;
    return dec->cinfo.unread_marker;
}

/**
 * Destroy decoder and free all resources
 */
EMSCRIPTEN_KEEPALIVE
void sip_decoder_destroy(SipDecoder* dec) {
    if (!dec) return;

    sip_decoder_finish(dec);

    sip_free_chunks(&dec->input_head, &dec->input_tail);
    dec->queued_input_bytes = 0;

    if (dec->buffered_source_data) {
        free(dec->buffered_source_data);
        dec->buffered_source_data = NULL;
    }

    if (dec->input_buffer) {
        free(dec->input_buffer);
        dec->input_buffer = NULL;
    }

    if (dec->initialized) {
        jpeg_destroy_decompress(&dec->cinfo);
        dec->initialized = 0;
    }

    free(dec);
}

// ============================================================================
// PNG Decoder State
// ============================================================================

typedef struct {
    spng_ctx *ctx;
    uint8_t *row_buffer;
    uint32_t width;
    uint32_t height;
    uint8_t bit_depth;
    uint8_t color_type;
    uint8_t has_alpha;
    uint32_t row_stride;
    uint32_t current_row;
    int initialized;
    int decoding;
} SipPngDecoder;

// ============================================================================
// PNG Decoder Functions
// ============================================================================

/**
 * Create a new PNG decoder instance
 */
EMSCRIPTEN_KEEPALIVE
SipPngDecoder* sip_png_decoder_create() {
    SipPngDecoder* dec = (SipPngDecoder*)calloc(1, sizeof(SipPngDecoder));
    if (!dec) return NULL;

    dec->ctx = spng_ctx_new(0);
    if (!dec->ctx) {
        free(dec);
        return NULL;
    }

    dec->initialized = 1;
    return dec;
}

/**
 * Set input data for PNG decoder
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_set_source(SipPngDecoder* dec, const uint8_t* data, uint32_t size) {
    if (!dec || !dec->initialized) return -1;

    int ret = spng_set_png_buffer(dec->ctx, data, size);
    if (ret != 0) {
        snprintf(last_error, sizeof(last_error), "spng_set_png_buffer failed: %d", ret);
        return -1;
    }

    return 0;
}

/**
 * Read PNG header and parse dimensions
 * Returns: 0 on success, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_read_header(SipPngDecoder* dec) {
    if (!dec || !dec->initialized) return -1;

    struct spng_ihdr ihdr;
    int ret = spng_get_ihdr(dec->ctx, &ihdr);
    if (ret != 0) {
        snprintf(last_error, sizeof(last_error), "spng_get_ihdr failed: %d", ret);
        return -1;
    }

    dec->width = ihdr.width;
    dec->height = ihdr.height;
    dec->bit_depth = ihdr.bit_depth;
    dec->color_type = ihdr.color_type;

    // Determine if image has alpha
    dec->has_alpha = (ihdr.color_type == SPNG_COLOR_TYPE_GRAYSCALE_ALPHA ||
                      ihdr.color_type == SPNG_COLOR_TYPE_TRUECOLOR_ALPHA);

    return 0;
}

/**
 * Get PNG image width
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_png_decoder_get_width(SipPngDecoder* dec) {
    if (!dec) return 0;
    return dec->width;
}

/**
 * Get PNG image height
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_png_decoder_get_height(SipPngDecoder* dec) {
    if (!dec) return 0;
    return dec->height;
}

/**
 * Check if PNG has alpha channel
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_has_alpha(SipPngDecoder* dec) {
    if (!dec) return 0;
    return dec->has_alpha;
}

/**
 * Start PNG decoding (progressive row-by-row mode)
 * Output format is always RGB (3 bytes per pixel)
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_start(SipPngDecoder* dec) {
    if (!dec || !dec->initialized) return -1;

    // We decode to RGB format (SPNG_FMT_RGB8)
    int ret = spng_decode_image(dec->ctx, NULL, 0, SPNG_FMT_RGB8, SPNG_DECODE_PROGRESSIVE);
    if (ret != 0 && ret != SPNG_EOI) {
        snprintf(last_error, sizeof(last_error), "spng_decode_image init failed: %d", ret);
        return -1;
    }

    // Calculate row stride (RGB = 3 bytes per pixel)
    dec->row_stride = dec->width * 3;

    // Allocate row buffer
    dec->row_buffer = (uint8_t*)malloc(dec->row_stride);
    if (!dec->row_buffer) {
        snprintf(last_error, sizeof(last_error), "Failed to allocate row buffer");
        return -1;
    }

    dec->current_row = 0;
    dec->decoding = 1;

    return 0;
}

/**
 * Get pointer to internal row buffer
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* sip_png_decoder_get_row_buffer(SipPngDecoder* dec) {
    if (!dec || !dec->decoding) return NULL;
    return dec->row_buffer;
}

/**
 * Read one row of PNG data into internal buffer
 * Returns: 1 if row was read, 0 if done, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_read_row(SipPngDecoder* dec) {
    if (!dec || !dec->decoding) return -1;

    if (dec->current_row >= dec->height) {
        return 0; // Done
    }

    struct spng_row_info row_info;
    int ret = spng_get_row_info(dec->ctx, &row_info);
    if (ret != 0 && ret != SPNG_EOI) {
        snprintf(last_error, sizeof(last_error), "spng_get_row_info failed: %d", ret);
        return -1;
    }

    ret = spng_decode_row(dec->ctx, dec->row_buffer, dec->row_stride);
    if (ret != 0 && ret != SPNG_EOI) {
        snprintf(last_error, sizeof(last_error), "spng_decode_row failed: %d", ret);
        return -1;
    }

    dec->current_row++;

    // Return 0 if we've read all rows
    if (dec->current_row >= dec->height || ret == SPNG_EOI) {
        return 0;
    }

    return 1;
}

/**
 * Get current row number (0-indexed)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_png_decoder_get_row(SipPngDecoder* dec) {
    if (!dec) return 0;
    return dec->current_row;
}

/**
 * Finish PNG decoding
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_finish(SipPngDecoder* dec) {
    if (!dec) return -1;

    if (dec->row_buffer) {
        free(dec->row_buffer);
        dec->row_buffer = NULL;
    }

    dec->decoding = 0;
    return 0;
}

/**
 * Destroy PNG decoder and free all resources
 */
EMSCRIPTEN_KEEPALIVE
void sip_png_decoder_destroy(SipPngDecoder* dec) {
    if (!dec) return;

    sip_png_decoder_finish(dec);

    if (dec->ctx) {
        spng_ctx_free(dec->ctx);
        dec->ctx = NULL;
    }

    dec->initialized = 0;
    free(dec);
}

// ============================================================================
// Encoder Functions
// ============================================================================

/**
 * Create a new encoder instance
 */
EMSCRIPTEN_KEEPALIVE
SipEncoder* sip_encoder_create() {
    SipEncoder* enc = (SipEncoder*)calloc(1, sizeof(SipEncoder));
    if (!enc) return NULL;

    enc->cinfo.err = jpeg_std_error(&enc->jerr.pub);
    enc->jerr.pub.error_exit = sip_error_exit;
    enc->jerr.pub.emit_message = sip_emit_message;

    if (setjmp(enc->jerr.setjmp_buffer)) {
        free(enc);
        return NULL;
    }
    jpeg_create_compress(&enc->cinfo);
    enc->initialized = 1;

    return enc;
}

/**
 * Initialize encoder with dimensions and quality
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_init(SipEncoder* enc, uint32_t width, uint32_t height, int quality) {
    if (!enc || !enc->initialized) return -1;
    if (setjmp(enc->jerr.setjmp_buffer)) return -1;

    enc->output_capacity = 16384;
    enc->output_buffer = (uint8_t *)malloc(enc->output_capacity);
    if (!enc->output_buffer) {
        snprintf(last_error, sizeof(last_error), "Failed to allocate encoder output buffer");
        return -1;
    }

    enc->queued_output_bytes = 0;
    enc->total_output_size = 0;
    sip_free_chunks(&enc->output_head, &enc->output_tail);

    enc->dest_mgr.owner = enc;
    enc->dest_mgr.pub.init_destination = sip_encoder_init_destination;
    enc->dest_mgr.pub.empty_output_buffer = sip_encoder_empty_output_buffer;
    enc->dest_mgr.pub.term_destination = sip_encoder_term_destination;
    enc->cinfo.dest = (struct jpeg_destination_mgr *)&enc->dest_mgr;

    // Set image parameters
    enc->cinfo.image_width = width;
    enc->cinfo.image_height = height;
    enc->cinfo.input_components = 3;  // RGB
    enc->cinfo.in_color_space = JCS_RGB;

    jpeg_set_defaults(&enc->cinfo);
    jpeg_set_quality(&enc->cinfo, quality, TRUE);

    // Allocate row buffer
    enc->row_buffer = (JSAMPROW)malloc(width * 3);
    if (!enc->row_buffer) {
        return -1;
    }

    return 0;
}

/**
 * Start compression
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_start(SipEncoder* enc) {
    if (!enc || !enc->initialized) return -1;
    if (setjmp(enc->jerr.setjmp_buffer)) return -1;

    jpeg_start_compress(&enc->cinfo, TRUE);
    enc->compressing = 1;

    return 0;
}

/**
 * Get pointer to internal row buffer for writing
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* sip_encoder_get_row_buffer(SipEncoder* enc) {
    if (!enc || !enc->compressing) return NULL;
    return enc->row_buffer;
}

/**
 * Write one scanline from internal buffer
 * Returns: number of lines written (1), or -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_write_scanline(SipEncoder* enc) {
    if (!enc || !enc->compressing) return -1;
    if (setjmp(enc->jerr.setjmp_buffer)) return -1;

    JSAMPROW rows[1] = { enc->row_buffer };
    return jpeg_write_scanlines(&enc->cinfo, rows, 1);
}

/**
 * Write scanline from provided buffer
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_write_scanline_from(SipEncoder* enc, const uint8_t* data) {
    if (!enc || !enc->compressing) return -1;
    if (setjmp(enc->jerr.setjmp_buffer)) return -1;

    JSAMPROW rows[1] = { (JSAMPROW)data };
    return jpeg_write_scanlines(&enc->cinfo, rows, 1);
}

/**
 * Get current scanline number
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_encoder_get_scanline(SipEncoder* enc) {
    if (!enc || !enc->compressing) return 0;
    return enc->cinfo.next_scanline;
}

/**
 * Finish compression
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_finish(SipEncoder* enc) {
    if (!enc || !enc->compressing) return -1;
    if (setjmp(enc->jerr.setjmp_buffer)) return -1;

    jpeg_finish_compress(&enc->cinfo);
    enc->compressing = 0;

    return 0;
}

/**
 * Get pointer to output JPEG data
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* sip_encoder_get_output(SipEncoder* enc) {
    (void)enc;
    return NULL;
}

/**
 * Get size of output JPEG data
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_encoder_get_output_size(SipEncoder* enc) {
    if (!enc) return 0;
    return enc->total_output_size;
}

EMSCRIPTEN_KEEPALIVE
uint8_t* sip_encoder_peek_chunk_data(SipEncoder* enc) {
    if (!enc || !enc->output_head) return NULL;
    return enc->output_head->data;
}

EMSCRIPTEN_KEEPALIVE
uint32_t sip_encoder_peek_chunk_size(SipEncoder* enc) {
    if (!enc || !enc->output_head) return 0;
    return enc->output_head->size;
}

EMSCRIPTEN_KEEPALIVE
int sip_encoder_pop_chunk(SipEncoder* enc) {
    if (!enc || !enc->output_head) return 0;

    SipChunk *chunk = enc->output_head;
    enc->output_head = chunk->next;
    if (!enc->output_head) {
        enc->output_tail = NULL;
    }

    enc->queued_output_bytes -= chunk->size;
    free(chunk->data);
    free(chunk);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
uint32_t sip_encoder_get_buffered_output_size(SipEncoder* enc) {
    if (!enc) return 0;
    return enc->queued_output_bytes;
}

/**
 * Destroy encoder and free all resources
 */
EMSCRIPTEN_KEEPALIVE
void sip_encoder_destroy(SipEncoder* enc) {
    if (!enc) return;

    if (enc->compressing) {
        // Don't call finish if we're aborting
        enc->compressing = 0;
    }

    if (enc->row_buffer) {
        free(enc->row_buffer);
        enc->row_buffer = NULL;
    }

    if (enc->output_buffer) {
        free(enc->output_buffer);
        enc->output_buffer = NULL;
    }

    sip_free_chunks(&enc->output_head, &enc->output_tail);
    enc->queued_output_bytes = 0;
    enc->total_output_size = 0;

    if (enc->initialized) {
        jpeg_destroy_compress(&enc->cinfo);
        enc->initialized = 0;
    }

    free(enc);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Allocate memory that can be accessed from JS
 */
EMSCRIPTEN_KEEPALIVE
void* sip_malloc(uint32_t size) {
    return malloc(size);
}

/**
 * Free memory allocated with sip_malloc
 */
EMSCRIPTEN_KEEPALIVE
void sip_free(void* ptr) {
    free(ptr);
}
