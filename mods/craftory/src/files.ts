/**
 * The repo paths Craftory may write (plan "Files Craftory reads and writes"), as a predicate
 * the shell's single `writeRepoFile` checks before every `$.fs.write`. The engine tests assert
 * against the same predicate, so the list and the check cannot drift.
 */
import type { DocsLayout, SteeringFile } from '../types'

export type WritableContext = {
  steering: SteeringFile | null
  docs: DocsLayout
  issuesFolder: string
}

/** A planned write. `before` is the text it was planned against; null means the file was absent. */
export type FileWrite = { path: string; before: string | null; after: string }

export const AGENT_DOCS = {
  tracker: 'docs/agents/issue-tracker.md',
  triage: 'docs/agents/triage-labels.md',
  domain: 'docs/agents/domain.md',
} as const

export const GITIGNORE = '.gitignore'
export const CONFIG_FILE = '.craftory/config.json'
export const FEATURES_DIR = '.craftory/features/'

/** Repo-relative form of a path, or undefined for one that leaves the repo or is not plain. */
export function normalise(path: string): string | undefined {
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return undefined
  const parts = path.split('/').filter(part => part !== '' && part !== '.')
  if (parts.length === 0 || parts.includes('..')) return undefined
  return parts.join('/')
}

const folderOf = (folder: string) => normalise(folder)?.concat('/')

export function isWritable(path: string, ctx: WritableContext): boolean {
  const clean = normalise(path)
  if (clean === undefined) return false
  const exact = [
    CONFIG_FILE,
    AGENT_DOCS.tracker,
    AGENT_DOCS.triage,
    AGENT_DOCS.domain,
    GITIGNORE,
    ...(ctx.steering ? [ctx.steering] : []),
    ...(normalise(ctx.docs.glossary) ? [normalise(ctx.docs.glossary)!] : []),
  ]
  if (exact.includes(clean)) return true
  if (clean.startsWith(FEATURES_DIR))
    return /^[A-Za-z0-9-]+\.json$/.test(clean.slice(FEATURES_DIR.length))
  const issues = folderOf(ctx.issuesFolder)
  return (
    issues !== undefined &&
    clean.startsWith(issues) &&
    /^\d+-[a-z0-9-]*\.md$/.test(clean.slice(issues.length))
  )
}

/**
 * Files other people or Matt's skills also write. A write to one is refused when the file
 * changed since it was planned (compare-and-swap). `.craftory/*` files merge on write instead.
 */
export function isShared(path: string, ctx: WritableContext): boolean {
  const clean = normalise(path)
  return clean !== undefined && !clean.startsWith('.craftory/') && isWritable(clean, ctx)
}
