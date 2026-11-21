import type { Term } from '../types'
import { findWord, skippedRanges } from './prose'

export type DriftFinding = { term: string; avoided: string; count: number }

export const driftDiffArgv = (base: string, branch: string) =>
  ['git', 'diff', '--unified=0', '--no-color', `${base}...${branch}`] as const

/** `+++ b/path` names the file the following hunks belong to. */
export const fileOf = (line: string) => /^\+\+\+ (?:b\/)?(.+)$/.exec(line)?.[1]

type AddedLine = { file: string; text: string }

function addedWithFiles(diff: string, skipFiles: readonly string[]): AddedLine[] {
  const added: AddedLine[] = []
  let file = ''
  for (const line of diff.split('\n')) {
    const named = fileOf(line)
    if (named !== undefined) file = named
    else if (line.startsWith('+') && !line.startsWith('+++') && !skipFiles.includes(file))
      added.push({ file, text: line.slice(1) })
  }
  return added
}

export const addedLines = (diff: string, skipFiles: readonly string[]): string[] =>
  addedWithFiles(diff, skipFiles).map(l => l.text)

export function findDrift(
  diff: string,
  terms: readonly Term[],
  skipFiles: readonly string[] = [],
): DriftFinding[] {
  return countDrift(addedWithFiles(diff, skipFiles), () => terms)
}

/** A context's folder ("." for the repo root) and its terms. */
export type DriftContext = { folder: string; terms: readonly Term[] }

/** The context whose folder holds `file`, the deepest one when folders nest; "." holds every file. */
export function deepestContextOf<C extends { folder: string }>(
  file: string,
  contexts: readonly C[],
): C | undefined {
  let deepest: C | undefined
  for (const c of contexts)
    if (
      (c.folder === '.' || file.startsWith(`${c.folder}/`)) &&
      (!deepest || c.folder.length > deepest.folder.length)
    )
      deepest = c
  return deepest
}

/**
 * Like findDrift, but each file is checked against the context whose folder holds it (the
 * deepest wins); a file no context holds is checked against every context.
 */
export function findDriftByContext(
  diff: string,
  contexts: readonly DriftContext[],
  skipFiles: readonly string[] = [],
): DriftFinding[] {
  const everyTerm = contexts.flatMap(c => c.terms)
  const termsFor = (file: string) => {
    const context = deepestContextOf(file, contexts)
    // a root context holds every file, so a file only it holds is a shared one: every context's
    return context && context.folder !== '.' ? context.terms : everyTerm
  }
  return countDrift(addedWithFiles(diff, skipFiles), termsFor)
}

function countDrift(lines: readonly AddedLine[], termsOf: (file: string) => readonly Term[]) {
  const counts = new Map<string, DriftFinding>()
  for (const { file, text } of lines) {
    const skipped = skippedRanges(text, { links: false })
    for (const term of termsOf(file))
      for (const avoided of term.avoid) {
        const hits = findWord(text, avoided, skipped).length
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
