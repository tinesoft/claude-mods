import { expect, test } from 'claude-code/testing'
import {
  parseTrackerDoc,
  planSetup,
  readSetup,
  renderTrackerDoc,
  retargetTracker,
  type SetupFiles,
} from '../src/agents-md'
import { diffSummary } from '../src/files'

const EMPTY: SetupFiles = {
  tracker: null,
  triage: null,
  domain: null,
  claudeMd: null,
  agentsMd: null,
  gitignore: null,
}
const OPTIONS = { worktreeFolder: '.worktrees/', localFolder: 'docs/issues/' }
const SETUP = {
  tracker: { kind: 'local' as const },
  triage: null,
  docs: { glossary: 'GLOSSARY.md', adr: 'docs/adr/' },
  steering: 'AGENTS.md' as const,
}

test('a chosen steering file gets the block even when the other one exists', () => {
  const files = { ...EMPTY, claudeMd: '# C\n', agentsMd: '# A\n' }
  const paths = planSetup(SETUP, files, { ...OPTIONS, chooseSteering: true }).map(w => w.path)
  expect(paths).toContain('AGENTS.md')
  expect(paths).not.toContain('CLAUDE.md')
})

test('the steering Settings shows is the file that holds the block', () => {
  const block = '# A\n\n## Agent skills\n\n### Issue tracker\n\nx\n'
  const read = readSetup({
    ...EMPTY,
    tracker: '# Issue tracker: Local Markdown\n',
    claudeMd: '# C\n',
    agentsMd: block,
  })
  expect(read.state === 'ok' && read.value.steering).toBe('AGENTS.md')
})

test('a changed value rewrites an existing block only when asked', () => {
  const files = {
    ...EMPTY,
    tracker: renderTrackerDoc({ kind: 'github', prsAsRequests: false }, 'docs/issues/'),
    domain: '# Domain Docs\n',
    agentsMd:
      '# A\n\n## Agent skills\n\n### Issue tracker\n\nMine. See `docs/agents/issue-tracker.md`.\n\n### Domain docs\n\nMine. See `docs/agents/domain.md`.\n',
  }
  const github = { ...SETUP, tracker: { kind: 'github' as const, prsAsRequests: false } }
  expect(planSetup(github, files, OPTIONS).map(w => w.path)).not.toContain('AGENTS.md')
  expect(planSetup(github, files, { ...OPTIONS, refreshBlock: true }).map(w => w.path)).toContain(
    'AGENTS.md',
  )
})

test('the PRs flag round-trips for GitHub and GitLab, and an Other description is rewritten', () => {
  for (const kind of ['github', 'gitlab'] as const) {
    const doc = renderTrackerDoc({ kind, prsAsRequests: true }, 'docs/issues/')
    expect(parseTrackerDoc(doc)).toEqual({ kind, prsAsRequests: true })
  }
  const files = { ...EMPTY, tracker: '# Issue tracker: Other\n\nOld.\n' }
  const writes = planSetup(
    { ...SETUP, tracker: { kind: 'other', description: 'New words.' } },
    files,
    OPTIONS,
  )
  expect(writes.find(w => w.path === 'docs/agents/issue-tracker.md')?.after).toBe(
    '# Issue tracker: Other\n\nNew words.\n',
  )
})

test('moving the issues folder updates Craftory’s own tracker doc and leaves other text alone', () => {
  const doc = renderTrackerDoc({ kind: 'local' }, 'docs/issues/')
  expect(retargetTracker(doc, 'docs/issues/', 'work/')).toContain('`work/<n>-<slug>.md`')
  expect(
    retargetTracker(
      '# Issue tracker: Local Markdown\n\nUses .scratch/.\n',
      'docs/issues/',
      'work/',
    ),
  ).toBe('# Issue tracker: Local Markdown\n\nUses .scratch/.\n')
})

test('the diff summary counts added and removed lines and quotes the first added one', () => {
  expect(diffSummary('a\nb\n', 'a\nc\nd\n')).toBe('+2 −1 lines, adds "c"')
  expect(diffSummary(null, 'a\nb\n')).toBe('new file, 2 lines')
})
