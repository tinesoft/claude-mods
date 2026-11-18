import type { SessionRateLimit } from 'claude-code'
import { type Engine, expect, test } from 'claude-code/testing'
import { agentCall, call, fakeGit, READY, start } from './build-harness'
import {
  allText,
  featureWorld,
  mountBand,
  mountPane,
  skillPrompt,
  startSession,
  submit,
  type WorldOptions,
} from './harness'

/** The harness clock starts here. */
const NOW = Date.parse('2026-11-18T12:00:00Z')
const IN_AN_HOUR = '2026-11-18T13:00:00Z'

/** A local 24-hour time: the zone is the test machine's. */
const TIME = String.raw`\d\d:\d\d`

const FULL: SessionRateLimit[] = [{ kind: 'five_hour', percentUsed: 84, resetsAt: IN_AN_HOUR }]
const CALM: SessionRateLimit[] = [{ kind: 'five_hour', percentUsed: 40, resetsAt: IN_AN_HOUR }]

const WARNING = new RegExp(
  `^5-hour window at 84% · Build runs 1 implementer at a time until it resets at ${TIME}$`,
)

const ready = (on: Parameters<typeof featureWorld>[0], options: WorldOptions = {}) =>
  featureWorld(on, {
    shell: fakeGit().shell,
    now: NOW,
    ...options,
    files: { ...READY, ...options.files },
  })

const building = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  options: WorldOptions = {},
) => {
  const w = ready(on, options)
  await startSession($)
  await skillPrompt($, 'implement-spec')
  return w
}

const bandLines = async ($: Engine) =>
  (await (await mountBand($, 'terminal', 200)).findAll({ type: 'Text' })).map(t => t.text)

test('while a window is Throttled, a second implementer is held, and the reason names the window and its reset', async ($, on) => {
  const w = await building(on, $, { rateLimits: () => FULL })
  await start($, 43, 'Export button')
  const second = await call($, agentCall(44, 'Ledger tax'))
  expect(second.deny).toMatch(
    new RegExp(
      `^Craftory holds csv/02: the 5-hour window is at 84% \\(resets ${TIME}\\), so at most 1 implementer runs at once\\. ` +
        'Start it after csv/01 returns, and do not call Agent for csv/02 again before then\\.$',
    ),
  )
  expect(w.calls.filter(c => c.tool === 'Agent')).toHaveLength(1)
})

test('under the threshold, Build runs up to maxParallel as before', async ($, on) => {
  await building(on, $, { rateLimits: () => CALM })
  await start($, 43, 'Export button')
  expect((await call($, agentCall(44, 'Ledger tax'))).deny).toBeUndefined()
})

test('a window that fills mid-Build throttles the next spawn, read from session.measure', async ($, on) => {
  await building(on, $, { rateLimits: () => CALM })
  await start($, 43, 'Export button')
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: FULL,
    changed: ['rateLimits'],
  } as never)
  expect((await call($, agentCall(44, 'Ledger tax'))).deny).toContain('Craftory holds csv/02')
})

test('the Build card says Throttled in its agents summary while throttling is in force', async ($, on) => {
  await building(on, $, { rateLimits: () => FULL })
  await start($, 43, 'Export button')
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  const text = await allText(await mountBand($, 'terminal', 200, 60))
  expect(text).toMatch(/1 running · [^\n]*· Throttled/)
})

test('without throttling the agents summary does not say Throttled', async ($, on) => {
  await building(on, $, { rateLimits: () => CALM })
  await start($, 43, 'Export button')
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  expect(await allText(await mountBand($, 'terminal', 200, 60))).not.toContain('Throttled')
})

test('a typed /implement-spec while a window is Throttled warns in the band and still runs', async ($, on) => {
  ready(on, { rateLimits: () => FULL })
  await startSession($)
  const result = await submit($, '/mattpocock-skills:implement-spec csv')
  expect(result.drop).toBeUndefined()
  expect(result.text).toBe('/mattpocock-skills:implement-spec csv')
  expect((await bandLines($)).some(l => WARNING.test(l))).toBe(true)
})

test('a typed /implement warns too', async ($, on) => {
  ready(on, { rateLimits: () => FULL })
  await startSession($)
  expect((await submit($, '/mattpocock-skills:implement csv/01')).drop).toBeUndefined()
  expect((await bandLines($)).some(l => WARNING.test(l))).toBe(true)
})

test('a rail press on Build while a window is Throttled warns and still runs the command', async ($, on) => {
  const w = ready(on, { rateLimits: () => FULL })
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-build' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'primary' })
  expect(w.commandsRun).toEqual([
    { command: 'mattpocock-skills:implement-spec', args: '.scratch/csv/spec.md' },
  ])
  expect((await bandLines($)).some(l => WARNING.test(l))).toBe(true)
})

test('Dismiss closes the warning', async ($, on) => {
  ready(on, { rateLimits: () => FULL })
  await startSession($)
  await submit($, '/mattpocock-skills:implement-spec csv')
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-dismiss-throttle' })
  expect((await bandLines($)).some(l => WARNING.test(l))).toBe(false)
})

test('no warning under the threshold, off a subscription, or with throttleAt 100', async ($, on) => {
  ready(on, {
    rateLimits: () => [{ kind: 'five_hour', percentUsed: 95 }],
    files: { '.craftory/config.json': JSON.stringify({ rateLimits: { throttleAt: 100 } }) },
  })
  await startSession($)
  await submit($, '/mattpocock-skills:implement-spec csv')
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('Build runs')
})

test('a phase other than Build is never warned about', async ($, on) => {
  ready(on, { rateLimits: () => FULL })
  await startSession($)
  await submit($, '/mattpocock-skills:to-tickets csv')
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('Build runs')
})

const issue = (status: string, title: string) => `# ${title}\n\nStatus: ${status}\nType: bug\n`

test('starting a ready bug at Build from the pane warns too', async ($, on) => {
  const w = featureWorld(on, {
    now: NOW,
    rateLimits: () => FULL,
    files: { '.scratch/inbox/issues/04-null-total.md': issue('ready-for-agent', 'Null total') },
  })
  await startSession($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-tickets' })
  await pane.redraw()
  await pane.press({ key: 'inbox-start-inbox/04' })
  expect(w.commandsRun).toContainEqual({
    command: 'mattpocock-skills:implement',
    args: '.scratch/inbox/issues/04-null-total.md',
  })
  expect((await bandLines($)).some(l => WARNING.test(l))).toBe(true)
})

test('a window at the threshold that lowers no limit is Throttled on its row, but not on the card, in the band or in a hold', async ($, on) => {
  const w = ready(on, {
    rateLimits: () => FULL,
    files: {
      '.craftory/config.json': JSON.stringify({
        worktrees: { maxParallel: 2 },
        rateLimits: { throttledParallel: 2 },
      }),
    },
  })
  await startSession($)
  await submit($, '/mattpocock-skills:implement-spec csv')
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('Build runs')
  await skillPrompt($, 'implement-spec')
  await start($, 43, 'Export button')
  expect((await call($, agentCall(44, 'Ledger tax'))).deny).toBeUndefined()
  expect(w.calls.filter(c => c.tool === 'Agent')).toHaveLength(2)
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  const text = await allText(await mountBand($, 'terminal', 200, 60))
  expect(text).toMatch(/5-hour 84% · [^\n]*Throttled/)
  expect(text).not.toMatch(/running · [^\n]*· Throttled/)
})

test('a typed /implement-spec warns where no band is drawn too, and the pane shows the warning', async ($, on) => {
  ready(on, { rateLimits: () => FULL, surfaces: ['mobile'] })
  await startSession($, 'mobile')
  const result = await submit($, '/mattpocock-skills:implement-spec csv')
  expect(result.drop).toBeUndefined()
  const pane = await mountPane($, 'mobile')
  expect((await pane.findAll({ type: 'Text' })).some(t => WARNING.test(t.text))).toBe(true)
})
