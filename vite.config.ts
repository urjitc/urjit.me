import { readdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { toMarkdown } from './build/agent-markdown'

/** After a build, writes the homepage as Markdown for agents: dist/index.md and dist/llms.txt. */
function agentMarkdown(): Plugin {
  let outDir = 'dist'
  return {
    name: 'agent-markdown',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const markdown = toMarkdown(await readFile(join(outDir, 'index.html'), 'utf8'))
      await Promise.all(['index.md', 'llms.txt'].map((name) => writeFile(join(outDir, name), markdown)))
    },
  }
}

export default defineConfig({
  plugins: [agentMarkdown()],
  // Agent worktrees live in .claude/; their edits shouldn't reload this server's pages.
  // The jam wall's API runs in the Worker: start it with `npx wrangler dev` alongside.
  server: { watch: { ignored: ['**/.claude/**'] }, proxy: { '/api': 'http://localhost:8787' } },
  build: {
    // The 404 page is its own entry; Cloudflare serves dist/404.html for unknown paths.
    // Each blog post is a plain page of its own (blog/<slug>/index.html).
    rollupOptions: {
      input: {
        main: 'index.html',
        notFound: '404.html',
        ...Object.fromEntries(
          readdirSync('blog').map((slug) => [`blog/${slug}`, `blog/${slug}/index.html`]),
        ),
      },
    },
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
  },
})
