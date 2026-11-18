import { type Engine, expect, test } from 'claude-code/testing'
import { overrunOf } from '../src/budgets'
import { DEFAULT_CONFIG } from '../src/config'
import { overBudgetDenial, ruleVia } from '../src/deny'
import { serialiseSpendFile } from '../src/spend'
import type { PhaseId, SpendRow } from '../types'
import { agentCall, call, fakeGit, READY, start } from './build-harness'
import {
  allText,
  featureJson,
  featureWorld,
  mountBand,
  skillPrompt,
  startSession,
  submit,
  type WorldOptions,
} from './harness'

/** Another session's committed spend on `phase` of the csv Feature. */
const spendFile = (phase: PhaseId, usd: number) =>
  serialiseSpendFile({
    version: 1,
    session: 's0',
    startedAt: '2026-11-16T10:00:00.000Z',
    rows: [
      {
        feature: 'spec:csv' as SpendRow['feature'],
        phase,
        ticket: null,
        agentId: null,
        model: 'claude-opus-5-5',
        tokens: { input: 2_000, output: 1_000, cacheRead: 7_000, cacheWrite: 0 },
        usd,
        isEstimated: false,
        steps: 4,
      },
    ],
  })

type Setup = {
  deny?: Record<string, boolean>
  budgets?: Record<string, unknown>
  /** The Feature record's own budgets. */
  own?: Record<string, unknown>
  usd?: number
  phase?: PhaseId
  /** The host keeps a cost ledger. */
  cost?: boolean
  options?: WorldOptions
}

const BUILD_12 = { phaseUsd: { build: 12 } }

/** The csv Feature, Build next, having spent `usd` (12.40) on `phase` (Build). */
const spent = (on: Parameters<typeof featureWorld>[0], setup: Setup = {}) => {
  const { deny = { overBudget: true }, budgets = BUILD_12, own, usd = 12.4 } = setup
  return featureWorld(on, {
    shell: fakeGit().shell,
    ...(setup.cost !== false && { cost: () => 0 }),
    ...setup.options,
    files: {
      ...READY,
      '.craftory/spend/csv/s0.json': spendFile(setup.phase ?? 'build', usd),
      '.craftory/config.json': JSON.stringify({ version: 1, deny, budgets }),
      ...(own && { '.craftory/features/csv.json': featureJson({ budgets: own }) }),
    },
  })
}

const skill = ($: Engine, name: string) =>
  $.tool.call({ tool: 'Skill', tool_use_id: 'sk1', skill: name } as never)

const SWITCH = (rule: string) =>
  `This is the deny.${rule} rule; turn it off in Settings › Automation, or set "deny": { "${rule}": false } in .craftory/config.json.`

const BUILD_OVER = (what: string, rule = 'overBudget') =>
  `Craftory denied ${what}: Build is at $12.40 of $12, over its budget. ${SWITCH(rule)}`

const IMPLEMENT = 'mattpocock-skills:implement-spec'

const pressBuild = async ($: Engine) => {
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-build' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'primary' })
  return mountBand($, 'terminal', 200)
}

const recordOf = (w: { files: Map<string, string> }) =>
  JSON.parse(w.files.get('.craftory/features/csv.json')!) as { budgets?: unknown }

// Seam 1: the pure core

test('ruleVia takes overBudget, and hardGates turns it on', () => {
  const deny = DEFAULT_CONFIG.deny
  expect(deny.overBudget).toBe(false)
  expect(ruleVia(deny, 'overBudget')).toBeNull()
  expect(ruleVia({ ...deny, overBudget: true }, 'overBudget')).toBe('overBudget')
  expect(ruleVia({ ...deny, hardGates: true }, 'overBudget')).toBe('hardGates')
})

const defaults = {
  ...DEFAULT_CONFIG.budgets,
  featureUsd: 20,
  phaseUsd: { ...DEFAULT_CONFIG.budgets.phaseUsd, build: 12 },
}
const over = (phaseUsd: number | null, featureUsd: number | null, hasCost = true) =>
  overrunOf({ phase: 'build', phaseUsd, featureUsd, title: 'CSV', budgets: defaults, hasCost })

test('overrunOf names the phase first, then the Feature, and only on a positive over', () => {
  expect(over(12.4, 12.4)).toEqual({ scope: 'build', name: 'Build', usd: 12.4, budget: 12 })
  expect(over(3, 20.1)).toEqual({ scope: 'feature', name: 'CSV', usd: 20.1, budget: 20 })
  expect(over(11.9, 19.9)).toBeNull()
  expect(over(null, null)).toBeNull()
  expect(over(12.4, 20.1, false)).toBeNull()
  expect(
    overrunOf({
      phase: 'build',
      phaseUsd: 99,
      featureUsd: 99,
      title: 'CSV',
      budgets: DEFAULT_CONFIG.budgets,
      hasCost: true,
    }),
  ).toBeNull()
})

test('overBudgetDenial names what it refuses, the spend, the budget and the switch', () => {
  const overrun = { scope: 'build', name: 'Build', usd: 12.4, budget: 12 } as const
  expect(overBudgetDenial(IMPLEMENT, overrun, 'overBudget')).toBe(BUILD_OVER(IMPLEMENT))
  expect(overBudgetDenial(IMPLEMENT, overrun, 'hardGates')).toBe(BUILD_OVER(IMPLEMENT, 'hardGates'))
})

// Seam 2: the hooks in the fake world

test('a typed phase command is refused once its phase is over budget', async ($, on) => {
  const w = spent(on)
  await startSession($)
  expect(await submit($, `/${IMPLEMENT} .scratch/csv/spec.md`)).toEqual({
    drop: BUILD_OVER(IMPLEMENT),
  })
  expect((await submit($, '/implement-spec')).drop).toBe(BUILD_OVER(IMPLEMENT))
  expect(w.submitted).toEqual([])
})

test('Claude’s Skill call for a phase over budget is refused with the same reason', async ($, on) => {
  const w = spent(on)
  await startSession($)
  expect(await skill($, IMPLEMENT)).toEqual({ deny: BUILD_OVER(IMPLEMENT) })
  expect(w.calls.some(c => c.tool === 'Skill')).toBe(false)
})

test('a Feature over its budget refuses every phase skill, naming the Feature', async ($, on) => {
  spent(on, { budgets: { featureUsd: 10 } })
  await startSession($)
  expect((await skill($, 'mattpocock-skills:to-spec')).deny).toBe(
    `Craftory denied mattpocock-skills:to-spec: Export invoices as CSV is at $12.40 of $10, over its budget. ${SWITCH('overBudget')}`,
  )
})

test('a phase over its own budget leaves the other phases alone', async ($, on) => {
  spent(on)
  await startSession($)
  expect(await skill($, 'mattpocock-skills:to-spec')).toEqual({ result: 'ran' })
  expect(await skill($, 'pdf')).toEqual({ result: 'ran' })
})

test('the Feature’s own phase budget is the one refused against', async ($, on) => {
  spent(on, { budgets: { phaseUsd: { build: 50 } }, own: { phases: { build: 12 } } })
  await startSession($)
  expect((await skill($, IMPLEMENT)).deny).toBe(BUILD_OVER(IMPLEMENT))
})

test('hardGates turns overBudget on, and the refusal names hardGates', async ($, on) => {
  spent(on, { deny: { hardGates: true } })
  await startSession($)
  expect((await skill($, IMPLEMENT)).deny).toBe(BUILD_OVER(IMPLEMENT, 'hardGates'))
})

const FAIL_OPEN: [string, Setup][] = [
  ['off', { deny: {} }],
  ['under budget', { usd: 9 }],
  ['with no budget', { budgets: {} }],
  ['without a cost ledger', { cost: false }],
  ['on spend of another phase', { phase: 'spec' }],
]

for (const [why, setup] of FAIL_OPEN)
  test(`overBudget lets the call through ${why}`, async ($, on) => {
    spent(on, setup)
    await startSession($)
    expect(await skill($, IMPLEMENT)).toEqual({ result: 'ran' })
    expect((await submit($, '/implement-spec')).drop).toBeUndefined()
  })

test('an invalid config.json refuses nothing', async ($, on) => {
  featureWorld(on, {
    shell: fakeGit().shell,
    cost: () => 0,
    files: {
      ...READY,
      '.craftory/spend/csv/s0.json': spendFile('build', 12.4),
      '.craftory/config.json': '{nope',
    },
  })
  await startSession($)
  expect(await skill($, IMPLEMENT)).toEqual({ result: 'ran' })
})

test('a rail press over budget is refused in the band with Raise budget and Diagnose, no Run anyway', async ($, on) => {
  const w = spent(on)
  await startSession($)
  const band = await pressBuild($)
  expect(w.commandsRun).toEqual([])
  const text = await allText(band)
  expect(text).toContain('Build is at $12.40 of $12')
  expect(text).toContain('deny.overBudget')
  expect(await band.find({ key: 'notice-raise-refused-budget-build' })).toBeDefined()
  expect(await band.find({ key: 'notice-diagnose-over-budget-build' })).toBeDefined()
  expect(await band.find({ key: 'notice-run-anyway-build' })).toBeUndefined()
})

test('Raise budget sets the Feature’s own budget to half again, and the press then runs', async ($, on) => {
  const w = spent(on)
  await startSession($)
  await (await pressBuild($)).press({ key: 'notice-raise-refused-budget-build' })
  expect(recordOf(w).budgets).toEqual({ phases: { build: 18 } })
  const band = await mountBand($, 'terminal', 200)
  expect(await allText(band)).not.toContain('Build is at $12.40')
  await band.press({ key: 'primary' })
  expect(w.commandsRun).toEqual([{ command: IMPLEMENT, args: '.scratch/csv/spec.md' }])
})

test('Raise budget on the Feature rounds half again up to a whole dollar', async ($, on) => {
  const w = spent(on, { budgets: { featureUsd: 5 } })
  await startSession($)
  await (await pressBuild($)).press({ key: 'notice-raise-refused-budget-feature' })
  expect(recordOf(w).budgets).toEqual({ usd: 8 })
})

test('with overBudget off, a rail press over budget runs', async ($, on) => {
  const w = spent(on, { deny: {} })
  await startSession($)
  await pressBuild($)
  expect(w.commandsRun).toEqual([{ command: IMPLEMENT, args: '.scratch/csv/spec.md' }])
})

test('a Build spawn is refused once Build is over budget, with the reason', async ($, on) => {
  const w = spent(on)
  await startSession($)
  await skillPrompt($, 'implement-spec')
  const refused = await call($, agentCall(43, 'Export button'))
  expect(refused.deny).toBe(BUILD_OVER('the agent for csv/01'))
  expect(w.calls.filter(c => c.tool === 'Agent')).toHaveLength(0)
})

test('a Build spawn under budget, or with overBudget off, starts', async ($, on) => {
  spent(on, { deny: {} })
  await startSession($)
  await skillPrompt($, 'implement-spec')
  expect((await start($, 43, 'Export button')).deny).toBeUndefined()
})
