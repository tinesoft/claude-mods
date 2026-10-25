import { expect, test } from 'claude-code/testing'
import {
  agentCall,
  building,
  call,
  fakeGit,
  OVER,
  READY,
  SMALL,
  spawn,
  start,
  step,
  TICKETS,
} from './build-harness'
import {
  featureJson,
  featureWorld,
  skillPrompt,
  startSession,
  submit,
  ticketFile,
  turnComplete,
} from './harness'

test('the Agent call is renamed after its ticket and loses its isolation request', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  const reached = w.calls.find(c => c.tool === 'Agent')!
  expect(reached).toMatchObject({ tool_use_id: 'tu43', name: 'craftory-43-export-button' })
  expect(reached).not.toHaveProperty('isolation')
})

test('agent.spawn is seated in the worktree: git adds it from the integration branch, setup runs inside', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  expect(w.ran).toContainEqual([
    'git',
    'worktree',
    'add',
    '-b',
    'craftory/43-export-button',
    '--',
    '.worktrees/43-export-button',
    'feat/csv',
  ])
  expect(w.spawns[0]).toMatchObject({ cwd: '/repo/.worktrees/43-export-button' })
  const setup = w.ranIn.find(r => r.argv[0] === 'pnpm')
  expect(setup).toEqual({
    argv: ['pnpm', 'install', '--frozen-lockfile'],
    cwd: '/repo/.worktrees/43-export-button',
  })
})

test('two spawns in one step are each seated in their own ticket worktree, whatever order they arrive', async ($, on) => {
  const { w } = await building(on, $)
  await Promise.all([start($, 43, 'Export button'), start($, 44, 'Ledger tax')])
  expect(w.spawns.map(s => [s.tool_use_id, s.cwd]).sort()).toEqual([
    ['tu43', '/repo/.worktrees/43-export-button'],
    ['tu44', '/repo/.worktrees/44-ledger-tax'],
  ])
})

test('the fourth spawn at maxParallel 3 is denied, and the reason names the tickets to wait for', async ($, on) => {
  const { w } = await building(on, $)
  for (const [n, title] of TICKETS.slice(0, 3)) {
    await start($, n, title)
  }
  const fourth = await call($, agentCall(46, 'Email the CSV'))
  expect(fourth.deny).toContain('at most 3 implementers at once')
  expect(fourth.deny).toContain('#43, #44, #45 are running')
  expect(fourth.deny).toContain('do not call Agent for #46 again before then')
  expect(w.calls.filter(c => c.tool === 'Agent')).toHaveLength(3)
})

test('a slot frees when an agent finishes, and the queued ticket then starts', async ($, on) => {
  await building(on, $)
  for (const [n, title] of TICKETS.slice(0, 3)) {
    await start($, n, title)
  }
  expect((await call($, agentCall(46, 'Email the CSV'))).deny).toBeDefined()
  await turnComplete($, { agentId: 'agent-tu44' })
  expect((await call($, agentCall(46, 'Email the CSV'))).deny).toBeUndefined()
})

test('a spawn the engine refuses takes its fresh worktree away again', async ($, on) => {
  const { w } = await building(on, $, { spawn: () => ({ deny: 'not allowed' }) })
  const result = await start($, 43, 'Export button')
  expect(result).toEqual({ deny: 'not allowed' })
  expect(w.ran).toContainEqual([
    'git',
    'worktree',
    'remove',
    '--force',
    '--',
    '.worktrees/43-export-button',
  ])
})

test('an integration branch that does not exist yet is made from the checkout before the worktree is added', async ($, on) => {
  const git = fakeGit({ missing: ['feat/csv'] })
  const { w } = await building(on, $, { shell: git.shell })
  const result = await start($, 43, 'Export button')
  expect(result).toEqual({ model: 'sonnet', agentId: 'agent-tu43' })
  const asked = w.ran.map(argv => argv.join(' '))
  const made = asked.indexOf('git branch -- feat/csv HEAD')
  const added = asked.findIndex(a => a.startsWith('git worktree add -b craftory/43'))
  expect(made).toBeGreaterThanOrEqual(0)
  expect(added).toBeGreaterThan(made)
  expect(git.exists.has('feat/csv')).toBe(true)
})

test('an integration branch that already exists is left alone', async ($, on) => {
  const git = fakeGit()
  const { w } = await building(on, $, { shell: git.shell })
  await start($, 43, 'Export button')
  expect(w.ran.some(argv => argv[1] === 'branch' && argv[2] === '--')).toBe(false)
})

test('when the integration branch cannot be made the spawn is refused with what git said', async ($, on) => {
  const git = fakeGit({ missing: ['feat/csv'] })
  const { w } = await building(on, $, {
    shell: argv =>
      argv[1] === 'branch' && argv[2] === '--'
        ? { exitCode: 128, stderr: 'fatal: not a valid object name: HEAD' }
        : git.shell(argv, undefined),
  })
  const result = await start($, 43, 'Export button')
  expect(result.deny).toContain('could not make the integration branch feat/csv')
  expect(w.spawns).toHaveLength(0)
})

test('a typed implement-spec tells the model which branch to integrate on and where worktrees live', async ($, on) => {
  const { w } = await building(on, $)
  const result = await submit($, '/mattpocock-skills:implement-spec #42')
  expect(result.context).toEqual([
    'Craftory: use `feat/csv` as the integration branch (create it from `main` if it does not exist); implementer worktrees live under `.worktrees/`.',
  ])
  expect(w.submitted.at(-1)!.context).toHaveLength(1)
})

test('prompts that do not start Build carry no Craftory context', async ($, on) => {
  await building(on, $)
  expect((await submit($, '/mattpocock-skills:to-tickets #42')).context).toBeUndefined()
  expect((await submit($, 'hello')).context).toBeUndefined()
})

test('when the worktree cannot be made the spawn is refused with what git said, and the card says so', async ($, on) => {
  const { w } = await building(on, $, {
    shell: argv =>
      argv[1] === 'worktree' && argv[2] === 'add'
        ? { exitCode: 128, stderr: 'fatal: not a git repository' }
        : fakeGit().shell(argv, undefined),
  })
  const result = await start($, 43, 'Export button')
  expect(result.deny).toContain(
    'Craftory could not make .worktrees/43-export-button: fatal: not a git repository',
  )
  expect(w.spawns).toHaveLength(0)
})

test('at 100% the agent gets one stop message and its next step is answered without a request', async ($, on) => {
  const { w } = await building(on, $, {
    usage: e => (e.index === 0 ? OVER : SMALL),
  })
  await start($, 44, 'Ledger tax')
  const first = await step($, 'agent-tu44', 0)
  expect(first.result.usage).not.toBeNull()
  expect(w.sent).toHaveLength(1)
  expect(w.sent[0]!.text).toContain('#44 reached its 80k token budget. Stop now.')
  const second = await step($, 'agent-tu44', 1)
  expect(w.steps).toEqual([{ agentId: 'agent-tu44', index: 0 }])
  expect(second.result.answer).toBe(
    'Stopped by Craftory: #44 is over its 80k token budget. The worktree is kept.',
  )
  expect(second.chunks).toEqual([{ kind: 'text', index: 0, text: second.result.answer }])
  expect(w.sent).toHaveLength(1)
})

test('cache reads do not count against the budget, and 80% crosses nothing to stop', async ($, on) => {
  const { w } = await building(on, $, { usage: () => SMALL })
  await start($, 44, 'Ledger tax')
  for (let i = 0; i < 30; i++) await step($, 'agent-tu44', i)
  expect(w.sent).toEqual([])
  expect(w.steps).toHaveLength(30)
})

test('the record on disk shows over-budget with the worktree kept, and the Bash guard defends it', async ($, on) => {
  const { w } = await building(on, $, { usage: () => OVER })
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu44', 0)
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.agents['#44']).toMatchObject({
    outcome: 'over-budget',
    tokens: 80_000,
    budget: 80_000,
    worktree: '.worktrees/44-ledger-tax',
    branch: 'craftory/44-ledger-tax',
  })
  const denied = await call($, {
    tool: 'Bash',
    tool_use_id: 'b1',
    command: 'git worktree remove .worktrees/44-ledger-tax',
  })
  expect(denied.deny).toContain('Craftory keeps .worktrees/44-ledger-tax')
  const other = await call($, {
    tool: 'Bash',
    tool_use_id: 'b2',
    command: 'git worktree remove .worktrees/99-other',
  })
  expect(other.deny).toBeUndefined()
})

test('a finished agent is written as done, and its worktree is not defended', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  await turnComplete($, { agentId: 'agent-tu43' })
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.agents['#43']).toMatchObject({ outcome: 'done' })
  const removal = await call($, {
    tool: 'Bash',
    tool_use_id: 'b1',
    command: 'git worktree remove .worktrees/43-export-button',
  })
  expect(removal.deny).toBeUndefined()
})

test('a running agent that is behind the integration branch is told once to merge the new tip', async ($, on) => {
  const git = fakeGit({ behind: () => 2 })
  const w = featureWorld(on, { shell: git.shell, files: READY })
  await startSession($)
  await skillPrompt($, 'implement-spec')
  await start($, 43, 'Export button')
  await turnComplete($, { agentId: 'agent-other' })
  const told = w.sent.filter(m => m.text.includes('moved and your branch is 2 commits behind'))
  expect(told).toHaveLength(1)
  expect(told[0]!.text).toContain('merge feat/csv into your branch')
})

test('Agent calls that are not implementers pass through untouched', async ($, on) => {
  const { w } = await building(on, $)
  const explorer = {
    tool: 'Agent',
    tool_use_id: 'tx',
    description: 'Explore the repo',
    prompt: 'Map it.',
  }
  expect(await call($, explorer)).toEqual({ result: 'ran' })
  const noWorktree = agentCall(43, 'Export button', { isolation: undefined })
  await call($, noWorktree)
  const reached = w.calls.filter(c => c.tool === 'Agent')
  expect(reached.map(c => c.name)).toEqual([undefined, undefined])
  expect(await spawn($, 99)).toEqual({ model: 'sonnet', agentId: 'agent-tu99' })
})

test('with no Build running an implementer-shaped call passes through untouched', async ($, on) => {
  const git = fakeGit()
  const w = featureWorld(on, { shell: git.shell, files: READY })
  await startSession($)
  await call($, agentCall(43, 'Export button'))
  expect(w.calls.find(c => c.tool === 'Agent')).toMatchObject({ isolation: 'worktree' })
  expect(w.ran.some(argv => argv[1] === 'worktree' && argv[2] === 'add')).toBe(false)
})

test('a ready-for-human or blocked ticket is refused with a reason that says what to do instead', async ($, on) => {
  await building(on, $, {
    files: {
      ...READY,
      'docs/issues/47-order.md': ticketFile('Pick the column order').replace(
        'ready-for-agent',
        'ready-for-human',
      ),
      'docs/issues/48-after.md': ticketFile('After the filter', [45]),
    },
  })
  const human = await call($, agentCall(47, 'Pick the column order'))
  expect(human.deny).toContain('ready-for-human')
  const blocked = await call($, agentCall(48, 'After the filter'))
  expect(blocked.deny).toContain('blocked by #45')
})

test('a stale record from another session does not hold a slot', async ($, on) => {
  const stale = featureJson({
    agents: {
      '#43': {
        ticket: '#43',
        name: 'craftory-43',
        branch: 'craftory/43-export-button',
        worktree: '.worktrees/43-export-button',
        tokens: 100,
        budget: 80_000,
        outcome: 'running',
        startedAt: '2026-10-24T09:00:00.000Z',
      },
    },
  })
  await building(on, $, { files: { '.craftory/features/42.json': stale } })
  for (const [n, title] of TICKETS.slice(0, 3)) {
    expect((await start($, n, title)).deny).toBeUndefined()
  }
})
