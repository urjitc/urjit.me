/**
 * Turns the built homepage into Markdown for AI agents (served at /index.md, /llms.txt, and
 * to `Accept: text/markdown` requests by worker/index.ts). It reads the page's own markup,
 * so the HTML stays the single source: the name and tagline, each section's link rows
 * (name, role or description, dates) and the footer links.
 */
export function toMarkdown(html: string): string {
  const text = (fragment = '') =>
    fragment
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  const first = (pattern: RegExp, source = html) => text(pattern.exec(source)?.[1])

  const lines = [
    `# ${first(/<h1[^>]*>([\s\S]*?)<\/h1>/)}`,
    '',
    `> ${first(/<p class="tagline">([\s\S]*?)<\/p>/)}`,
    '',
    'The homepage is a playable drum kit (keys X C hi-hat, V B snare, Space kick, F G H J toms, N M floor tom, K crash/ride); its drums also link to email, GitHub, LinkedIn and X.',
  ]

  for (const [, section = ''] of html.matchAll(/<section aria-labelledby="[^"]+">([\s\S]*?)<\/section>/g)) {
    lines.push('', `## ${first(/<h2[^>]*>([\s\S]*?)<\/h2>/, section)}`, '')
    for (const [, href, row = ''] of section.matchAll(/<a class="row" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const name = first(/class="row-name">([\s\S]*?)<\/span>/, row)
      const sub = first(/class="row-sub">([\s\S]*?)<\/span>/, row)
      const date = first(/class="row-date">([\s\S]*?)<\/span>/, row)
      lines.push(`- [${name}](${href}): ${sub}${date ? ` (${date})` : ''}`)
    }
  }

  const footer = /<footer[^>]*>([\s\S]*?)<\/footer>/.exec(html)?.[1] ?? ''
  lines.push('', '## Links', '')
  for (const [, href, label] of footer.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    lines.push(`- [${text(label)}](${href})`)
  }
  return `${lines.join('\n')}\n`
}
