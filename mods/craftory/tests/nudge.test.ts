import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { nudgeText } from '../src/automations'
import {
  allText,
  featureRepo,
  featureWorld,
  mountBand,
  skillPrompt,
  startSession,
  submit,
  turnComplete,
  type WorldOptions,
} from './harness'

const ON = { '.craftory/config.json': JSON.stringify({ automation: { nudgeUnmetDone: true } }) }

const ALIGN =
  'Align is still running: no spec has been created yet. Ask for it, or mark Align done.'
const TICKETS =
  'Tickets is still running: no .scratch/<feature>/issues/NN-*.md files with Blocked by: edges exist yet. Ask for it, or mark Tickets done.'

/** A repo with no Feature yet: a grill starts one as a draft. */
const fresh = (on: Parameters<typeof featureWorld>[0], options: WorldOptions = {}) =>
  featureWorld(on, {
    ...options,
    files: { '.craftory/features/csv.json': '', ...ON, ...options.files },
  })

/** The `csv` Feature with its spec but no tickets yet. */
const untickted = (on: Parameters<typeof featureWorld>[0], files: Record<string, string> = ON) => {
  const w = featureWorld(on, { files })
  for (const path of Object.keys(featureRepo())) if (path.includes('/issues/')) w.files.delete(path)
  return w
}

const band = async ($: Engine) => allText(await mountBand($, 'terminal', 200))

test('a grill turn that ends with no spec yet names Align and quotes its evidence', async ($, on) => {
  const w = fresh(on)
  await startSession($)
  await skillPrompt($, 'grill-with-docs')
  await turnComplete($)
  expect(await band($)).toContain(ALIGN)
  expect(w.commandsRun).toEqual([])
})

test('a tickets turn that writes no tickets quotes the Local Done-when, with Dismiss and no run action', async ($, on) => {
  const w = untickted(on)
  await startSession($)
  await skillPrompt($, 'to-tickets')
  await turnComplete($)
  const drawn = await mountBand($, 'terminal', 200)
  expect(await allText(drawn)).toContain(TICKETS)
  expect(await drawn.find({ key: 'notice-run-nudge-tickets' })).toBeUndefined()
  expect(await drawn.find({ key: 'notice-dismiss-nudge-tickets' })).toBeDefined()
  expect(w.commandsRun).toEqual([])
})

test('it is silent when the turn leaves the evidence in place', async ($, on) => {
  const w = untickted(on)
  await startSession($)
  await skillPrompt($, 'to-tickets')
  w.files.set(
    '.scratch/csv/issues/01-button.md',
    '# 01: Export button\n\nStatus: ready-for-agent\n',
  )
  w.files.set(
    '.scratch/csv/issues/02-ledger.md',
    '# 02: Ledger tax\n\nStatus: ready-for-agent\nBlocked by: 01\n',
  )
  await turnComplete($)
  expect(await band($)).not.toContain('is still running')
})

test('it fires at most once per phase for the Feature, across turns and sessions', async ($, on) => {
  const w = untickted(on)
  await startSession($)
  await skillPrompt($, 'to-tickets')
  await turnComplete($)
  expect((await band($)).split(TICKETS)).toHaveLength(2)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-dismiss-nudge-tickets' })
  await skillPrompt($, 'to-tickets')
  await turnComplete($)
  expect(await band($)).not.toContain(TICKETS)
  expect(
    JSON.parse(w.files.get('.craftory/features/csv.json')!).marks.tickets.nudgedAt,
  ).toBeDefined()
  await startSession($)
  await skillPrompt($, 'to-tickets')
  await turnComplete($)
  expect(await band($)).not.toContain(TICKETS)
})

test("a dismissed Align nudge stays gone on the grill's later turns", async ($, on) => {
  fresh(on)
  await startSession($)
  await skillPrompt($, 'grill-with-docs')
  await turnComplete($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-dismiss-nudge-align' })
  await submit($, 'yes')
  await turnComplete($)
  expect(await band($)).not.toContain(ALIGN)
})

test('with the switch off no turn raises a nudge', async ($, on) => {
  untickted(on, { '.craftory/config.json': '{}' })
  await startSession($)
  await skillPrompt($, 'to-tickets')
  await turnComplete($)
  expect(await band($)).not.toContain('is still running')
})

test('on GitHub the wording quotes the tracker column of the Phase evidence table', () => {
  expect(nudgeText('tickets', 'github')).toBe(
    'Tickets is still running: no sub-issues of the spec exist yet. Ask for it, or mark Tickets done.',
  )
})
