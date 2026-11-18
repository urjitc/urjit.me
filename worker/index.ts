/**
 * Runs in front of the homepage only (wrangler.jsonc `run_worker_first`): browsers get the
 * HTML as before; agents that ask for `Accept: text/markdown` get /index.md, the same page
 * as Markdown (generated at build by build/agent-markdown.ts). Everything else is static.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const wantsMarkdown = /\btext\/markdown\b/.test(request.headers.get('accept') ?? '')
    const asset = wantsMarkdown ? new Request(new URL('/index.md', request.url), request) : request
    const response = await env.ASSETS.fetch(asset)
    const headers = new Headers(response.headers)
    headers.append('Vary', 'Accept')
    headers.append('Link', '</index.md>; rel="alternate"; type="text/markdown"')
    headers.append('Link', '</llms.txt>; rel="describedby"; type="text/plain"')
    if (wantsMarkdown) headers.set('Content-Type', 'text/markdown; charset=utf-8')
    return new Response(response.body, { status: response.status, headers })
  },
}
