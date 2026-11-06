import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { paint } from '../src/theme'
import { agentCall, building, call, fakeGit, start, step } from './build-harness'
import {
  allText,
  BAND_SURFACES,
  mountBand,
  startSession,
  texts,
  turnComplete,
  type WorldOptions,
} from './harness'

const usage = (fresh: number) => ({
  input_tokens: 0,
  output_tokens: fresh,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 400_000,
})

const TOKENS_BY_AGENT: Record<string, number> = {
  'agent-tu43': 63_200,
  'agent-tu44': 64_000,
  'agent-tu45': 80_000,
}

const atThresholds = async (
  on: Parameters<typeof building>[0],
  $: Engine,
  surface: 'terminal' | 'desktop',
  tone: 'light' | 'dark',
  extra: WorldOptions = {},
) => {
  const built = await building(on, $, {
    surfaces: [surface],
    theme: tone,
    usage: e => usage(TOKENS_BY_AGENT[e.agentId!] ?? 0),
    answer: e =>
      e.agentId === 'agent-tu43' ? 'Now red · test 4 of 5: the filter test fails.' : '',
    ...extra,
  })
  for (const [n, title] of [
    [43, 'Export button'],
    [44, 'Ledger tax'],
    [45, 'Date filter'],
  ] as const) {
    await start($, n, title)
    await step($, `agent-tu${n}`, 0)
  }
  return built
}

const openCard = async ($: Engine, surface: 'terminal' | 'desktop') => {
  const band = await mountBand($, surface, 200, 60)
  await band.press({ key: 'phase-build' })
  return mountBand($, surface, 200, 60)
}

for (const surface of BAND_SURFACES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`${surface} ${tone}: the bar is skill at 79%, amber at 80% and danger at 100%`, async ($, on) => {
      await atThresholds(on, $, surface, tone)
      if (surface === 'desktop') await startSession($, surface)
      const card = await openCard($, surface)
      const colour = (role: 'skill' | 'hook' | 'danger') => paint(role, tone).fg
      const expected = [
        ['#43', 'skill', '79%'],
        ['#44', 'hook', '80%'],
        ['#45', 'danger', '100%'],
      ] as const
      if (surface === 'desktop') {
        for (const [ref, role, width] of expected) {
          const fill = await card.find({ key: `agent-bar-fill-${ref}` })
          expect(fill?.props, ref).toMatchObject({ width, backgroundColor: colour(role) })
        }
        const over = paint('danger', tone)
        expect((await card.find({ key: 'badge-#45' }))?.props).toMatchObject({
          backgroundColor: over.bg,
          borderColor: over.bd,
        })
        const near = paint('hook', tone)
        expect((await card.find({ key: 'badge-#44' }))?.props).toMatchObject({
          backgroundColor: near.bg,
          borderColor: near.bd,
        })
      } else {
        const fills = (await card.findAll({ type: 'Text' })).filter(t => /^█+$/.test(t.text))
        expect(fills.map(f => [f.text.length, f.props.color])).toEqual(
          expected.map(([, role, width]) => [
            Math.round((parseInt(width) / 100) * 12),
            colour(role),
          ]),
        )
      }
    })
  }
}

test('terminal: each row shows id, title, badge, TDD step when said, tokens and time, worktree facts', async ($, on) => {
  await atThresholds(on, $, 'terminal', 'dark')
  const card = await openCard($, 'terminal')
  const text = await allText(card)
  expect(text).toContain('Agents 2 running · 1 over budget')
  expect(text).toContain('#43 Export button')
  const words = await texts(card)
  for (const badge of ['[Running]', '[Near budget]', '[Over budget]'])
    expect(words).toContain(badge)
  expect(words).toContain('red · test 4 of 5')
  expect(words.filter(w => w.startsWith('red'))).toHaveLength(1)
  expect(words).toContain('64.0k · —')
  expect(words).toContain('.claude/worktrees/43-export-button')
  expect(words).toContain('craftory/43-export-button')
  expect(words).toContain('One git worktree per agent · 80k token budget each')
  expect(await card.find({ key: 'agents-pause' })).toBeDefined()
  expect(await card.find({ key: 'agents-open-panel' })).toBeDefined()
})

test('Pause all asks the running agents to stop after their step and queues new ones until Resume', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  await start($, 44, 'Ledger tax')
  const card = await openCard($, 'terminal')
  await card.press({ key: 'agents-pause' })
  expect(w.sent.map(m => m.text)).toEqual([
    expect.stringContaining('the user paused Build'),
    expect.stringContaining('the user paused Build'),
  ])
  const queued = await call($, agentCall(45, 'Date filter'))
  expect(queued.deny).toContain('Build is paused')
  expect(await texts(await mountBand($, 'terminal', 200, 60))).toContain('[ Resume ]')
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'agents-pause' })
  expect(w.toasts.at(-1)).toBe('Build resumed · ask Claude to start the queued tickets')
  expect((await call($, agentCall(45, 'Date filter'))).deny).toBeUndefined()
})

test('an agent that reports after Pause all is recorded as stopped, not done', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  await (await openCard($, 'terminal')).press({ key: 'agents-pause' })
  await turnComplete($, { agentId: 'agent-tu43' })
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.agents['#43'].outcome).toBe('stopped')
})

test('Open panel opens the pane on the Worktrees tab', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  await (await openCard($, 'terminal')).press({ key: 'agents-open-panel' })
  expect(w.opens).toEqual([expect.objectContaining({ id: 'craftory' })])
})

test('a worktree that cannot be made shows as an info row on the card', async ($, on) => {
  await building(on, $, {
    shell: argv =>
      argv[1] === 'worktree' && argv[2] === 'add'
        ? { exitCode: 128, stderr: 'fatal: not a git repository' }
        : fakeGit().shell(argv, undefined),
  })
  await start($, 43, 'Export button')
  const words = await texts(await openCard($, 'terminal'))
  expect(words).toContain(
    'Craftory could not make .claude/worktrees/43-export-button: fatal: not a git repository',
  )
})

test('an over-budget row offers Raise budget, and a failed row offers Diagnose', async ($, on) => {
  const { w } = await building(on, $, {
    usage: e => usage(e.agentId === 'agent-tu44' ? 80_000 : 100),
  })
  await start($, 44, 'Ledger tax')
  await start($, 45, 'Date filter')
  await step($, 'agent-tu44', 0)
  await turnComplete($, { agentId: 'agent-tu45', reason: 'error' })
  const card = await openCard($, 'terminal')
  const words = await texts(card)
  expect(words).toContain('[Over budget]')
  expect(words).toContain('[Failed]')
  await card.press({ key: 'agent-diagnose-#45' })
  expect(w.commandsRun.at(-1)).toEqual({
    command: 'mattpocock-skills:diagnosing-bugs',
    args: 'Agent #45 failed',
  })
  await (await openCard($, 'terminal')).press({ key: 'agent-raise-#44' })
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.agents['#44'].budget).toBe(160_000)
  expect(await texts(await mountBand($, 'terminal', 200, 60))).toContain('[Stopped]')
})

test('without Settings › live agents the card has no list', async ($, on) => {
  await building(on, $, {
    files: { '.craftory/config.json': JSON.stringify({ automation: { liveAgents: false } }) },
  })
  await start($, 43, 'Export button')
  const card = await openCard($, 'terminal')
  expect(await card.find({ key: 'agents' })).toBeUndefined()
  expect(await allText(card)).toContain('Phase 4 of 7')
})
