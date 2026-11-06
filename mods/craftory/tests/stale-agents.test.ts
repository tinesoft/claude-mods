import { expect, test } from 'claude-code/testing'
import { building, call, fakeGit, READY, start } from './build-harness'
import { featureJson, featureWorld, mountBand, startSession, texts, turnComplete } from './harness'

const agent = (outcome: string, extra: Record<string, unknown> = {}) => ({
  ticket: 'csv/01',
  name: 'craftory-csv-01-export-button',
  branch: 'craftory/csv-01-export-button',
  worktree: '.claude/worktrees/csv-01-export-button',
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
      '.craftory/features/csv.json': featureJson({ agents: { 'csv/01': agent('running') } }),
    },
  })
  await startSession($)
  const record = JSON.parse(w.files.get('.craftory/features/csv.json')!)
  expect(record.agents['csv/01']).toMatchObject({ outcome: 'stopped', tokens: 31_000 })
  expect(record.agents['csv/01'].endedAt).toBe(new Date(1_000_000).toISOString())
  const denied = await call($, removal('.claude/worktrees/csv-01-export-button'))
  expect(denied.deny).toContain('was stopped, and the user decides what happens to its work')
  expect(denied.deny).not.toContain('still working')
})

test('a record that finished before the crash keeps its outcome', async ($, on) => {
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    files: {
      ...READY,
      '.craftory/features/csv.json': featureJson({
        agents: { 'csv/01': agent('done', { endedAt: '2026-10-24T11:00:00.000Z' }) },
      }),
    },
  })
  await startSession($)
  const record = JSON.parse(w.files.get('.craftory/features/csv.json')!)
  expect(record.agents['csv/01']).toMatchObject({
    outcome: 'done',
    endedAt: '2026-10-24T11:00:00.000Z',
  })
})

test('a record whose agent is still running in this process is left running by a reload', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  await startSession($)
  const record = JSON.parse(w.files.get('.craftory/features/csv.json')!)
  expect(record.agents['csv/01'].outcome).toBe('running')
})

test('two agents finishing at once both reach the record on disk and the card', async ($, on) => {
  const { w } = await building(on, $)
  await Promise.all([start($, 43, 'Export button'), start($, 44, 'Ledger tax')])
  const disk = () => JSON.parse(w.files.get('.craftory/features/csv.json')!).agents
  expect(Object.keys(disk()).sort()).toEqual(['csv/01', 'csv/02'])
  await Promise.all([
    turnComplete($, { agentId: 'agent-tu43' }),
    turnComplete($, { agentId: 'agent-tu44' }),
  ])
  expect(Object.values<{ outcome: string }>(disk()).map(a => a.outcome)).toEqual(['done', 'done'])
  const band = await mountBand($, 'terminal', 200, 60)
  await band.press({ key: 'phase-build' })
  const words = await texts(await mountBand($, 'terminal', 200, 60))
  expect(words.filter(word => word === '[Done]')).toHaveLength(2)
})
