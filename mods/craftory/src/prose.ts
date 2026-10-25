/**
 * Finding words in Markdown prose. Glossary terms in a reply and avoid-words in a diff both
 * need "this word, as a word, outside code and outside a link", so the rule exists once.
 */

export type Range = readonly [start: number, end: number]

const FENCE = /^[ \t]*(`{3,}|~{3,})/
const INLINE_CODE = /(`+)[^`\n]*?\1/g
const LINK = /!?\[[^\]\n]*\]\([^)\n]*\)/g

/** Ranges of `text` that are not prose: fenced code, inline code spans and, when asked, links. */
export function skippedRanges(text: string, { links }: { links: boolean }): Range[] {
  const ranges: Range[] = []
  let fence: string | null = null
  let fenceStart = 0
  let offset = 0
  for (const line of text.split('\n')) {
    const next = offset + line.length + 1
    const marker = FENCE.exec(line)?.[1]
    if (fence !== null) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
        ranges.push([fenceStart, next])
        fence = null
      }
    } else if (marker !== undefined) {
      fence = marker
      fenceStart = offset
    } else {
      for (const match of line.matchAll(INLINE_CODE))
        ranges.push([offset + match.index, offset + match.index + match[0].length])
      if (links)
        for (const match of line.matchAll(LINK))
          ranges.push([offset + match.index, offset + match.index + match[0].length])
    }
    offset = next
  }
  if (fence !== null) ranges.push([fenceStart, text.length])
  return ranges
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The word as a pattern: spaces match any run of spaces, a plural `s` is the same word. */
export const wordPattern = (word: string): RegExp =>
  new RegExp(
    `(?<![\\p{L}\\p{N}_])${word.trim().split(/\s+/).map(escape).join('\\s+')}(?:s)?(?![\\p{L}\\p{N}_])`,
    'giu',
  )

export type Match = { start: number; end: number }

/** Each whole-word occurrence of `word` in `text` that does not touch a skipped range. */
export function findWord(text: string, word: string, skipped: readonly Range[]): Match[] {
  if (word.trim() === '') return []
  return [...text.matchAll(wordPattern(word))]
    .map(m => ({ start: m.index, end: m.index + m[0].length }))
    .filter(m => !skipped.some(([a, b]) => m.start < b && m.end > a))
}
