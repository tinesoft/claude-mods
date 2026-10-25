import type { GlossaryDoc, GlossarySlice, Loaded, Term } from '../types'

export const termKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

type Line = { text: string; raw: string }
type Section = 'language' | 'relationships' | 'ambiguities' | 'other'

const TERM_LINE = /^\*\*(.+?)\*\*:(?:\s+(\S.*))?\s*$/
const AVOID_LINE = /^_Avoid_:\s*(.*?)\s*$/
const HEADING = /^#{1,6}\s/

const linesOf = (raw: string): Line[] =>
  (raw.match(/[^\n]*\n|[^\n]+$/g) ?? []).map(raw => ({ raw, text: raw.replace(/\r?\n$/, '') }))

const sectionOf = (heading: string): Section => {
  const name = heading
    .replace(/^##\s+/, '')
    .trim()
    .toLowerCase()
  if (name === 'language') return 'language'
  if (name === 'relationships') return 'relationships'
  if (name === 'flagged ambiguities') return 'ambiguities'
  return 'other'
}

const eolOf = (raw: string): '\n' | '\r\n' => (raw.includes('\r\n') ? '\r\n' : '\n')

const isBlank = (line: Line) => line.text.trim() === ''

function termFrom(group: readonly Line[]): Term {
  const first = TERM_LINE.exec(group[0]!.text)!
  const definition: string[] = first[2] ? [first[2]] : []
  let avoid: string[] = []
  for (const line of group.slice(1)) {
    const match = AVOID_LINE.exec(line.text)
    if (match) {
      avoid = match[1]!
        .split(',')
        .map(a => a.trim())
        .filter(a => a !== '' && a !== '—')
    } else definition.push(line.text)
  }
  return { name: first[1]!, definition: definition.join('\n').trim(), avoid }
}

export function parseGlossary(raw: string | null): Loaded<GlossaryDoc> {
  if (raw === null) return { state: 'absent' }
  const lines = linesOf(raw)
  const slices: GlossarySlice[] = []
  let section: Section = 'other'
  let text = ''
  const flush = () => {
    if (text !== '') slices.push({ kind: 'text', raw: text })
    text = ''
  }
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!
    if (/^##\s/.test(line.text)) section = sectionOf(line.text)
    const startsTerm = section === 'language' && TERM_LINE.test(line.text)
    const startsBullet =
      (section === 'relationships' || section === 'ambiguities') && /^- /.test(line.text)
    if (!startsTerm && !startsBullet) {
      text += line.raw
      i++
      continue
    }
    flush()
    let end = i + 1
    const continues = (next: Line) =>
      !isBlank(next) &&
      !HEADING.test(next.text) &&
      (startsTerm ? !TERM_LINE.test(next.text) : !/^- /.test(next.text))
    while (end < lines.length && continues(lines[end]!)) end++
    const group = lines.slice(i, end)
    const sliceRaw = group.map(l => l.raw).join('')
    if (startsTerm) slices.push({ kind: 'term', raw: sliceRaw, term: termFrom(group) })
    else {
      const body = group.map(l => l.text).join('\n')
      slices.push({
        kind: section === 'relationships' ? 'relationship' : 'ambiguity',
        raw: sliceRaw,
        text: body,
      })
    }
    i = end
  }
  flush()
  return { state: 'ok', value: { slices }, raw }
}

export const serialiseGlossary = (doc: GlossaryDoc) => doc.slices.map(s => s.raw).join('')

export const termsOf = (doc: GlossaryDoc): Term[] =>
  doc.slices.flatMap(s => (s.kind === 'term' ? [s.term] : []))

export const relationshipsOf = (doc: GlossaryDoc) =>
  doc.slices.flatMap(s => (s.kind === 'relationship' ? [s.text] : []))

export const ambiguitiesOf = (doc: GlossaryDoc) =>
  doc.slices.flatMap(s => (s.kind === 'ambiguity' ? [s.text] : []))

export function renderTerm(term: Term, eol: '\n' | '\r\n' = '\n'): string {
  const lines = [`**${term.name.trim()}**:`, ...term.definition.trim().split(/\r?\n/)]
  if (term.avoid.length > 0) lines.push(`_Avoid_: ${term.avoid.join(', ')}`)
  return lines.map(l => l + eol).join('')
}

export type GlossaryEditError = 'duplicate' | 'unknown-term' | 'empty-name'

const docEol = (doc: GlossaryDoc) => eolOf(serialiseGlossary(doc))

const hasKey = (doc: GlossaryDoc, key: string) => termsOf(doc).some(t => termKey(t.name) === key)

function splitAfterHeading(
  doc: GlossaryDoc,
): { index: number; head: string; tail: string } | undefined {
  let section: Section = 'other'
  for (const [index, slice] of doc.slices.entries()) {
    if (slice.kind !== 'text') continue
    const lines = linesOf(slice.raw)
    for (const [n, line] of lines.entries()) {
      if (/^##\s/.test(line.text)) section = sectionOf(line.text)
      if (section === 'language' && /^##\s/.test(line.text)) {
        return {
          index,
          head: lines
            .slice(0, n + 1)
            .map(l => l.raw)
            .join(''),
          tail: lines
            .slice(n + 1)
            .map(l => l.raw)
            .join(''),
        }
      }
    }
  }
  return undefined
}

export function addTerm(doc: GlossaryDoc | null, term: Term): GlossaryDoc | GlossaryEditError {
  const key = termKey(term.name)
  if (key === '') return 'empty-name'
  const base: GlossaryDoc = doc ?? { slices: [] }
  if (hasKey(base, key)) return 'duplicate'
  const eol = docEol(base)
  const fresh: GlossarySlice = { kind: 'term', raw: renderTerm(term, eol), term }
  const slices = [...base.slices]
  const lastTerm = slices.findLastIndex(s => s.kind === 'term')
  if (lastTerm !== -1) {
    const last = slices[lastTerm]!
    if (!/\n$/.test(last.raw)) slices[lastTerm] = { ...last, raw: last.raw + eol }
    slices.splice(lastTerm + 1, 0, { kind: 'text', raw: eol }, fresh)
    return { slices }
  }
  const heading = splitAfterHeading(base)
  if (heading) {
    const needsBlank = heading.tail !== '' && !/^[ \t]*\r?\n/.test(heading.tail)
    slices.splice(
      heading.index,
      1,
      { kind: 'text', raw: heading.head },
      { kind: 'text', raw: eol },
      fresh,
      ...(heading.tail === ''
        ? []
        : [{ kind: 'text' as const, raw: (needsBlank ? eol : '') + heading.tail }]),
    )
    return { slices }
  }
  const existing = serialiseGlossary(base)
  const lead =
    existing === '' ? `# Glossary${eol}${eol}` : `${/\n$/.test(existing) ? '' : eol}${eol}`
  slices.push({ kind: 'text', raw: `${lead}## Language${eol}${eol}` }, fresh)
  return { slices }
}

export function editTerm(
  doc: GlossaryDoc,
  key: string,
  patch: Partial<Term>,
): GlossaryDoc | GlossaryEditError {
  const at = doc.slices.findIndex(s => s.kind === 'term' && termKey(s.term.name) === key)
  const old = doc.slices[at]
  if (old?.kind !== 'term') return 'unknown-term'
  const merged: Term = { ...old.term, ...patch }
  const next = termKey(merged.name)
  if (next === '') return 'empty-name'
  if (next !== key && hasKey(doc, next)) return 'duplicate'
  const eol = docEol(doc)
  let raw = renderTerm(merged, eol)
  if (!/\n$/.test(old.raw)) raw = raw.slice(0, -eol.length)
  const slices = [...doc.slices]
  slices[at] = { kind: 'term', raw, term: merged }
  return { slices }
}

export function deleteTerm(doc: GlossaryDoc, key: string): GlossaryDoc | GlossaryEditError {
  const at = doc.slices.findIndex(s => s.kind === 'term' && termKey(s.term.name) === key)
  if (at === -1) return 'unknown-term'
  const slices = [...doc.slices]
  slices.splice(at, 1)
  const after = slices[at]
  const before = slices[at - 1]
  if (after?.kind === 'text' && /^[ \t]*\r?\n/.test(after.raw)) {
    const rest = after.raw.replace(/^[ \t]*\r?\n/, '')
    slices.splice(at, 1, ...(rest === '' ? [] : [{ kind: 'text' as const, raw: rest }]))
  } else if (before?.kind === 'text' && /(^|\n)[ \t]*\r?\n$/.test(before.raw)) {
    slices[at - 1] = { kind: 'text', raw: before.raw.replace(/[ \t]*\r?\n$/, '') }
  }
  return { slices }
}
