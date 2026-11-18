/**
 * The public jam wall's API, under /api/jams:
 *
 *   GET  /api/jams   the latest jams
 *   POST /api/jams   { name, pattern, kit } → { id }
 *
 * A jam is only drum hits, so its name is the one thing that could be abusive. Names pass a
 * profanity list (obscenity, which also catches look-alike spellings) and then Llama Guard,
 * which catches hate and harassment worded without swearing. If the check can't run, the
 * post is refused rather than let through. Posting is rate limited per IP. To take a jam
 * down by hand:
 *
 *   npx wrangler d1 execute urjit-me-jams --remote --command "DELETE FROM jams WHERE id = '…'"
 */
import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity'
import { decodeHits, KITS, NAME_MAX } from '../src/features/looper/jam'

// The few binding methods used here (the full types come from @cloudflare/workers-types,
// which clash with the DOM types the rest of the project compiles against).
interface D1Statement {
  bind(...values: unknown[]): D1Statement
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

export interface JamsEnv {
  DB: { prepare(query: string): D1Statement }
  AI: { run(model: string, input: unknown): Promise<{ response?: string }> }
  POST_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> }
}

type Jam = { id: string; name: string; pattern: string; kit: string; created_at: number }

const WALL_SIZE = 30
const profanity = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

export async function handleJams(request: Request, env: JamsEnv): Promise<Response> {
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, name, pattern, kit, created_at FROM jams ORDER BY created_at DESC LIMIT ?',
    ).bind(WALL_SIZE).all<Jam>()
    return Response.json(results, { headers: { 'Cache-Control': 'public, max-age=10' } })
  }
  if (request.method !== 'POST') return error(405, 'Not allowed.')
  const { success } = await env.POST_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') ?? '' })
  if (!success) return error(429, 'Slow down a little, then try again.')

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return error(400, 'Bad request.')
  const { name, pattern, kit } = body as Record<string, unknown>
  if (typeof pattern !== 'string' || !decodeHits(pattern)) return error(400, 'That loop is empty.')
  if (typeof kit !== 'string' || !KITS.some((known) => known === kit)) return error(400, 'Unknown kit.')
  const cleaned = typeof name === 'string' ? name.normalize('NFKC').replace(/\s+/g, ' ').trim() : ''
  const problem = await nameProblem(cleaned, env)
  if (problem) return error(422, problem)

  const jamId = randomId()
  await env.DB.prepare('INSERT INTO jams (id, name, pattern, kit, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(jamId, cleaned, pattern, kit, Date.now())
    .run()
  return Response.json({ id: jamId }, { status: 201 })
}

/** Why a name can't go on the wall, or null if it can. */
async function nameProblem(name: string, env: JamsEnv): Promise<string | null> {
  if (!name) return 'Give your jam a name.'
  if ([...name].length > NAME_MAX) return `Keep the name under ${NAME_MAX + 1} characters.`
  if (/[\p{C}]/u.test(name)) return 'Use plain text for the name.'
  if (/https?:|www\.|\.[a-z]{2,}\b|@/i.test(name)) return 'No links in the name.'
  if (profanity.hasMatch(name)) return 'Pick a different name.'
  try {
    const { response = '' } = await env.AI.run('@cf/meta/llama-guard-3-8b', {
      messages: [{ role: 'user', content: `Name for a drum loop on a public wall: ${name}` }],
      temperature: 0,
      max_tokens: 16,
    })
    // Llama Guard answers "safe", or "unsafe" and the categories broken.
    return response.trim().toLowerCase().startsWith('safe') ? null : 'Pick a different name.'
  } catch {
    return "Couldn't check the name just now. Try again in a minute."
  }
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}

/** 8 characters of base 62: plenty for a wall. */
function randomId(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => alphabet[byte % 62]).join('')
}
