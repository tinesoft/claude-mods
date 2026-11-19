import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { featureWorld, MATT, startSession } from './harness'

const IMPLEMENT = `${MATT}:implement-spec`

const draft = {
  d1: {
    draftId: 'd1',
    title: 'Another repo’s idea',
    entry: 'align',
    enteredFrom: null,
    marks: {},
    startedAt: '2026-10-01T10:00:00.000Z',
  },
}

/** What a typed or pressed `/implement-spec csv` carries: the integration line, with a feature. */
const carried = async ($: Engine) =>
  (
    (await $.prompt.submit({
      text: `/${IMPLEMENT} csv`,
      command: { name: IMPLEMENT, args: 'csv' },
    } as never)) as { context?: string[] }
  ).context?.some(line => line.includes('integration branch')) === true

const onBranch = (branch: string) => (argv: readonly string[]) =>
  argv[0] === 'git' && argv[1] === 'branch' && argv[2] === '--show-current'
    ? { exitCode: 0, stdout: `${branch}\n` }
    : undefined

test('the Feature on the checked-out branch is active, whatever the store remembers', async ($, on) => {
  featureWorld(on, {
    store: { drafts: draft, lastActive: 'draft:d1' },
    shell: onBranch('feat/csv'),
  })
  await startSession($)
  expect(await carried($)).toBe(true)
})

test('a Feature remembered in another repo is not taken for this one', async ($, on) => {
  featureWorld(on, {
    store: { drafts: draft, lastActive: { root: '/elsewhere', key: 'draft:d1' } },
    shell: onBranch('main'),
  })
  await startSession($)
  expect(await carried($)).toBe(true)
})

test('a Feature remembered in this repo is kept when no branch matches', async ($, on) => {
  featureWorld(on, {
    store: { drafts: draft, lastActive: { root: '/repo', key: 'draft:d1' } },
    shell: onBranch('main'),
  })
  await startSession($)
  expect(await carried($)).toBe(false)
})
