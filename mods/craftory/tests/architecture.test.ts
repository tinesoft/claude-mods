import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  allText,
  featureJson,
  featureWorld,
  mountBand,
  mountPane,
  skillPrompt,
  startSession,
  texts,
  turnComplete,
  type WorldOptions,
} from './harness'
import { building, start } from './build-harness'

const ON = { '.craftory/config.json': JSON.stringify({ automation: { weeklyArchitecture: true } }) }
const STATE = '.craftory/state.json'
const NOW = Date.parse('2026-11-10T09:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const ranDaysAgo = (days: number) =>
  JSON.stringify({ architectureLastRun: new Date(NOW - days * DAY).toISOString() })

const NOTICE = 'Weekly architecture check is due · look for deepening opportunities'
const RUN = 'notice-run-architecture'
const DISMISS = 'notice-dismiss-architecture'
const ARGS = 'File each finding as an issue in the tracker with the needs-triage label.'

const session = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  files: Record<string, string> = {},
  options: WorldOptions = {},
) => {
  const w = featureWorld(on, { now: NOW, ...options, files: { ...ON, ...files } })
  await startSession($)
  return w
}

const band = async ($: Engine) => allText(await mountBand($, 'terminal', 200))

test('off by default: no notice even when the check has never run', async ($, on) => {
  await session(on, $, { '.craftory/config.json': '{}' })
  expect(await band($)).not.toContain(NOTICE)
})

test('a repo that never ran the check is offered it at session start', async ($, on) => {
  await session(on, $)
  expect(await band($)).toContain(NOTICE)
})

test('a last run over 7 days old raises the notice', async ($, on) => {
  await session(on, $, { [STATE]: ranDaysAgo(8) })
  expect(await band($)).toContain(NOTICE)
})

test('a last run within 7 days stays silent', async ($, on) => {
  await session(on, $, { [STATE]: ranDaysAgo(6) })
  expect(await band($)).not.toContain(NOTICE)
})

test('it is skipped while a Build agent is running', async ($, on) => {
  await building(on, $, { now: NOW, files: ON })
  await start($, 43, 'Export button')
  await startSession($)
  expect(await band($)).not.toContain(NOTICE)
})

test('an abandoned Build, run but with nothing running now, does not block it', async ($, on) => {
  const AT = '2026-11-09T10:00:00Z'
  await session(on, $, {
    '.craftory/features/csv.json': featureJson({
      marks: { align: { ranAt: AT }, spec: { ranAt: AT }, build: { ranAt: AT } },
    }),
  })
  expect(await band($)).toContain(NOTICE)
})

test('the click submits /improve-codebase-architecture asking for needs-triage findings, which reach the Inbox', async ($, on) => {
  const w = await session(on, $)
  await (await mountBand($, 'terminal', 200)).press({ key: RUN })
  expect(w.commandsRun).toEqual([
    { command: 'mattpocock-skills:improve-codebase-architecture', args: ARGS },
  ])
  expect(w.writes.filter(x => x.path === STATE)).toEqual([])
  await skillPrompt($, 'improve-codebase-architecture')
  w.files.set(
    '.scratch/inbox/issues/01-deepen-ledger.md',
    '# Deepen the ledger module\n\nStatus: needs-triage\n',
  )
  await turnComplete($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-tickets' })
  await pane.redraw()
  const words = await texts(pane)
  expect(words).toContain('Deepen the ledger module')
  expect(words.some(t => t.startsWith('needs-triage'))).toBe(true)
})

test('the done report records architectureLastRun, so the next session is silent', async ($, on) => {
  const w = await session(on, $, { [STATE]: '{"other":1}' })
  await (await mountBand($, 'terminal', 200)).press({ key: RUN })
  await skillPrompt($, 'improve-codebase-architecture')
  await turnComplete($)
  expect(JSON.parse(w.files.get(STATE)!)).toEqual({
    other: 1,
    architectureLastRun: '2026-11-10T09:00:00.000Z',
  })
  await startSession($)
  expect(await band($)).not.toContain(NOTICE)
})

test('a cancelled run leaves architectureLastRun unchanged', async ($, on) => {
  const old = ranDaysAgo(9)
  const w = await session(on, $, { [STATE]: old })
  await (await mountBand($, 'terminal', 200)).press({ key: RUN })
  await skillPrompt($, 'improve-codebase-architecture')
  await turnComplete($, { isAborted: true, reason: 'aborted' })
  expect(w.files.get(STATE)).toBe(old)
  await turnComplete($)
  expect(w.files.get(STATE)).toBe(old)
})

test('a dismiss silences it for the session', async ($, on) => {
  const w = await session(on, $)
  await (await mountBand($, 'terminal', 200)).press({ key: DISMISS })
  expect(await band($)).not.toContain(NOTICE)
  await turnComplete($)
  expect(await band($)).not.toContain(NOTICE)
  expect(w.commandsRun).toEqual([])
  expect(w.writes.filter(x => x.path === STATE)).toEqual([])
})

test("a subagent's run of the skill does not count as the check", async ($, on) => {
  // the Skill tool expands the skill's prompt while it runs, inside the subagent's call
  on('tool.call', { tool: 'Skill' }, async () => {
    await skillPrompt($, 'improve-codebase-architecture')
    return { result: 'ran' }
  })
  const old = ranDaysAgo(9)
  const w = await session(on, $, { [STATE]: old })
  await $.tool.call({
    tool: 'Skill',
    tool_use_id: 'sk1',
    skill: 'mattpocock-skills:improve-codebase-architecture',
    agentId: 'a1',
  } as never)
  await turnComplete($)
  expect(w.files.get(STATE)).toBe(old)
})
