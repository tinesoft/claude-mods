import { expect, test } from 'claude-code/testing'
import { parseDomainDoc } from '../src/agents-md'
import { addTerm, parseGlossary, serialiseGlossary } from '../src/glossary'
import { defaultContextOf, newGlossary, parseGlossaryMap } from '../src/glossary-map'

const MAP = [
  '# Glossary Map',
  '',
  '## Contexts',
  '',
  '- [Craftory](./mods/craftory/GLOSSARY.md): the SDLC framework mod that guides a feature from idea to merged PR',
  '- [Session activity](./mods/session-activity/GLOSSARY.md): the mod that shows chips for what activated in a session',
  '- [Mod kit](./libs/mod-kit/GLOSSARY.md): the shared source copied into each mod that needs it',
  '',
  '## Relationships',
  '',
  '- **Craftory ↔ Session activity**: both are mods on the same surfaces and share some terms.',
  '- **Mod kit → Craftory, Session activity**: each mod holds a vendored copy of the kit modules it lists.',
  '',
].join('\n')

const DOMAIN = [
  '# Domain Docs',
  '',
  '## Before exploring, read these',
  '',
  '- **`GLOSSARY-MAP.md`** at the repo root: it points at one `GLOSSARY.md` per context.',
  '- **`docs/adr/`**: read repo-wide ADRs.',
  '',
].join('\n')

test("this repo's GLOSSARY-MAP.md lists its three contexts and two relationships", () => {
  const map = parseGlossaryMap(MAP)
  expect(map.problems).toEqual([])
  expect(map.contexts).toEqual([
    {
      name: 'Craftory',
      description: 'the SDLC framework mod that guides a feature from idea to merged PR',
      path: 'mods/craftory/GLOSSARY.md',
      folder: 'mods/craftory',
    },
    {
      name: 'Session activity',
      description: 'the mod that shows chips for what activated in a session',
      path: 'mods/session-activity/GLOSSARY.md',
      folder: 'mods/session-activity',
    },
    {
      name: 'Mod kit',
      description: 'the shared source copied into each mod that needs it',
      path: 'libs/mod-kit/GLOSSARY.md',
      folder: 'libs/mod-kit',
    },
  ])
  expect(map.relationships).toHaveLength(2)
  expect(map.relationships[0]).toContain('Craftory ↔ Session activity')
})

test('a context at the repo root has the folder "."', () => {
  const map = parseGlossaryMap('## Contexts\n\n- [Root](GLOSSARY.md): the root\n')
  expect(map.contexts[0]).toMatchObject({ path: 'GLOSSARY.md', folder: '.' })
})

test('a malformed line and a path outside the repo become problems; the rest still reads', () => {
  const map = parseGlossaryMap(
    [
      '## Contexts',
      '',
      '- [Good](./a/GLOSSARY.md): fine',
      '- not a link',
      '- [Out](../elsewhere/GLOSSARY.md): outside',
      '- [Abs](/etc/GLOSSARY.md): absolute',
      '- [Also good](./b/GLOSSARY.md): fine too',
    ].join('\n'),
  )
  expect(map.contexts.map(c => c.name)).toEqual(['Good', 'Also good'])
  expect(map.problems).toHaveLength(3)
  expect(map.problems[0]).toContain('- not a link')
  expect(map.problems[1]).toContain('outside the repo')
})

test('parseDomainDoc reports the multi layout of this repo, and the single one by default', () => {
  expect(parseDomainDoc(DOMAIN).map).toBe('GLOSSARY-MAP.md')
  expect(parseDomainDoc('- **`GLOSSARY.md`** at the repo root\n').map).toBeUndefined()
})

test("a new glossary is Matt's format, and a term lands under its Language heading", () => {
  const text = newGlossary('Ghost', 'not written yet')
  expect(text).toBe('# Ghost\n\nnot written yet\n\n## Language\n')
  const parsed = parseGlossary(text)
  if (parsed.state !== 'ok') throw new Error('unreadable')
  const next = addTerm(parsed.value, { name: 'Spirit', definition: 'A thing.', avoid: [] })
  if (typeof next === 'string') throw new Error(next)
  expect(serialiseGlossary(next)).toBe(
    '# Ghost\n\nnot written yet\n\n## Language\n\n**Spirit**:\nA thing.\n',
  )
})

const FOLDERS = [
  { name: 'Billing', folder: 'billing' },
  { name: 'Shipping', folder: 'shipping' },
]

test('the default context is the one whose folder holds most changed lines; ties and no diff give the first', () => {
  const diff = [
    '+++ b/shipping/a.ts',
    '+one',
    '+two',
    '-three',
    '+++ b/billing/b.ts',
    '+x',
    '+++ b/README.md',
    '+a',
    '+b',
    '+c',
    '+d',
  ].join('\n')
  expect(defaultContextOf(diff, FOLDERS)).toBe('Shipping')
  expect(defaultContextOf('+++ b/billing/b.ts\n+x\n+++ b/shipping/a.ts\n+y\n', FOLDERS)).toBe(
    'Billing',
  )
  expect(defaultContextOf('', FOLDERS)).toBe('Billing')
  expect(defaultContextOf(null, FOLDERS)).toBe('Billing')
})
