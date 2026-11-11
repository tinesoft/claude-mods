import type { Term } from '../types'
import { findWord, skippedRanges } from './prose'

export type DriftFinding = { term: string; avoided: string; count: number }

export const driftDiffArgv = (base: string, branch: string) =>
  ['git', 'diff', '--unified=0', '--no-color', `${base}...${branch}`] as const

/** `+++ b/path` names the file the following hunks belong to. */
const fileOf = (line: string) => /^\+\+\+ (?:b\/)?(.+)$/.exec(line)?.[1]

export function addedLines(diff: string, skipFiles: readonly string[]): string[] {
  const added: string[] = []
  let file = ''
  for (const line of diff.split('\n')) {
    const named = fileOf(line)
    if (named !== undefined) file = named
    else if (line.startsWith('+') && !line.startsWith('+++') && !skipFiles.includes(file))
      added.push(line.slice(1))
  }
  return added
}

export function findDrift(
  diff: string,
  terms: readonly Term[],
  skipFiles: readonly string[] = [],
): DriftFinding[] {
  const lines = addedLines(diff, skipFiles)
  const counts = new Map<string, DriftFinding>()
  for (const line of lines) {
    const skipped = skippedRanges(line, { links: false })
    for (const term of terms)
      for (const avoided of term.avoid) {
        const hits = findWord(line, avoided, skipped).length
        if (hits === 0) continue
        const key = `${term.name}\0${avoided}`
        const old = counts.get(key)
        counts.set(key, { term: term.name, avoided, count: (old?.count ?? 0) + hits })
      }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.avoided.localeCompare(b.avoided),
  )
}

export const driftText = (f: Pick<DriftFinding, 'avoided' | 'count'>) =>
  `Glossary drift · the diff says "${f.avoided}" ${f.count} ${f.count === 1 ? 'time' : 'times'}`

/** An answer that says outright the retro found nothing to suggest. */
const NOTHING_RANKED =
  /\b(?:no (?:candidates|suggestions|improvements|findings)|nothing to (?:improve|suggest))\b/i

/**
 * How many ranked suggestions a /retro answer makes: its numbered lines, or 0 when it says it
 * found nothing. Null when the answer gives neither, so there is nothing to read.
 */
export function retroSuggestions(answer: string): number | null {
  const n = answer.match(/^\s*\d+[.)]\s+\S/gm)?.length ?? 0
  if (n > 0) return n
  return NOTHING_RANKED.test(answer) ? 0 : null
}

export const rankedText = (suggestions: number) =>
  `${suggestions} ranked ${suggestions === 1 ? 'suggestion' : 'suggestions'}`

export const retroText = (suggestions: number | null) =>
  suggestions === null ? 'Retro ready' : `Retro ready · ${rankedText(suggestions)}`
