import type { GlossaryMap } from '../types'
import { deepestContextOf, fileOf } from './drift'

/** Where Matt's `domain-modeling` skill keeps the map of contexts. */
export const GLOSSARY_MAP = 'GLOSSARY-MAP.md'

const CONTEXT_LINE = /^- \[([^\]]+)\]\(([^)]+)\)\s*(?::\s*(.*?))?\s*$/

/** A single-context repo's context is named after its glossary's `# Title`. */
export const titleOf = (glossaryText: string | null) =>
  glossaryText === null ? 'Glossary' : (/^# (.+?)\s*$/m.exec(glossaryText)?.[1] ?? 'Glossary')

/** The repo-relative path without `./`, or null when it leaves the repo. */
function insideRepo(path: string): string | null {
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return null
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.pop() === undefined) return null
    } else parts.push(part)
  }
  return parts.length === 0 ? null : parts.join('/')
}

/** Reads the `## Contexts` and `## Relationships` bullets; a bad line is a problem, not an error. */
export function parseGlossaryMap(text: string): GlossaryMap {
  const map: GlossaryMap = { contexts: [], relationships: [], problems: [] }
  let section = ''
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      section = line
        .replace(/^##\s+/, '')
        .trim()
        .toLowerCase()
      continue
    }
    if (!line.startsWith('- ')) continue
    if (section === 'relationships') map.relationships.push(line.slice(2).trim())
    else if (section === 'contexts') {
      const match = CONTEXT_LINE.exec(line)
      if (!match) {
        map.problems.push(`${GLOSSARY_MAP}: cannot read "${line}"`)
        continue
      }
      const raw = match[2]!.trim()
      const path = insideRepo(raw)
      if (path === null) {
        map.problems.push(`${GLOSSARY_MAP}: ${raw} is outside the repo`)
        continue
      }
      const slash = path.lastIndexOf('/')
      map.contexts.push({
        name: match[1]!.trim(),
        description: match[3] ?? '',
        path,
        folder: slash < 0 ? '.' : path.slice(0, slash),
      })
    }
  }
  return map
}

/** A context's file as Matt's `domain-modeling` skill starts it: title, one line, `## Language`. */
export const newGlossary = (name: string, description: string) =>
  `# ${name}\n\n${description === '' ? `The language of ${name}.` : description}\n\n## Language\n`

/**
 * The context whose folder holds the most changed lines of a unified diff; the deepest folder
 * wins a file. Ties, no diff and a diff outside every folder give the first context.
 */
export function defaultContextOf(
  diff: string | null,
  contexts: readonly { name: string; folder: string }[],
): string {
  const counts = new Map<string, number>()
  let owner: string | null = null
  for (const line of (diff ?? '').split('\n')) {
    const file = fileOf(line)
    if (file !== undefined) owner = deepestContextOf(file, contexts)?.name ?? null
    else if (owner !== null && /^[+-](?![+-]{2} )/.test(line))
      counts.set(owner, (counts.get(owner) ?? 0) + 1)
  }
  let best = contexts[0]?.name ?? ''
  let most = counts.get(best) ?? 0
  for (const c of contexts) {
    const n = counts.get(c.name) ?? 0
    if (n > most) {
      best = c.name
      most = n
    }
  }
  return best
}
