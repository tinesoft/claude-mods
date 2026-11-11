// Reads `.scratch/` through Craftory's own Local tracker reader, so the tools that use this module
// see the tracker exactly as the mod's Tickets tab does. Shared by check-scratch.mjs and
// scratch-status.mjs.
//
// The mod's `.ts` files import each other without extensions (Claude Code resolves them), so a
// resolve hook adds `.ts` for Node, which strips the types itself (Node >= 22.18).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith('.') &&
      !/\.[cm]?[jt]sx?$/.test(specifier) &&
      context.parentURL?.endsWith('.ts')
    ) {
      const url = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
    return next(specifier, context)
  },
})

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = file => pathToFileURL(path.join(ROOT, 'mods/craftory/src', file)).href

const { spec } = await import(src('tracker/local.ts'))
const { readTracker } = await import(src('tracker/index.ts'))
const refs = await import(src('tracker/refs.ts'))
const { DEFAULT_LABELS } = await import(src('agents-md.ts'))

/** The status vocabulary, from the mod: one list for the readers and the tools. */
export const ROLES = Object.keys(DEFAULT_LABELS)
export const { FINISHED_STATUSES, WORKING_STATUSES } = refs
/** Finished for good: a finished status, or the `wontfix` role, which closes an issue. */
export const isFinished = status => refs.isFinishedStatus(status) || status === 'wontfix'

/** Every `Status:` line in a file's head, plain or bold, as the mod's readers match one. */
export function statusLines(text) {
  const head = text.split('\n').slice(0, 60).join('\n')
  return [...head.matchAll(new RegExp(refs.upstreamLine('Status').source, 'gim'))].map(m =>
    m[1].toLowerCase(),
  )
}

function execute(reads) {
  return reads.map(read => {
    const abs = path.join(ROOT, read.kind === 'list' ? read.dir : read.path)
    if (read.kind === 'list') {
      if (!existsSync(abs)) return { kind: 'list', entries: null }
      return {
        kind: 'list',
        entries: readdirSync(abs, { withFileTypes: true }).map(e => ({
          name: e.name,
          kind: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other',
          mtimeMs: statSync(path.join(abs, e.name)).mtimeMs,
        })),
      }
    }
    return { kind: 'read', text: existsSync(abs) ? readFileSync(abs, 'utf8') : null }
  })
}

/** The Local tracker snapshot, plus the raw `Status:` lines of every file it read. */
export async function readScratch() {
  const ctx = { labels: DEFAULT_LABELS, now: Date.now(), config: {} }
  const snapshot = await readTracker(spec, ctx, async reads => execute(reads))
  const statusOf = location => statusLines(readFileSync(path.join(ROOT, location), 'utf8'))
  return { snapshot, statusOf, root: ROOT }
}
