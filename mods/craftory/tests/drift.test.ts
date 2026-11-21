import { expect, test } from 'claude-code/testing'
import {
  addedLines,
  driftText,
  findDrift,
  findDriftByContext,
  retroSuggestions,
  retroText,
} from '../src/drift'
import { fakeGit } from './build-harness'
import {
  allText,
  featureWorld,
  mountBand,
  mountPane,
  skillPrompt,
  startSession,
  turnComplete,
} from './harness'

const TERMS = [
  { name: 'Ledger line', definition: 'd', avoid: ['line item', 'entry'] },
  { name: 'Customer', definition: 'd', avoid: ['client'] },
]

const DIFF = `diff --git a/src/a.ts b/src/a.ts
+++ b/src/a.ts
@@ -1 +1,5 @@
-const lineItem = 1
+// one line item per row, then another Line Item
+const x = \`the line item\`
+const lineItems = []
+const client = 'client' // a client
GLOSSARY.md line item
diff --git a/GLOSSARY.md b/GLOSSARY.md
+++ b/GLOSSARY.md
@@ -3 +3 @@
+_Avoid_: line item, entry
`

test('only added lines count, whole words only, code spans and the glossary file skipped', () => {
  expect(addedLines(DIFF, ['GLOSSARY.md'])).toHaveLength(4)
  expect(findDrift(DIFF, TERMS, ['GLOSSARY.md'])).toEqual([
    { term: 'Customer', avoided: 'client', count: 3 },
    { term: 'Ledger line', avoided: 'line item', count: 2 },
  ])
})

const contexts = [
  { folder: 'mods/a', terms: [{ name: 'Ledger line', definition: 'd', avoid: ['line item'] }] },
  { folder: 'mods/b', terms: [{ name: 'Customer', definition: 'd', avoid: ['client'] }] },
]
const both = (file: string) => `+++ b/${file}\n+a line item and a client\n`

test("a file under a context is flagged only for that context's avoid-words", () => {
  expect(findDriftByContext(both('mods/a/x.ts'), contexts)).toEqual([
    { term: 'Ledger line', avoided: 'line item', count: 1 },
  ])
})

test('a file outside every context is flagged for all of them', () => {
  expect(findDriftByContext(both('README.md'), contexts)).toHaveLength(2)
})

test('with nested contexts the deepest folder wins', () => {
  const nested = [
    ...contexts,
    { folder: 'mods/a/deep', terms: [{ name: 'Customer', definition: 'd', avoid: ['client'] }] },
  ]
  expect(findDriftByContext(both('mods/a/deep/x.ts'), nested)).toEqual([
    { term: 'Customer', avoided: 'client', count: 1 },
  ])
})

test("a root context's folder does not claim the files no other context holds", () => {
  const withRoot = [
    { folder: '.', terms: [{ name: 'Mod', definition: 'd', avoid: ['plugin'] }] },
    ...contexts,
  ]
  const diff = '+++ b/tools/x.mjs\n+a plugin, a line item and a client\n'
  expect(findDriftByContext(diff, withRoot)).toHaveLength(3)
  expect(findDriftByContext(`+++ b/mods/b/x.ts\n+a plugin and a client\n`, withRoot)).toEqual([
    { term: 'Customer', avoided: 'client', count: 1 },
  ])
})

test('a folder prefix is not a match: mods/ab is not under mods/a', () => {
  expect(findDriftByContext(both('mods/ab/x.ts'), contexts)).toHaveLength(2)
})

test('removed lines and diff headers never count', () => {
  expect(findDrift('--- a/x\n+++ b/x\n-a line item\n', TERMS)).toEqual([])
})

test('the toast and retro texts', () => {
  expect(driftText({ avoided: 'line item', count: 4 })).toBe(
    'Glossary drift · the diff says "line item" 4 times',
  )
  expect(driftText({ avoided: 'client', count: 1 })).toContain('1 time')
  expect(retroText(3)).toBe('Retro ready · 3 ranked suggestions')
  expect(retroText(null)).toBe('Retro ready')
  expect(retroSuggestions('Ranked:\n1. Do a\n2) Do b\n3. Do c\nthanks')).toBe(3)
  expect(retroSuggestions('nothing ranked')).toBeNull()
  expect(retroSuggestions('')).toBeNull()
  expect(retroSuggestions('No candidates for improvement this time.')).toBe(0)
  expect(retroSuggestions('Nothing to improve: the session ran clean.')).toBe(0)
  expect(retroSuggestions('No suggestions.')).toBe(0)
  expect(retroText(0)).toBe('Retro ready · 0 ranked suggestions')
})

const GLOSSARY = '## Language\n\n**Ledger line**:\nA row.\n_Avoid_: line item\n'

const drifting = async (
  on: Parameters<typeof featureWorld>[0],
  $: Parameters<typeof startSession>[0],
) => {
  const git = fakeGit({ extra: [{ path: '/repo/.claude/worktrees/_spec-42', branch: 'feat/csv' }] })
  const diff =
    '+++ b/src/a.ts\n+one line item\n+another line item\n+and a line item\n+last line item\n'
  const w = featureWorld(on, {
    files: { 'GLOSSARY.md': GLOSSARY },
    shell: (argv, cwd) =>
      argv[1] === 'diff' && argv[4] === 'main...feat/csv'
        ? { exitCode: 0, stdout: diff }
        : git.shell(argv, cwd),
  })
  await startSession($)
  return w
}

test('starting Review scans the integration diff and toasts the drift once, with a Rename button', async ($, on) => {
  const w = await drifting(on, $)
  await skillPrompt($, 'code-review')
  expect(w.toasts).toContain('Glossary drift · the diff says "line item" 4 times')
  const band = await mountBand($)
  expect(await allText(band)).toContain('Glossary drift')
  await skillPrompt($, 'code-review')
  expect(w.toasts.filter(t => t.startsWith('Glossary drift'))).toHaveLength(1)
})

test('Rename opens Settings, Glossary on that term', async ($, on) => {
  await drifting(on, $)
  await skillPrompt($, 'code-review')
  await (await mountBand($)).press({ key: 'notice-rename-drift-ledger line-line item' })
  const pane = await mountPane($)
  expect((await pane.find({ key: 'set-gl-name' }))?.props.value).toBe('Ledger line')
})

test('no drift, no notice', async ($, on) => {
  const w = featureWorld(on, { files: { 'GLOSSARY.md': GLOSSARY } })
  await startSession($)
  await skillPrompt($, 'code-review')
  expect(w.toasts.filter(t => t.startsWith('Glossary drift'))).toEqual([])
})

test('a finished retro toasts how many ranked suggestions it made, with a Review button', async ($, on) => {
  const w = featureWorld(on, {})
  await startSession($)
  await skillPrompt($, 'retro')
  await turnComplete($, { answer: '1. Rename X\n2. Gate Y\n3. Trim Z\n' })
  expect(w.toasts).toContain('Retro ready · 3 ranked suggestions')
  expect(await allText(await mountBand($))).toContain('Retro ready · 3 ranked suggestions')
})
