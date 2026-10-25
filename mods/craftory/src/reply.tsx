/**
 * Glossary terms in Claude's replies. Markdown has no hover, so each term's first mention
 * becomes a Markdown link whose press asks `wait-what`, and the hover cards sit on a term row
 * under the reply. The stored message never changes: both are drawn from a copy.
 */
import type { Term } from '../types'
import { termKey } from './glossary'
import { findWord, skippedRanges, type Match } from './prose'

/** Markdown draws only http, https and file links; the host never resolves, a press consumes it. */
const HREF = 'https://craftory.invalid/term/'

export const termHref = (term: Term) => `${HREF}${encodeURIComponent(termKey(term.name))}`

export const termOfHref = (href: string, terms: readonly Term[]): Term | undefined => {
  if (!href.startsWith(HREF)) return undefined
  const key = decodeURIComponent(href.slice(HREF.length))
  return terms.find(t => termKey(t.name) === key)
}

export type Linked = {
  /** The reply with each found term's first mention as a link. */
  text: string
  /** The terms found, in the order they first appear. */
  found: Term[]
}

/**
 * Longest terms first so `ledger line item` wins over `ledger line`; a mention inside code, a
 * code fence or an existing link is left alone, and one mention never overlaps another.
 */
export function linkTerms(text: string, terms: readonly Term[]): Linked {
  const skipped = skippedRanges(text, { links: true })
  const taken: (Match & { term: Term })[] = []
  const bySize = [...terms].sort((a, b) => b.name.length - a.name.length)
  for (const term of bySize) {
    const hit = findWord(text, term.name, skipped).find(
      m => !taken.some(t => m.start < t.end && m.end > t.start),
    )
    if (hit !== undefined) taken.push({ ...hit, term })
  }
  const ordered = taken.sort((a, b) => a.start - b.start)
  let out = ''
  let at = 0
  for (const { start, end, term } of ordered) {
    out += `${text.slice(at, start)}[${text.slice(start, end)}](${termHref(term)})`
    at = end
  }
  return { text: out + text.slice(at), found: ordered.map(o => o.term) }
}

/** The terms a reply uses, as keys, for the Glossary tab's "Used in last reply". */
export const termKeysIn = (text: string, terms: readonly Term[]): string[] =>
  linkTerms(text, terms).found.map(t => termKey(t.name))
