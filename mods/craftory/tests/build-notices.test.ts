import { expect, test } from 'claude-code/testing'
import { allText, mountBand } from './harness'
import { building, fakeGit, OVER, start, step } from './build-harness'

test('hitting the budget raises one toast and a band row, and Raise budget adds one step to the record', async ($, on) => {
  const { w } = await building(on, $, { usage: () => OVER })
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu44', 0)
  expect(w.toasts).toEqual(['Agent #44 hit its 80k budget · worktree kept'])
  const band = await mountBand($, 'terminal', 200)
  expect(await allText(band)).toContain('Agent #44 hit its 80k budget · worktree kept')
  await band.press({ key: 'notice-raise-budget-#44' })
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.agents['#44']).toMatchObject({
    outcome: 'over-budget',
    tokens: 80_000,
    budget: 160_000,
  })
  expect(w.toasts.at(-1)).toBe('Budget for #44 raised to 160k · run it again to continue')
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('hit its 80k budget')
})

test('a merge conflict stops the agent, toasts once, and Resolve opens the Worktrees tab', async ($, on) => {
  const git = fakeGit({ status: path => (path.endsWith('44-ledger-tax') ? 'UU src/a.ts\n' : '') })
  const { w } = await building(on, $, { shell: git.shell })
  await start($, 44, 'Ledger tax')
  expect(w.toasts).toEqual(['Rebase conflict in .worktrees/44-ledger-tax · agent paused'])
  expect(w.sent.map(m => m.text)).toEqual([
    expect.stringContaining('#44 stopped on a merge conflict'),
  ])
  const stopped = await step($, 'agent-tu44', 0)
  expect(stopped.result.answer).toBe('Stopped by Craftory: #44 was paused. The worktree is kept.')
  const band = await mountBand($, 'terminal', 200)
  await band.press({ key: 'notice-resolve-#44' })
  expect(w.opens).toEqual([expect.objectContaining({ id: 'craftory' })])
})
