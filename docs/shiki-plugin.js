import { createHighlighter } from 'shiki'

/** @returns {import('vite').Plugin} */
export default function shikiPlugin() {
  /** @type {import('shiki').Highlighter} */
  let highlighter

  return {
    name: 'sip-shiki',
    async buildStart() {
      highlighter = await createHighlighter({
        themes: ['github-dark-default'],
        langs: ['typescript', 'shell', 'text'],
      })
    },
    resolveId(id) {
      if (id === 'virtual:highlighted-code') return '\0virtual:highlighted-code'
    },
    async load(id) {
      if (id !== '\0virtual:highlighted-code') return
      const { codeBlocks } = await import('./code-blocks.js')
      const highlighted = {}
      for (const [key, { code, lang }] of Object.entries(codeBlocks)) {
        highlighted[key] = highlighter.codeToHtml(code.trim(), {
          lang,
          theme: 'github-dark-default',
        })
      }
      return `export default ${JSON.stringify(highlighted)}`
    },
  }
}
