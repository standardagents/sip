#!/usr/bin/env node
/**
 * Converts docs/public/og-source.png into a 1200x630 OG image by
 * letterboxing it (as needed) onto a black canvas. Re-run this when the
 * source art changes.
 */
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcPath = path.join(root, 'docs/public/og-source.png')
const outPath = path.join(root, 'docs/public/og-image.png')

const srcBytes = await readFile(srcPath)
const srcDataUrl = 'data:image/png;base64,' + srcBytes.toString('base64')

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 1200px;
    height: 630px;
    background: #000;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  img {
    max-width: 1200px;
    max-height: 630px;
    width: auto;
    height: auto;
    display: block;
  }
</style>
</head>
<body>
  <img src="${srcDataUrl}" alt="">
</body>
</html>`

const browser = await chromium.launch()
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.screenshot({ path: outPath, type: 'png', omitBackground: false })
  console.log(`Wrote ${path.relative(root, outPath)}`)
} finally {
  await browser.close()
}
