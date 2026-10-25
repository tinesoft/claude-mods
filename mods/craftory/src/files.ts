import type { DocsLayout, SteeringFile } from '../types'

export type WritableContext = {
  steering: SteeringFile | null
  docs: DocsLayout
  issuesFolder: string
}

export type FileWrite = { path: string; before: string | null; after: string }

export const AGENT_DOCS = {
  tracker: 'docs/agents/issue-tracker.md',
  triage: 'docs/agents/triage-labels.md',
  domain: 'docs/agents/domain.md',
} as const

export const GITIGNORE = '.gitignore'
export const CONFIG_FILE = '.craftory/config.json'
export const FEATURES_DIR = '.craftory/features/'

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

export function isShared(path: string, ctx: WritableContext): boolean {
  const clean = normalise(path)
  return clean !== undefined && !clean.startsWith('.craftory/') && isWritable(clean, ctx)
}

export function diffSummary(before: string | null, after: string): string {
  const lines = (text: string | null) => (text === null ? [] : text.split(/\r?\n/))
  const old = lines(before)
  const next = lines(after)
  const count = (list: string[]) => {
    const map = new Map<string, number>()
    for (const l of list) map.set(l, (map.get(l) ?? 0) + 1)
    return map
  }
  const [was, now] = [count(old), count(next)]
  const gained = next.filter(l => {
    const left = was.get(l) ?? 0
    was.set(l, left - 1)
    return left <= 0
  })
  const lost = old.filter(l => {
    const left = now.get(l) ?? 0
    now.set(l, left - 1)
    return left <= 0
  })
  if (before === null) return `new file, ${next.filter(Boolean).length} lines`
  const first = gained.find(l => l.trim() !== '')
  const head = `+${gained.length} −${lost.length} lines`
  return first === undefined ? head : `${head}, adds "${first.trim().slice(0, 60)}"`
}
