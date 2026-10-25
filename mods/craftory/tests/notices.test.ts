import { expect, test } from 'claude-code/testing'
import { derivedNotices, eventNotice } from '../src/notices'
import type { InstallState, IssueRef, NoticeKey, PluginStatus, RepoSnapshot } from '../types'

const PRESENT: PluginStatus = {
  kind: 'present',
  version: '1.3.1',
  inRange: true,
  hasDuplicates: false,
  skills: [],
  shadowed: [],
}
const repo = (setup: 'absent' | 'ok'): RepoSnapshot => ({
  config: { state: 'absent' },
  setup:
    setup === 'absent'
      ? { state: 'absent' }
      : {
          state: 'ok',
          raw: '',
          value: {
            tracker: { kind: 'local' },
            triage: null,
            docs: { glossary: 'GLOSSARY.md', adr: 'docs/adr/' },
            steering: 'CLAUDE.md',
          },
        },
  glossary: { state: 'absent' },
  steering: { file: null, hasBlock: false },
  remoteHost: null,
  hasContextMd: false,
  hasScratch: false,
  scratchCount: 0,
  hasGitignoreEntry: false,
  at: 0,
})

const notices = (
  over: Partial<{
    plugin: PluginStatus
    install: InstallState
    repo: RepoSnapshot | null
    hasFeature: boolean
    firstRunText: string
    dismissed: NoticeKey[]
  }> = {},
) =>
  derivedNotices({
    plugin: PRESENT,
    install: { kind: 'idle' },
    repo: repo('ok'),
    hasFeature: true,
    firstRunText: 'No docs/agents/ yet.',
    dismissed: [],
    ...over,
  })

const ids = (list: ReturnType<typeof notices>) => list.map(n => n.id)

test('nothing shows while the plugin is still being checked or the repo is loading', () => {
  expect(notices({ plugin: { kind: 'checking' }, repo: null })).toEqual([])
})

test('a missing plugin replaces the rail and offers Install and Not now', () => {
  const [notice] = notices({ plugin: { kind: 'missing' } })
  expect(notice).toMatchObject({
    id: 'plugin',
    replacesRail: true,
    text: 'Craftory needs mattpocock-skills 1.3.x',
  })
  expect(notice!.actions.map(a => a.label)).toEqual(['Install', 'Not now'])
})

test('an installed version outside the range offers Update and names the version', () => {
  const [notice] = notices({ plugin: { ...PRESENT, version: '1.2.9', inRange: false } })
  expect(notice!.text).toContain('found 1.2.9')
  expect(notice!.actions.map(a => a.label)).toEqual(['Update', 'Not now'])
  expect(notices({ plugin: { ...PRESENT, version: null, inRange: null } })).toEqual([])
})

test('an install in flight, done or failed outranks the plugin notice', () => {
  const missing: PluginStatus = { kind: 'missing' }
  expect(
    notices({ plugin: missing, install: { kind: 'installing', startedAt: 0 } })[0],
  ).toMatchObject({
    id: 'installing',
    isBusy: true,
  })
  expect(notices({ plugin: missing, install: { kind: 'restart' } })[0]!.text).toContain(
    '/reload-plugins',
  )
  const failed = notices({ plugin: missing, install: { kind: 'failed', message: 'boom' } })[0]!
  expect(failed.text).toBe('Install failed: boom')
  expect(failed.actions.map(a => a.label)).toEqual(['Install again'])
})

test('a restart notice goes away once the plugin is loaded', () => {
  expect(ids(notices({ install: { kind: 'restart' } }))).toEqual([])
})

test('Not now hides the plugin notice and lets the next one through', () => {
  const list = notices({ plugin: { kind: 'missing' }, dismissed: ['plugin'], repo: repo('absent') })
  expect(ids(list)).toEqual(['first-run'])
})

test('first run offers Set up Craftory with the text it was given', () => {
  const [notice] = notices({
    repo: repo('absent'),
    firstRunText: 'No docs/agents/ yet. Found a GitHub remote.',
  })
  expect(notice).toMatchObject({
    id: 'first-run',
    text: 'No docs/agents/ yet. Found a GitHub remote.',
  })
  expect(notice!.actions.map(a => a.label)).toEqual(['Set up Craftory'])
})

test('with the repo set up but no feature, it says how to start one', () => {
  const [notice] = notices({ hasFeature: false })
  expect(notice).toMatchObject({
    id: 'no-feature',
    text: 'Start a feature: talk it through first.',
  })
  expect(notice!.actions[0]).toMatchObject({ label: '/grill-with-docs', action: { kind: 'run' } })
  expect(notices({ hasFeature: true })).toEqual([])
})

test('a budget notice says which agent, keeps the worktree, and offers Raise budget first', () => {
  const view = eventNotice({
    kind: 'budget',
    id: 'budget-#44',
    ticket: '#44' as IssueRef,
    budget: 80_000,
  })
  expect(view?.text).toBe('Agent #44 hit its 80k budget · worktree kept')
  expect(view?.role).toBe('danger')
  expect(view?.actions.map(a => [a.label, a.primary === true])).toEqual([
    ['Raise budget', true],
    ['Diagnose', false],
    ['Dismiss', false],
  ])
})

test('a rebase conflict notice names the worktree and offers Resolve', () => {
  const view = eventNotice({
    kind: 'rebase-conflict',
    id: 'conflict-#45',
    ticket: '#45' as IssueRef,
    worktree: '.worktrees/45-date-filter',
  })
  expect(view?.text).toBe('Rebase conflict in .worktrees/45-date-filter · agent stopped')
  expect(view?.actions.map(a => a.label)).toEqual(['Resolve', 'Dismiss'])
})
