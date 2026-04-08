import sipWasm from '../vendor/sip/sip.wasm';
import { inspect, ready, toResponse, transform } from '../vendor/sip/index.js';

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>sip Worker Example</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0a0a0a; color: #fff; }
    main { width: min(720px, calc(100vw - 2rem)); margin: 0 auto; padding: 3rem 0 4rem; }
    h1 { margin: 0 0 0.75rem; font-size: clamp(2rem, 5vw, 3rem); }
    p { color: #a1a1aa; line-height: 1.7; }
    form { margin-top: 1.5rem; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; background: #111; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid #27272a; }
    label { display: block; padding: 1rem; border-right: 1px solid #27272a; }
    label:last-child { border-right: none; }
    span { display: block; margin-bottom: 0.5rem; color: #71717a; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    input[type="number"] { width: 100%; box-sizing: border-box; border: 1px solid #3f3f46; border-radius: 10px; background: #09090b; color: #fff; padding: 0.8rem 0.9rem; font: inherit; }
    .picker { padding: 1rem; border-bottom: 1px solid #27272a; }
    input[type="file"] { width: 100%; padding: 0.8rem; border: 1px dashed #3f3f46; border-radius: 12px; background: #09090b; color: #d4d4d8; }
    .actions { display: flex; gap: 0.75rem; align-items: center; padding: 1rem; }
    button { border: none; border-radius: 12px; background: #fff; color: #000; padding: 0.85rem 1.1rem; font: inherit; font-weight: 700; cursor: pointer; }
    #status { color: #a1a1aa; font-size: 0.9rem; }
    #meta { margin-top: 1rem; color: #a1a1aa; font-size: 0.92rem; min-height: 1.4rem; }
    img { display: block; width: 100%; margin-top: 1rem; border-radius: 16px; background: #111; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } label { border-right: none; border-bottom: 1px solid #27272a; } label:last-child { border-bottom: none; } }
  </style>
</head>
<body>
  <main>
    <h1>sip Worker Example</h1>
    <p>This page uploads the selected JPEG or PNG as the raw request body, resizes it inside a Cloudflare Worker, and streams the JPEG back.</p>
    <form id="form">
      <div class="picker">
        <input id="file" type="file" accept="image/jpeg,image/png" required>
      </div>
      <div class="grid">
        <label><span>Max width</span><input id="width" type="number" min="1" value="1024"></label>
        <label><span>Max height</span><input id="height" type="number" min="1" value="1024"></label>
        <label><span>Quality</span><input id="quality" type="number" min="1" max="100" value="82"></label>
      </div>
      <div class="actions">
        <button type="submit">Resize image</button>
        <div id="status">Waiting for an image.</div>
      </div>
    </form>
    <div id="meta"></div>
    <img id="result" alt="" hidden>
  </main>
  <script>
    const form = document.getElementById('form');
    const fileInput = document.getElementById('file');
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const qualityInput = document.getElementById('quality');
    const status = document.getElementById('status');
    const meta = document.getElementById('meta');
    const result = document.getElementById('result');
    let objectUrl = '';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = fileInput.files?.[0];
      if (!file) {
        status.textContent = 'Select an image first.';
        return;
      }

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = '';
      }

      result.hidden = true;
      meta.textContent = '';
      status.textContent = 'Processing...';

      const params = new URLSearchParams({
        width: widthInput.value,
        height: heightInput.value,
        quality: qualityInput.value,
      });

      try {
        const response = await fetch('/api/process?' + params.toString(), {
          method: 'POST',
          headers: {
            'content-type': file.type || 'application/octet-stream',
          },
          body: file,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Processing failed');
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        result.src = objectUrl;
        result.hidden = false;
        status.textContent = 'Done.';
        meta.textContent =
          'Input: ' +
          response.headers.get('X-Input-Format') +
          ' ' +
          response.headers.get('X-Input-Width') +
          'x' +
          response.headers.get('X-Input-Height') +
          ' • Output: JPEG ' +
          response.headers.get('X-Output-Width') +
          'x' +
          response.headers.get('X-Output-Height') +
          ' • Peak SIP memory: ' +
          response.headers.get('X-Peak-Pipeline-Bytes');
      } catch (error) {
        status.textContent = 'Processing failed.';
        meta.textContent = error instanceof Error ? error.message : String(error);
      }
    });
  </script>
</body>
</html>`;

function getOptions(url: URL) {
  return {
    width: Number(url.searchParams.get('width')) || undefined,
    height: Number(url.searchParams.get('height')) || undefined,
    quality: Number(url.searchParams.get('quality')) || undefined,
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    await ready({ wasm: sipWasm });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/api/process') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const { info, source } = await inspect(request);
      if (info.format !== 'jpeg' && info.format !== 'png') {
        return new Response('This example worker accepts JPEG and PNG inputs only.', {
          status: 415,
        });
      }
      const image = transform(source, getOptions(url));
      return toResponse(image, {
        headers: {
          'Cache-Control': 'no-store',
          'X-Input-Format': info.format,
          'X-Input-Width': String(info.width),
          'X-Input-Height': String(info.height),
        },
      });
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : 'Processing failed',
        { status: 500 }
      );
    }
  },
};
