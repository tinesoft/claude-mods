import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  allText,
  featureWorld,
  IN_RANGE,
  MATT,
  MATT_SKILLS,
  mattCommands,
  mountBand,
  SETUP_FILES,
  startSession,
  world,
} from './harness'

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

const stored = (root: string | undefined) => ({
  d1: { ...draft.d1, ...(root !== undefined && { root }) },
})

/** A repo with no Feature of its own, whose store holds one draft. */
const bare = async ($: Engine, on: Parameters<typeof world>[0], root: string | undefined) => {
  world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    files: SETUP_FILES,
    store: { drafts: stored(root) },
    shell: onBranch('main'),
  })
  await startSession($)
  return allText(await mountBand($, 'terminal', 200, 60))
}

test('a draft started in another repo is not this repo’s active Feature', async ($, on) => {
  expect(await bare($, on, '/elsewhere')).not.toContain('Another repo’s idea')
})

test('a draft started in this repo, or by an older version, is shown', async ($, on) => {
  expect(await bare($, on, '/repo')).toContain('Another repo’s idea')
})

test('an older version’s draft with no repo is shown', async ($, on) => {
  expect(await bare($, on, undefined)).toContain('Another repo’s idea')
})

test('saving this repo’s drafts keeps the other repos’ in the store', async ($, on) => {
  const w = world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    files: SETUP_FILES,
    store: {
      drafts: { ...stored('/elsewhere'), d2: { ...draft.d1, draftId: 'd2', root: '/repo' } },
    },
    shell: onBranch('main'),
  })
  await startSession($)
  await $.skill.prompt({
    skill: `${MATT}:grill-with-docs`,
    text: '',
    frontmatter: {},
    source: 'plugin',
  } as never)
  const kept = w.store.get('drafts') as Record<
    string,
    { root?: string; marks?: Record<string, unknown> }
  >
  expect(kept.d2!.marks).toHaveProperty('align')
  expect(Object.keys(kept).sort()).toContain('d1')
  expect(kept.d1!.root).toBe('/elsewhere')
})
