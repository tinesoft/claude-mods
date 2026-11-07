import { expect, test } from 'claude-code/testing'
import {
  DEFAULT_CONFIG,
  parseConfig,
  parsePrefOverrides,
  patchConfig,
  resolvePrefs,
  ticketBranchFor,
  integrationBranchFor,
} from '../src/config'
import { PHASE_ORDER, PHASES, namespaced, predecessor, recognise } from '../src/phases'

const okValue = (raw: string | null) => {
  const loaded = parseConfig(raw)
  if (loaded.state !== 'ok') throw new Error(`expected ok, got ${loaded.state}`)
  return loaded
}

test('the default config has a phase row for every phase, with its first command', () => {
  expect(Object.keys(DEFAULT_CONFIG.phases)).toEqual(PHASE_ORDER)
  for (const id of PHASE_ORDER) {
    expect(DEFAULT_CONFIG.phases[id].command).toBe(PHASES[id].commands[0])
    expect(DEFAULT_CONFIG.phases[id].gate).toBe(PHASES[id].defaultGate)
  }
})

test('an absent file is absent and an empty object loads as the defaults', () => {
  expect(parseConfig(null)).toEqual({ state: 'absent' })
  expect(okValue('{}').value).toEqual(DEFAULT_CONFIG)
  expect(okValue('{}').problem).toBeUndefined()
})

test('text that is not a JSON object is invalid and says why', () => {
  expect(parseConfig('{nope').state).toBe('invalid')
  expect(parseConfig('[]')).toEqual({
    state: 'invalid',
    raw: '[]',
    problem: 'expected a JSON object',
  })
})

test('bad values fall back to their defaults and are named in the problem', () => {
  const raw = JSON.stringify({
    worktrees: { maxParallel: 'lots', tokenBudget: 5, copy: [1] },
    entry: { triage: { enterAt: 'nowhere' } },
    phases: { spec: { command: 'to-nothing', gate: false } },
  })
  const loaded = okValue(raw)
  expect(loaded.value.worktrees.maxParallel).toBe(3)
  expect(loaded.value.worktrees.tokenBudget).toBe(10_000)
  expect(loaded.value.worktrees.copy).toEqual(DEFAULT_CONFIG.worktrees.copy)
  expect(loaded.value.entry.triage.enterAt).toBe('bugs-build-else-align')
  expect(loaded.value.phases.spec).toEqual({ enabled: true, gate: false, command: 'to-spec' })
  for (const named of [
    'worktrees.maxParallel',
    'worktrees.copy',
    'enterAt',
    'phases.spec.command',
  ]) {
    expect(loaded.problem).toContain(named)
  }
})

test('a chosen alternative command is kept', () => {
  const loaded = okValue('{"phases":{"align":{"command":"grill-me"}}}')
  expect(loaded.value.phases.align.command).toBe('grill-me')
})

test('patching keeps unknown keys and untouched values byte for byte', () => {
  const raw =
    '{\n  "version": 1,\n  "custom": { "keep": [1, 2] },\n  "worktrees": { "maxParallel": 2, "x": true }\n}\n'
  const next = patchConfig(raw, { worktrees: { maxParallel: 4 } })
  expect(JSON.parse(next)).toEqual({
    version: 1,
    custom: { keep: [1, 2] },
    worktrees: { maxParallel: 4, x: true },
  })
  expect(next.endsWith('\n')).toBe(true)
  expect(patchConfig(next, { worktrees: { maxParallel: 4 } })).toBe(next)
})

test('patching an absent file starts from the defaults', () => {
  const next = patchConfig(null, { docs: { research: 'notes/' } })
  expect(okValue(next).value.docs.research).toBe('notes/')
  expect(okValue(next).value.worktrees).toEqual(DEFAULT_CONFIG.worktrees)
})

test('personal prefs: store overrides userConfig, junk in the store is dropped', () => {
  expect(resolvePrefs({ rail: false, rail_layout: 'summary', theme: 'dark' }, null)).toEqual({
    rail: false,
    railLayout: 'summary',
    theme: 'dark',
    ascii: false,
  })
  expect(resolvePrefs({ ascii_glyphs: true }, null).ascii).toBe(true)
  expect(resolvePrefs({ ascii_glyphs: true }, { ascii: false }).ascii).toBe(false)
  expect(resolvePrefs({ rail: false }, { rail: true, theme: 'light' })).toEqual({
    rail: true,
    railLayout: 'row',
    theme: 'light',
    ascii: false,
  })
  expect(parsePrefOverrides({ rail: 'yes', theme: 'neon', railLayout: 'row' })).toEqual({
    railLayout: 'row',
  })
  expect(parsePrefOverrides(7)).toEqual({})
})

test('branch names come from the templates', () => {
  expect(integrationBranchFor(DEFAULT_CONFIG, 'Export invoices as CSV')).toBe(
    'feat/export-invoices-as-csv',
  )
  expect(ticketBranchFor(DEFAULT_CONFIG, '#44', 'Ledger lines include tax columns')).toBe(
    'craftory/44-ledger-lines-include-tax',
  )
})

test('commands are recognised only in the plugin namespace by default', () => {
  expect(recognise('mattpocock-skills:to-spec')).toMatchObject({ kind: 'phase', phase: 'spec' })
  expect(recognise('/mattpocock-skills:code-review')).toMatchObject({
    kind: 'phase',
    phase: 'review',
  })
  expect(recognise('mattpocock-skills:tdd')).toMatchObject({ kind: 'helper', phase: 'build' })
  expect(recognise('mattpocock-skills:triage')).toMatchObject({ kind: 'entry', entry: 'triage' })
  expect(recognise('to-spec')).toBeUndefined()
  expect(recognise('to-spec', { bare: () => true })).toMatchObject({ phase: 'spec' })
  expect(recognise('to-spec', { bare: () => false })).toBeUndefined()
  expect(recognise('other:to-spec')).toBeUndefined()
  expect(namespaced(PHASES.spec.commands[0])).toBe('mattpocock-skills:to-spec')
})

test('the gate guarding a phase is the nearest enabled one before it', () => {
  expect(predecessor('build', p => p !== 'tickets')).toBe('spec')
  expect(predecessor('align', () => true)).toBeUndefined()
})

test('a committed branch template that git would read as an option falls back to the default', () => {
  const loaded = parseConfig(
    JSON.stringify({
      worktrees: {
        integrationBranch: '--upload-pack={spec-slug}',
        ticketBranch: 'ok/{ticket}-{slug}',
      },
    }),
  )
  expect(loaded.state).toBe('ok')
  if (loaded.state !== 'ok') return
  expect(loaded.value.worktrees.integrationBranch).toBe(DEFAULT_CONFIG.worktrees.integrationBranch)
  expect(loaded.value.worktrees.ticketBranch).toBe('ok/{ticket}-{slug}')
  expect(loaded.problem).toContain('worktrees.integrationBranch: not a safe branch name')
})

test('a worktree folder that leaves the repo falls back to the default with a note', () => {
  for (const folder of ['/tmp/wt', '../wt', 'a/../../wt', 'C:\\wt']) {
    const loaded = parseConfig(JSON.stringify({ worktrees: { folder } }))
    expect(loaded.state, folder).toBe('ok')
    if (loaded.state !== 'ok') continue
    expect(loaded.value.worktrees.folder, folder).toBe(DEFAULT_CONFIG.worktrees.folder)
    expect(loaded.problem, folder).toContain('worktrees.folder')
  }
  const fine = parseConfig(JSON.stringify({ worktrees: { folder: '.trees/' } }))
  expect(fine.state === 'ok' && fine.value.worktrees.folder).toBe('.trees/')
})

test('a .scratch ticket names its branch without the slash', () => {
  expect(ticketBranchFor(DEFAULT_CONFIG, 'csv-export/01', 'Export button')).toBe(
    'craftory/csv-export-01-export-button',
  )
})

test('the wayfinder suggestion defaults to long grills after 12 questions and can be turned off', () => {
  expect(okValue('{}').value.entry.wayfinder).toEqual({ suggest: 'long-grill', afterQuestions: 12 })
  const set = okValue('{"entry":{"wayfinder":{"suggest":"off","afterQuestions":5}}}')
  expect(set.value.entry.wayfinder).toEqual({ suggest: 'off', afterQuestions: 5 })
  expect(set.problem).toBeUndefined()
  const bad = okValue('{"entry":{"wayfinder":{"suggest":"on-ask"}}}')
  expect(bad.value.entry.wayfinder.suggest).toBe('long-grill')
  expect(bad.problem).toContain('entry.wayfinder.suggest')
})
