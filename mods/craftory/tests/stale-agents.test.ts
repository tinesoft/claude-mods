import { expect, test } from 'claude-code/testing'
import { building, call, fakeGit, READY, start } from './build-harness'
import { featureJson, featureWorld, startSession } from './harness'

const agent = (outcome: string, extra: Record<string, unknown> = {}) => ({
  ticket: '#43',
  name: 'craftory-43-export-button',
  branch: 'craftory/43-export-button',
  worktree: '.worktrees/43-export-button',
  tokens: 31_000,
  budget: 80_000,
  outcome,
  startedAt: '2026-10-24T10:00:00.000Z',
  ...extra,
})

const removal = (path: string) => ({
  tool: 'Bash',
  tool_use_id: 'b1',
  command: `git worktree remove ${path}`,
})

test('an agent record left running by a session that died is stopped when the next one starts', async ($, on) => {
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    files: {
      ...READY,
      '.craftory/features/42.json': featureJson({ agents: { '#43': agent('running') } }),
    },
  })
  await startSession($)
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.agents['#43']).toMatchObject({ outcome: 'stopped', tokens: 31_000 })
  expect(record.agents['#43'].endedAt).toBe(new Date(1_000_000).toISOString())
  const denied = await call($, removal('.worktrees/43-export-button'))
  expect(denied.deny).toContain('was stopped, and the user decides what happens to its work')
  expect(denied.deny).not.toContain('still working')
})

test('a record that finished before the crash keeps its outcome', async ($, on) => {
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    files: {
      ...READY,
      '.craftory/features/42.json': featureJson({
        agents: { '#43': agent('done', { endedAt: '2026-10-24T11:00:00.000Z' }) },
      }),
    },
  })
  await startSession($)
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.agents['#43']).toMatchObject({
    outcome: 'done',
    endedAt: '2026-10-24T11:00:00.000Z',
  })
})

test('a record whose agent is still running in this process is left running by a reload', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  await startSession($)
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.agents['#43'].outcome).toBe('running')
})
