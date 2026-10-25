import { expect, test } from 'claude-code/testing'
import {
  addTerm,
  ambiguitiesOf,
  deleteTerm,
  editTerm,
  parseGlossary,
  relationshipsOf,
  renderTerm,
  serialiseGlossary,
  termKey,
  termsOf,
} from '../src/glossary'
import type { GlossaryDoc } from '../types'
import { UPSTREAM_FIXTURES } from './upstream-fixtures'

const fixture = (name: string) => UPSTREAM_FIXTURES[name]!

const parse = (text: string): GlossaryDoc => {
  const loaded = parseGlossary(text)
  if (loaded.state !== 'ok') throw new Error('expected ok')
  return loaded.value
}
const must = (result: GlossaryDoc | string): GlossaryDoc => {
  if (typeof result === 'string') throw new Error(result)
  return result
}

const HAND = [
  'Notes before the language section, kept as written.',
  '',
  '## Language',
  '',
  '**Ledger line**: one row of a ledger, defined on a single line.',
  '_Avoid_: line item',
  '',
  'A hand-written paragraph between terms.',
  '',
  '**Tax column**:',
  'The column that holds tax.',
  'It spans two lines.',
  '',
  '## Relationships',
  '',
  '- A **Ledger** holds many **Ledger lines**',
  '  and continues here',
  '',
  '## Flagged ambiguities',
  '',
  '- "row" was used for both. Resolved: **Ledger line**.',
  '',
  'Trailing prose without a newline',
].join('\n')

test('upstream GLOSSARY.md round-trips byte for byte and lists its terms', () => {
  const text = fixture('GLOSSARY.md')
  const doc = parse(text)
  expect(serialiseGlossary(doc)).toBe(text)
  expect(termsOf(doc).map(t => t.name)).toEqual([
    'Issue tracker',
    'Issue',
    'Decision ticket',
    'Triage role',
  ])
  expect(termsOf(doc)[0]!.avoid).toEqual(['backlog manager', 'backlog backend', 'issue host'])
  expect(termsOf(doc)[2]!.avoid).toEqual([])
  expect(relationshipsOf(doc)).toHaveLength(3)
  expect(ambiguitiesOf(doc)).toHaveLength(2)
})

test('hand-written prose, single-line terms and a missing final newline round-trip', () => {
  const doc = parse(HAND)
  expect(serialiseGlossary(doc)).toBe(HAND)
  expect(termsOf(doc).map(t => [t.name, t.definition])).toEqual([
    ['Ledger line', 'one row of a ledger, defined on a single line.'],
    ['Tax column', 'The column that holds tax.\nIt spans two lines.'],
  ])
  expect(relationshipsOf(doc)).toEqual([
    '- A **Ledger** holds many **Ledger lines**\n  and continues here',
  ])
})

test('CRLF files round-trip and keep CRLF through an edit', () => {
  const crlf = fixture('GLOSSARY.md').replace(/\n/g, '\r\n')
  const doc = parse(crlf)
  expect(serialiseGlossary(doc)).toBe(crlf)
  const edited = serialiseGlossary(must(editTerm(doc, 'issue', { definition: 'Changed.' })))
  expect(edited.replace(/\r\n/g, '')).not.toContain('\n')
  expect(edited).toContain('**Issue**:\r\nChanged.\r\n_Avoid_: ticket')
})

test('any text round-trips, including text with no glossary shape at all', () => {
  for (const text of [
    '',
    '\n',
    'just words',
    '## Language',
    '## Language\n**A**:',
    '\r\n\r\n',
    '**x**: y\n',
  ]) {
    expect(serialiseGlossary(parse(text))).toBe(text)
  }
})

test('editing a term changes only that term, everything else stays byte for byte', () => {
  const text = fixture('GLOSSARY.md')
  const edited = serialiseGlossary(
    must(
      editTerm(parse(text), 'issue', { definition: 'A tracked unit.', avoid: ['ticket', 'card'] }),
    ),
  )
  const [before, after] = [text.split('\n'), edited.split('\n')]
  const changed = before.filter((l, i) => l !== after[i])
  expect(edited).toContain('**Issue**:\nA tracked unit.\n_Avoid_: ticket, card\n')
  expect(edited.replace('A tracked unit.', '').length).toBeLessThan(text.length + 30)
  const start = text.indexOf('**Issue**:')
  const end = text.indexOf('**Decision ticket**:')
  expect(edited.slice(0, start)).toBe(text.slice(0, start))
  expect(edited.endsWith(text.slice(end))).toBe(true)
  expect(changed.length).toBeGreaterThan(0)
})

test('a rename keeps the term in place and refuses a name that is taken', () => {
  const doc = parse(HAND)
  const renamed = must(editTerm(doc, 'ledger line', { name: 'Entry' }))
  expect(termsOf(renamed).map(t => t.name)).toEqual(['Entry', 'Tax column'])
  expect(editTerm(doc, 'ledger line', { name: 'Tax Column' })).toBe('duplicate')
  expect(editTerm(doc, 'nope', {})).toBe('unknown-term')
  expect(editTerm(doc, 'ledger line', { name: '  ' })).toBe('empty-name')
})

test('adding a term appends after the last term and parses back to the same term', () => {
  const doc = parse(HAND)
  const term = { name: 'Posting', definition: 'A booked entry.', avoid: ['booking'] }
  const next = serialiseGlossary(must(addTerm(doc, term)))
  expect(next).toContain(
    'It spans two lines.\n\n**Posting**:\nA booked entry.\n_Avoid_: booking\n\n## Relationships',
  )
  expect(termsOf(parse(next)).at(-1)).toEqual(term)
  expect(next.replace('**Posting**:\nA booked entry.\n_Avoid_: booking\n\n', '')).toBe(HAND)
  expect(addTerm(doc, { ...term, name: 'ledger LINE' })).toBe('duplicate')
})

test('adding creates the language section, or the whole document, when missing', () => {
  const term = { name: 'Posting', definition: 'A booked entry.', avoid: [] }
  expect(serialiseGlossary(must(addTerm(null, term)))).toBe(
    '# Glossary\n\n## Language\n\n**Posting**:\nA booked entry.\n',
  )
  const noTerms = '# G\n\n## Language\n\n## Relationships\n\n- x\n'
  const next = serialiseGlossary(must(addTerm(parse(noTerms), term)))
  expect(next).toBe(
    '# G\n\n## Language\n\n**Posting**:\nA booked entry.\n\n## Relationships\n\n- x\n',
  )
  expect(serialiseGlossary(must(addTerm(parse('# G\nprose'), term)))).toBe(
    '# G\nprose\n\n## Language\n\n**Posting**:\nA booked entry.\n',
  )
})

test('deleting a term removes it and one blank line, nothing else', () => {
  const doc = parse(HAND)
  const next = serialiseGlossary(must(deleteTerm(doc, termKey('Tax column'))))
  expect(next).toBe(
    HAND.replace('**Tax column**:\nThe column that holds tax.\nIt spans two lines.\n\n', ''),
  )
  expect(deleteTerm(doc, 'nope')).toBe('unknown-term')
})

test('add then delete returns the original bytes', () => {
  const text = fixture('GLOSSARY.md')
  const added = must(addTerm(parse(text), { name: 'Posting', definition: 'x', avoid: [] }))
  expect(serialiseGlossary(must(deleteTerm(added, 'posting')))).toBe(text)
})

test('rendering a term omits the avoid line when there is nothing to avoid', () => {
  expect(renderTerm({ name: 'A', definition: 'd', avoid: [] }, '\r\n')).toBe('**A**:\r\nd\r\n')
})
