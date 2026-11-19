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
import { EFFORTS } from '../src/routing'
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
  expect(loaded.value.phases.spec).toEqual({
    enabled: true,
    gate: false,
    command: 'to-spec',
    model: 'session',
    effort: 'session',
  })
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
    askContext: true,
  })
  expect(resolvePrefs({ ascii_glyphs: true }, null).ascii).toBe(true)
  expect(resolvePrefs({ ascii_glyphs: true }, { ascii: false }).ascii).toBe(false)
  expect(resolvePrefs({ rail: false }, { rail: true, theme: 'light' })).toEqual({
    rail: true,
    railLayout: 'row',
    theme: 'light',
    ascii: false,
    askContext: true,
  })
  expect(parsePrefOverrides({ rail: 'yes', theme: 'neon', railLayout: 'row' })).toEqual({
    railLayout: 'row',
  })
  expect(parsePrefOverrides(7)).toEqual({})
})

test('personal prefs: the "anything to add" question is on unless turned off', () => {
  expect(resolvePrefs({}, null).askContext).toBe(true)
  expect(resolvePrefs({}, { askContext: false }).askContext).toBe(false)
  expect(parsePrefOverrides({ askContext: false })).toEqual({ askContext: false })
  expect(parsePrefOverrides({ askContext: 'no' })).toEqual({})
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

test('the deny rules are off by default and a bad value falls back with a note', () => {
  expect(okValue('{}').value.deny).toEqual({
    hardGates: false,
    skipGate: false,
    editOnIntegrationBranch: false,
    overBudget: false,
  })
  const set = okValue('{"deny":{"skipGate":true,"editOnIntegrationBranch":true,"overBudget":true}}')
  expect(set.value.deny).toEqual({
    hardGates: false,
    skipGate: true,
    editOnIntegrationBranch: true,
    overBudget: true,
  })
  const bad = okValue('{"deny":{"skipGate":"yes"}}')
  expect(bad.value.deny.skipGate).toBe(false)
  expect(bad.problem).toContain('deny.skipGate')
  const badBudget = okValue('{"deny":{"overBudget":1}}')
  expect(badBudget.value.deny.overBudget).toBe(false)
  expect(badBudget.problem).toContain('deny.overBudget')
})

test('worktrees.test is unset by default, and its timeout defaults to 600 s within 10 to 600', () => {
  expect(DEFAULT_CONFIG.worktrees.test).toBe('')
  expect(DEFAULT_CONFIG.worktrees.testTimeoutSec).toBe(600)
  const set = okValue('{"worktrees":{"test":"pnpm test","testTimeoutSec":120}}').value.worktrees
  expect(set).toMatchObject({ test: 'pnpm test', testTimeoutSec: 120 })
  expect(okValue('{"worktrees":{"testTimeoutSec":5000}}').value.worktrees.testTimeoutSec).toBe(600)
  expect(okValue('{"worktrees":{"testTimeoutSec":1}}').value.worktrees.testTimeoutSec).toBe(10)
  const bad = okValue('{"worktrees":{"test":["pnpm","test"],"testTimeoutSec":"slow"}}')
  expect(bad.value.worktrees).toMatchObject({ test: '', testTimeoutSec: 600 })
  expect(bad.problem).toContain('worktrees.test')
  expect(bad.problem).toContain('worktrees.testTimeoutSec')
})

test('budgets are off by default: no Feature budget, none per phase, Near budget at 80%', () => {
  const { budgets } = okValue('{}').value
  expect(budgets.featureUsd).toBe(0)
  expect(budgets.warnAtPercent).toBe(80)
  expect(Object.keys(budgets.phaseUsd)).toEqual(PHASE_ORDER)
  expect(Object.values(budgets.phaseUsd)).toEqual(PHASE_ORDER.map(() => 0))
})

test('budgets are whole dollars within their bounds, and a bad one falls back with a note', () => {
  const loaded = okValue(
    JSON.stringify({
      budgets: {
        featureUsd: 19.6,
        phaseUsd: { build: 250_000, align: -3, spec: 'lots' },
        warnAtPercent: 99,
      },
    }),
  )
  expect(loaded.value.budgets.featureUsd).toBe(20)
  expect(loaded.value.budgets.phaseUsd.build).toBe(100_000)
  expect(loaded.value.budgets.phaseUsd.align).toBe(0)
  expect(loaded.value.budgets.phaseUsd.spec).toBe(0)
  expect(loaded.value.budgets.warnAtPercent).toBe(95)
  expect(loaded.problem).toContain('budgets.phaseUsd.spec')
  expect(okValue('{"budgets":{"warnAtPercent":10}}').value.budgets.warnAtPercent).toBe(50)
})

test('rateLimits.throttleAt defaults to 80%, is clamped to 50 to 100, and falls back with a note', () => {
  expect(DEFAULT_CONFIG.rateLimits.throttleAt).toBe(80)
  expect(okValue('{"rateLimits":{"throttleAt":90}}').value.rateLimits.throttleAt).toBe(90)
  expect(okValue('{"rateLimits":{"throttleAt":100}}').value.rateLimits.throttleAt).toBe(100)
  expect(okValue('{"rateLimits":{"throttleAt":150}}').value.rateLimits.throttleAt).toBe(100)
  expect(okValue('{"rateLimits":{"throttleAt":10}}').value.rateLimits.throttleAt).toBe(50)
  expect(okValue('{"rateLimits":{"throttleAt":84.6}}').value.rateLimits.throttleAt).toBe(85)
  const bad = okValue('{"rateLimits":{"throttleAt":"high"}}')
  expect(bad.value.rateLimits.throttleAt).toBe(80)
  expect(bad.problem).toContain('rateLimits.throttleAt')
})

test('rateLimits.throttledParallel defaults to 1, is clamped to 1 to 16, and falls back with a note', () => {
  expect(DEFAULT_CONFIG.rateLimits.throttledParallel).toBe(1)
  expect(okValue('{"rateLimits":{"throttledParallel":2}}').value.rateLimits.throttledParallel).toBe(
    2,
  )
  expect(
    okValue('{"rateLimits":{"throttledParallel":40}}').value.rateLimits.throttledParallel,
  ).toBe(16)
  expect(okValue('{"rateLimits":{"throttledParallel":0}}').value.rateLimits.throttledParallel).toBe(
    1,
  )
  expect(
    okValue('{"rateLimits":{"throttledParallel":2.4}}').value.rateLimits.throttledParallel,
  ).toBe(2)
  const bad = okValue('{"rateLimits":{"throttledParallel":"one"}}')
  expect(bad.value.rateLimits.throttledParallel).toBe(1)
  expect(bad.problem).toContain('rateLimits.throttledParallel')
})

test('every phase runs its subagents on the session model and effort by default', () => {
  for (const id of PHASE_ORDER)
    expect(DEFAULT_CONFIG.phases[id]).toMatchObject({ model: 'session', effort: 'session' })
  expect(okValue('{}').problem).toBeUndefined()
})

test('a phase keeps a model alias or a full id, and any effort level', () => {
  const loaded = okValue(
    JSON.stringify({
      phases: {
        build: { model: 'sonnet', effort: 'medium' },
        review: { model: 'claude-opus-4-1-20250805', effort: 'max' },
      },
    }),
  )
  expect(loaded.value.phases.build).toMatchObject({ model: 'sonnet', effort: 'medium' })
  expect(loaded.value.phases.review).toMatchObject({
    model: 'claude-opus-4-1-20250805',
    effort: 'max',
  })
  expect(loaded.problem).toBeUndefined()
  for (const effort of EFFORTS)
    expect(okValue(JSON.stringify({ phases: { ship: { effort } } })).value.phases.ship.effort).toBe(
      effort,
    )
})

test('an unknown effort or a model that is no id falls back to session with a note', () => {
  const loaded = okValue(
    JSON.stringify({
      phases: { build: { effort: 'extreme' }, align: { model: 'my model; rm -rf' } },
    }),
  )
  expect(loaded.value.phases.build.effort).toBe('session')
  expect(loaded.value.phases.align.model).toBe('session')
  expect(loaded.problem).toContain('phases.build.effort')
  expect(loaded.problem).toContain('phases.align.model')
})
