import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { featureWorld, skillPrompt, startSession, turnComplete } from './harness'

const DRAFT = {
  d1: {
    title: 'CSV export',
    entry: 'align',
    startedAt: '2026-10-24T09:00:00Z',
    marks: { align: { ranAt: '2026-10-24T10:00:00Z' } },
  },
}

const configWith = (deny: Record<string, boolean>) => JSON.stringify({ deny })

/** Tickets is gated: Spec has no spec attached yet. */
const gatedWorld = (on: Parameters<typeof featureWorld>[0], deny: Record<string, boolean>) =>
  featureWorld(on, {
    files: {
      '.craftory/features/csv.json': '',
      '.craftory/config.json': configWith(deny),
    },
    store: { drafts: DRAFT },
  })

const skill = ($: Engine, name: string) =>
  $.tool.call({ tool: 'Skill', tool_use_id: 'sk1', skill: name } as never)

const SKIP_GATE =
  'Craftory denied mattpocock-skills:to-tickets: Tickets is gated until Spec is done (no spec is attached to this feature yet). ' +
  'This is the deny.skipGate rule; turn it off in Settings › Automation, or set "deny": { "skipGate": false } in .craftory/config.json.'

test('skipGate denies a gated phase skill, naming the rule and its switch', async ($, on) => {
  const w = gatedWorld(on, { skipGate: true })
  await startSession($)
  expect(await skill($, 'mattpocock-skills:to-tickets')).toEqual({ deny: SKIP_GATE })
  expect(w.calls.some(c => c.tool === 'Skill')).toBe(false)
})

test('with skipGate off, the gated phase skill runs', async ($, on) => {
  gatedWorld(on, {})
  await startSession($)
  expect(await skill($, 'mattpocock-skills:to-tickets')).toEqual({ result: 'ran' })
})

test('skipGate lets the phase skill through once its predecessor is done', async ($, on) => {
  const w = gatedWorld(on, { skipGate: true })
  await startSession($)
  expect((await skill($, 'mattpocock-skills:to-tickets')).deny).toContain('deny.skipGate')
  w.files.set('.scratch/export/spec.md', '# Spec\n\nStatus: ready-for-agent\n')
  w.mtimes.set('.scratch/export/spec.md', 4_000_000)
  await skillPrompt($, 'to-spec')
  await turnComplete($)
  expect(await skill($, 'mattpocock-skills:to-tickets')).toEqual({ result: 'ran' })
})

test('skipGate leaves skills that are not a gated phase alone', async ($, on) => {
  gatedWorld(on, { skipGate: true })
  await startSession($)
  expect(await skill($, 'mattpocock-skills:to-spec')).toEqual({ result: 'ran' })
  expect(await skill($, 'mattpocock-skills:tdd')).toEqual({ result: 'ran' })
  expect(await skill($, 'pdf')).toEqual({ result: 'ran' })
})

const AGENT_TREE = '/repo/.claude/worktrees/csv-01'

/** The main checkout on `branch`, with one ticket worktree beside it. */
const checkoutOn = (branch: string) => (argv: readonly string[]) => {
  if (argv[0] !== 'git') return undefined
  if (argv[1] === 'worktree' && argv[2] === 'list')
    return {
      exitCode: 0,
      stdout:
        `worktree /repo\nHEAD abc\nbranch refs/heads/${branch}\n\n` +
        `worktree ${AGENT_TREE}\nHEAD def\nbranch refs/heads/craftory/csv-01-export-button\n`,
    }
  return { exitCode: 0, stdout: '' }
}

const editWorld = (
  on: Parameters<typeof featureWorld>[0],
  branch: string,
  deny: Record<string, boolean>,
) =>
  featureWorld(on, {
    shell: checkoutOn(branch),
    files: { '.craftory/config.json': configWith(deny) },
  })

const edit = ($: Engine, tool: 'Edit' | 'Write', path: string) =>
  $.tool.call({ tool, tool_use_id: 'ed1', file_path: path } as never)

const ON_INTEGRATION = (tool: string) =>
  `Craftory denied this ${tool}: the main checkout is on feat/csv, an integration branch, so changes belong in a ticket worktree. ` +
  'This is the deny.editOnIntegrationBranch rule; turn it off in Settings › Automation, or set "deny": { "editOnIntegrationBranch": false } in .craftory/config.json.'

test('editOnIntegrationBranch denies Edit and Write in the main checkout on feat/*', async ($, on) => {
  const w = editWorld(on, 'feat/csv', { editOnIntegrationBranch: true })
  await startSession($)
  expect(await edit($, 'Edit', '/repo/src/app.ts')).toEqual({ deny: ON_INTEGRATION('Edit') })
  expect(await edit($, 'Write', '/repo/README.md')).toEqual({ deny: ON_INTEGRATION('Write') })
  expect(w.calls.some(c => c.tool === 'Edit' || c.tool === 'Write')).toBe(false)
})

test('editOnIntegrationBranch leaves a ticket worktree and files outside the repo alone', async ($, on) => {
  editWorld(on, 'feat/csv', { editOnIntegrationBranch: true })
  await startSession($)
  expect(await edit($, 'Edit', `${AGENT_TREE}/src/app.ts`)).toEqual({ result: 'ran' })
  expect(await edit($, 'Write', '/tmp/notes.md')).toEqual({ result: 'ran' })
  expect(await edit($, 'Write', '/repository/x.ts')).toEqual({ result: 'ran' })
})

test('editOnIntegrationBranch leaves the main checkout alone on any other branch', async ($, on) => {
  editWorld(on, 'main', { editOnIntegrationBranch: true })
  await startSession($)
  expect(await edit($, 'Edit', '/repo/src/app.ts')).toEqual({ result: 'ran' })
})

test('with editOnIntegrationBranch off, Edit and Write on feat/* run', async ($, on) => {
  editWorld(on, 'feat/csv', {})
  await startSession($)
  expect(await edit($, 'Edit', '/repo/src/app.ts')).toEqual({ result: 'ran' })
  expect(await edit($, 'Write', '/repo/README.md')).toEqual({ result: 'ran' })
})
