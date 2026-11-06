import { expect, test } from 'claude-code/testing'
import { allText, mountBand } from './harness'
import { building, fakeGit, OVER, start, step } from './build-harness'

test('hitting the budget raises one toast and a band row, and Raise budget adds one step to the record', async ($, on) => {
  const { w } = await building(on, $, { usage: () => OVER })
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu44', 0)
  expect(w.toasts).toEqual(['Agent csv/02 hit its 80k budget · worktree kept'])
  const band = await mountBand($, 'terminal', 200)
  expect(await allText(band)).toContain('Agent csv/02 hit its 80k budget · worktree kept')
  await band.press({ key: 'notice-raise-budget-csv/02' })
  const record = JSON.parse(w.files.get('.craftory/features/csv.json')!)
  expect(record.agents['csv/02']).toMatchObject({
    outcome: 'over-budget',
    tokens: 80_000,
    budget: 160_000,
  })
  expect(w.toasts.at(-1)).toBe('Budget for csv/02 raised to 160k · run it again to continue')
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('hit its 80k budget')
})

test('a merge conflict stops the agent, toasts once, and Resolve opens the Worktrees tab', async ($, on) => {
  const git = fakeGit({
    status: path => (path.endsWith('csv-02-ledger-tax') ? 'UU src/a.ts\n' : ''),
  })
  const { w } = await building(on, $, { shell: git.shell })
  await start($, 44, 'Ledger tax')
  expect(w.toasts).toEqual([
    'Rebase conflict in .claude/worktrees/csv-02-ledger-tax · agent stopped',
  ])
  expect(w.sent).toEqual([])
  const stopped = await step($, 'agent-tu44', 0)
  expect(stopped.result.answer).toBe(
    'Stopped by Craftory: csv/02 stopped on a merge conflict after the integration branch moved, and was ended. ' +
      'Its worktree .claude/worktrees/csv-02-ledger-tax is kept. ' +
      'Do not restart csv/02, merge, or remove the worktree. Tell the user which files conflict and that they resolve it, then carry on with the other tickets.',
  )
  const band = await mountBand($, 'terminal', 200)
  await band.press({ key: 'notice-resolve-csv/02' })
  expect(w.opens).toEqual([expect.objectContaining({ id: 'craftory' })])
})

const DIAGNOSE = {
  command: 'mattpocock-skills:diagnosing-bugs',
  args: 'Agent csv/02 hit its 80k budget',
}

test('Diagnose on a budget notice drops the notice and runs diagnosing-bugs', async ($, on) => {
  const { w } = await building(on, $, { usage: () => OVER })
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu44', 0)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-diagnose-csv/02' })
  expect(w.commandsRun.at(-1)).toEqual(DIAGNOSE)
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('hit its 80k budget')
})

test('Raise budget on the card clears the budget notice, as it does from the notice', async ($, on) => {
  const { w } = await building(on, $, { usage: () => OVER })
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu44', 0)
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'agent-raise-csv/02' })
  const record = JSON.parse(w.files.get('.craftory/features/csv.json')!)
  expect(record.agents['csv/02'].budget).toBe(160_000)
  expect(await allText(await mountBand($, 'terminal', 200, 60))).not.toContain('hit its 80k budget')
})

test('Diagnose on the card closes the card and goes through the same run request as the notice', async ($, on) => {
  const { w } = await building(on, $, { usage: () => OVER })
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu44', 0)
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'diagnose' })
  expect(w.commandsRun.at(-1)).toEqual({ command: DIAGNOSE.command, args: 'Build is failing' })
  expect(await (await mountBand($, 'terminal', 200, 60)).find({ key: 'card' })).toBeUndefined()
})

test("Diagnose asks what to diagnose and passes the user's own words along with the failure", async ($, on) => {
  const { w } = await building(on, $, {
    usage: () => OVER,
    ask: q => (q.startsWith('What should be diagnosed?') ? 'only on CI' : undefined),
  })
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu44', 0)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-diagnose-csv/02' })
  expect(w.commandsRun.at(-1)).toEqual({
    command: DIAGNOSE.command,
    args: 'Agent csv/02 hit its 80k budget. only on CI',
  })
})
