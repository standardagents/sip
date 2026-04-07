import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const builtWasmLoaderPath = join(root, 'dist', 'sip.js');
const builtWasmBinaryPath = join(root, 'dist', 'sip.wasm');

globalThis.__SIP_WASM_LOADER__ = async () => {
  const { default: createSipModule } = await import(pathToFileURL(builtWasmLoaderPath).href);
  const wasmBinary = await readFile(builtWasmBinaryPath);
  return createSipModule({ wasmBinary });
};

const { ready, transform, collect } = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const fixtureName = process.argv[2] || 'large.jpg';
const fixture = await readFile(join(root, 'tests', 'fixtures', fixtureName));
const bytes = new Uint8Array(fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength));

function chunkStream(chunkSize = 64 * 1024) {
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        controller.enqueue(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)));
      }
      controller.close();
    },
  });
}

await ready();

if (global.gc) {
  global.gc();
}

const baseline = process.memoryUsage();
let maxArrayBuffers = baseline.arrayBuffers;
let maxRss = baseline.rss;

for (let run = 0; run < 4; run++) {
  const result = await collect(transform(chunkStream(), { width: 1024, height: 1024, quality: 80 }));
  if (result.info.width !== 1024) {
    throw new Error(`Unexpected width: ${result.info.width}`);
  }

  if (global.gc) {
    global.gc();
  }

  const usage = process.memoryUsage();
  maxArrayBuffers = Math.max(maxArrayBuffers, usage.arrayBuffers);
  maxRss = Math.max(maxRss, usage.rss);
}

console.log(JSON.stringify({
  fixture: fixtureName,
  baseline,
  peakDelta: {
    arrayBuffers: maxArrayBuffers - baseline.arrayBuffers,
    rss: maxRss - baseline.rss,
  },
}, null, 2));
