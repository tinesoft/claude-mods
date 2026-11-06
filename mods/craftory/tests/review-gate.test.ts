import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { featureWorld, MATT_SKILLS, mattCommands, startSession, ticketFile } from './harness'

const GATE = 'Review is gated: csv/01, csv/02, csv/03 not merged yet. Run anyway?'

const skill = ($: Engine, name: string) =>
  $.tool.call({ tool: 'Skill', tool_use_id: 'sk1', skill: name } as never)

const asked = (calls: Record<string, unknown>[]) =>
  calls
    .filter(c => c.tool === 'AskUserQuestion')
    .map(c => (c.questions as { question: string }[])[0]!.question)

test('code-review before Build is done asks the user; Diagnose first refuses the call', async ($, on) => {
  const w = featureWorld(on, { ask: () => 'Diagnose first' })
  await startSession($)
  const result = await skill($, 'mattpocock-skills:code-review')
  expect(asked(w.calls)).toEqual([GATE])
  expect(result.deny).toContain('diagnose')
  expect(result.deny).toContain('mattpocock-skills:diagnosing-bugs')
  expect(w.calls.some(c => c.tool === 'Skill')).toBe(false)
})

test('Run anyway lets the code-review call through untouched', async ($, on) => {
  const w = featureWorld(on, { ask: () => 'Run anyway' })
  await startSession($)
  expect(await skill($, 'mattpocock-skills:code-review')).toEqual({ result: 'ran' })
  expect(w.calls.some(c => c.tool === 'Skill' && c.skill === 'mattpocock-skills:code-review')).toBe(
    true,
  )
})

test('when nobody can be asked the call is allowed: guide, never gate', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  expect(await skill($, 'mattpocock-skills:code-review')).toEqual({ result: 'ran' })
  expect(asked(w.calls)).toEqual([GATE])
})

test('a Skill call that is not code-review passes without a question', async ($, on) => {
  const w = featureWorld(on, { ask: () => 'Diagnose first' })
  await startSession($)
  expect(await skill($, 'mattpocock-skills:tdd')).toEqual({ result: 'ran' })
  expect(await skill($, 'pdf')).toEqual({ result: 'ran' })
  expect(asked(w.calls)).toEqual([])
})

test('with Build done, code-review runs without a question', async ($, on) => {
  const merged = (n: number, title: string, blocked: number[] = []) =>
    ticketFile(n, title, blocked).replace('ready-for-agent', 'done')
  const w = featureWorld(on, {
    ask: () => 'Diagnose first',
    files: {
      '.scratch/csv/issues/01-button.md': merged(1, 'Export button'),
      '.scratch/csv/issues/02-ledger.md': merged(2, 'Ledger tax', [1]),
      '.scratch/csv/issues/03-filter.md': merged(3, 'Date filter', [1]),
    },
  })
  await startSession($)
  expect(await skill($, 'mattpocock-skills:code-review')).toEqual({ result: 'ran' })
  expect(asked(w.calls)).toEqual([])
})

test("a built-in code-review is not Matt's: its bare use passes, while the namespaced name is still gated", async ($, on) => {
  const w = featureWorld(on, {
    ask: () => 'Run anyway',
    commands: [
      ...mattCommands(...MATT_SKILLS),
      { name: 'code-review', description: 'built in', source: 'builtin' },
    ],
  })
  await startSession($)
  expect(await skill($, 'code-review')).toEqual({ result: 'ran' })
  expect(asked(w.calls)).toEqual([])
  expect(await skill($, 'mattpocock-skills:code-review')).toEqual({ result: 'ran' })
  expect(asked(w.calls)).toEqual([GATE])
})
