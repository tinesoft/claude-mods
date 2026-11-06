import { expect, test } from 'claude-code/testing'
import {
  DEFAULT_DOCS,
  DEFAULT_LABELS,
  draftSetup,
  ensureGitignore,
  firstRunText,
  parseDomainDoc,
  parseTrackerDoc,
  planSetup,
  readSetup,
  remoteHostOf,
  renderAgentSkillsBlock,
  renderTriageLabels,
  steeringOf,
  upsertBlock,
  type SetupFiles,
} from '../src/agents-md'
import { AGENT_DOCS, type FileWrite } from '../src/files'
import type { AgentSetup } from '../types'
import { UPSTREAM_FIXTURES as up } from './upstream-fixtures'

const OPTIONS = { worktreeFolder: '.claude/worktrees/' }
const EMPTY: SetupFiles = {
  tracker: null,
  triage: null,
  domain: null,
  claudeMd: null,
  agentsMd: null,
  gitignore: null,
}
const GITHUB: AgentSetup = {
  tracker: { kind: 'github', prsAsRequests: false },
  triage: { ...DEFAULT_LABELS },
  docs: DEFAULT_DOCS,
  steering: 'CLAUDE.md',
}

const apply = (files: SetupFiles, writes: FileWrite[]): SetupFiles => {
  const next = { ...files }
  const slot: Record<string, keyof SetupFiles> = {
    [AGENT_DOCS.tracker]: 'tracker',
    [AGENT_DOCS.triage]: 'triage',
    [AGENT_DOCS.domain]: 'domain',
    'CLAUDE.md': 'claudeMd',
    'AGENTS.md': 'agentsMd',
    '.gitignore': 'gitignore',
  }
  for (const w of writes) next[slot[w.path]!] = w.after
  return next
}

const textOf = (writes: FileWrite[], path: string) => writes.find(w => w.path === path)?.after

test('a GitHub setup writes the upstream templates byte for byte', () => {
  const writes = planSetup(GITHUB, EMPTY, OPTIONS)
  expect(writes.map(w => w.path)).toEqual([
    AGENT_DOCS.tracker,
    AGENT_DOCS.triage,
    AGENT_DOCS.domain,
    'CLAUDE.md',
    '.gitignore',
  ])
  expect(textOf(writes, AGENT_DOCS.tracker)).toBe(up['issue-tracker-github.md'])
  expect(textOf(writes, AGENT_DOCS.triage)).toBe(up['triage-labels.md'])
  expect(textOf(writes, AGENT_DOCS.domain)).toBe(up['domain.md'])
  expect(textOf(writes, '.gitignore')).toBe('.claude/worktrees/\n')
})

test('GitLab writes its template, and the PRs flag changes only that line', () => {
  const gitlab = planSetup(
    { ...GITHUB, tracker: { kind: 'gitlab', prsAsRequests: false } },
    EMPTY,
    OPTIONS,
  )
  expect(textOf(gitlab, AGENT_DOCS.tracker)).toBe(up['issue-tracker-gitlab.md'])
  const yes = planSetup(
    { ...GITHUB, tracker: { kind: 'github', prsAsRequests: true } },
    EMPTY,
    OPTIONS,
  )
  expect(textOf(yes, AGENT_DOCS.tracker)).toBe(
    up['issue-tracker-github.md']!.replace(
      'PRs as a request surface: no.',
      'PRs as a request surface: yes.',
    ),
  )
})

test("Local Markdown writes Matt's doc byte for byte", () => {
  const writes = planSetup({ ...GITHUB, tracker: { kind: 'local' } }, EMPTY, OPTIONS)
  expect(textOf(writes, AGENT_DOCS.tracker)).toBe(up['issue-tracker-local.md'])
  expect(parseTrackerDoc(textOf(writes, AGENT_DOCS.tracker)!)).toEqual({ kind: 'local' })
})

test("an Other tracker keeps the user's description under the Other heading", () => {
  const writes = planSetup(
    { ...GITHUB, tracker: { kind: 'other', description: 'We use Linear. Ids look like BILL-42.' } },
    EMPTY,
    OPTIONS,
  )
  const doc = textOf(writes, AGENT_DOCS.tracker)!
  expect(doc).toBe('# Issue tracker: Other\n\nWe use Linear. Ids look like BILL-42.\n')
  expect(parseTrackerDoc(doc).kind).toBe('other')
})

test('reading what was written gives the setup back, and planning it again writes nothing', () => {
  for (const tracker of [
    { kind: 'github', prsAsRequests: true },
    { kind: 'gitlab', prsAsRequests: false },
    { kind: 'local' },
    { kind: 'other', description: '# Issue tracker: Jira\n\nUse the Jira CLI.\n' },
  ] as const) {
    const setup: AgentSetup = { ...GITHUB, tracker }
    const files = apply(EMPTY, planSetup(setup, EMPTY, OPTIONS))
    const read = readSetup(files)
    expect(read.state === 'ok' && read.value).toEqual(setup)
    expect(planSetup(setup, files, OPTIONS)).toEqual([])
  }
})

test('custom triage labels change only the right-hand cells and read back', () => {
  const labels = { ...DEFAULT_LABELS, 'ready-for-agent': 'afk', wontfix: 'closed:wontfix' }
  const text = renderTriageLabels(labels, up['triage-labels.md']!)
  const [a, b] = [up['triage-labels.md']!.split('\n'), text.split('\n')]
  expect(b.filter((line, i) => line !== a[i])).toHaveLength(2)
  expect(text).toContain('| `ready-for-agent`          | `afk`                | Fully specified')
  const files = apply(EMPTY, planSetup({ ...GITHUB, triage: labels }, EMPTY, OPTIONS))
  const read = readSetup(files)
  expect(read.state === 'ok' && read.value.triage).toEqual(labels)
})

test('without the triage skill there is no triage doc and no triage sub-block', () => {
  const setup = { ...GITHUB, triage: null }
  const writes = planSetup(setup, EMPTY, OPTIONS)
  expect(writes.map(w => w.path)).not.toContain(AGENT_DOCS.triage)
  expect(textOf(writes, 'CLAUDE.md')).not.toContain('Triage labels')
  expect(textOf(writes, 'CLAUDE.md')).toContain('### Domain docs')
})

test('the Agent skills block names every doc it points to', () => {
  const block = renderAgentSkillsBlock(GITHUB)
  expect(block.startsWith('## Agent skills\n\n### Issue tracker\n\n')).toBe(true)
  for (const doc of Object.values(AGENT_DOCS)) expect(block).toContain(`See \`${doc}\`.`)
})

test('CLAUDE.md beats AGENTS.md and the other is never created', () => {
  const both = { ...EMPTY, claudeMd: '# Mine\n', agentsMd: '# Theirs\n' }
  const writes = planSetup({ ...GITHUB, steering: 'AGENTS.md' }, both, OPTIONS)
  expect(writes.map(w => w.path)).toContain('CLAUDE.md')
  expect(writes.map(w => w.path)).not.toContain('AGENTS.md')
  expect(steeringOf(both)).toBe('CLAUDE.md')
  expect(steeringOf({ ...EMPTY, agentsMd: 'x' })).toBe('AGENTS.md')
  const none = planSetup({ ...GITHUB, steering: 'AGENTS.md' }, EMPTY, OPTIONS)
  expect(none.map(w => w.path)).toContain('AGENTS.md')
  expect(none.map(w => w.path)).not.toContain('CLAUDE.md')
})

test('upsert appends after exactly one blank line and keeps every byte of the rest', () => {
  const block = renderAgentSkillsBlock(GITHUB)
  const cases = ['# T\n\nSome rules.\n', '# T\n\nSome rules.', '# T\n\nSome rules.\n\n']
  for (const original of cases) {
    const next = upsertBlock(original, block)
    expect(next.startsWith(original.replace(/\n+$/, ''))).toBe(true)
    expect(next.endsWith(`\n\n${block}`)).toBe(true)
    expect(next.endsWith(`\n\n\n${block}`)).toBe(false)
  }
  expect(upsertBlock(null, block)).toBe(block)
})

test('upsert replaces only the existing block and is idempotent', () => {
  const block = renderAgentSkillsBlock(GITHUB)
  const before = '# T\n\nIntro.\n\n'
  const after = '## Testing\n\nRun the tests.\n'
  const stale = `${before}## Agent skills\n\n### Issue tracker\n\nold text.\n\n${after}`
  const next = upsertBlock(stale, block)
  expect(next).toBe(`${before}${block}\n${after}`)
  expect(upsertBlock(next, block)).toBe(next)
  const crlf = stale.replace(/\n/g, '\r\n')
  const next2 = upsertBlock(crlf, block)
  expect(next2.replace(/\r\n/g, '\n')).toBe(next)
  expect(next2).not.toMatch(/[^\r]\n/)
})

test('an existing block that already points at the docs is left alone', () => {
  const claude =
    '# T\n\n## Agent skills\n\n### Issue tracker\n\nMy words. See `docs/agents/issue-tracker.md`.\n\n### Triage labels\n\nMine. See `docs/agents/triage-labels.md`.\n\n### Domain docs\n\nMine. See `docs/agents/domain.md`.\n'
  const files = { ...EMPTY, claudeMd: claude }
  expect(planSetup(GITHUB, files, OPTIONS).map(w => w.path)).not.toContain('CLAUDE.md')
})

test('hand-edited docs that already say the same thing are not rewritten', () => {
  const files: SetupFiles = {
    ...EMPTY,
    tracker: `${up['issue-tracker-github.md']}\nOur own extra note.\n`,
    triage: up['triage-labels.md']!.replace('Edit the right-hand', 'Please edit the right-hand'),
    domain: `${up['domain.md']}\nExtra.\n`,
    claudeMd: renderAgentSkillsBlock(GITHUB),
    gitignore: 'node_modules\n.claude/worktrees/\n',
  }
  expect(planSetup(GITHUB, files, OPTIONS)).toEqual([])
})

test('running setup twice plans nothing the second time', () => {
  const once = apply(EMPTY, planSetup(GITHUB, EMPTY, OPTIONS))
  expect(planSetup(GITHUB, once, OPTIONS)).toEqual([])
})

test('every planned write carries the text it was planned against', () => {
  const files = { ...EMPTY, gitignore: 'dist\n', claudeMd: '# T\n' }
  const writes = planSetup(GITHUB, files, OPTIONS)
  expect(writes.find(w => w.path === '.gitignore')).toEqual({
    path: '.gitignore',
    before: 'dist\n',
    after: 'dist\n.claude/worktrees/\n',
  })
  expect(writes.find(w => w.path === AGENT_DOCS.tracker)?.before).toBeNull()
  expect(writes.find(w => w.path === 'CLAUDE.md')?.before).toBe('# T\n')
})

test('.gitignore gets the worktrees line once, however it is already spelled', () => {
  expect(ensureGitignore(null, '.claude/worktrees/')).toBe('.claude/worktrees/\n')
  expect(ensureGitignore('dist', '.claude/worktrees/')).toBe('dist\n.claude/worktrees/\n')
  for (const has of [
    '.claude/worktrees/\n',
    '.claude/worktrees\n',
    '/.claude/worktrees/\n',
    'a\r\n.claude/worktrees/\r\n',
  ]) {
    expect(ensureGitignore(has, '.claude/worktrees/')).toBe(has)
  }
  expect(ensureGitignore('a\r\nb\r\n', '.claude/worktrees/')).toBe(
    'a\r\nb\r\n.claude/worktrees/\r\n',
  )
})

test('first run reads the repo signals into a draft and a sentence', () => {
  const signals = {
    remoteHost: remoteHostOf('git@github.com:acme/app.git'),
    hasScratch: false,
    hasContextMd: true,
    steering: null,
    hasTriageSkill: true,
  } as const
  expect(draftSetup(signals)).toEqual({
    tracker: { kind: 'github', prsAsRequests: false },
    triage: DEFAULT_LABELS,
    docs: DEFAULT_DOCS,
    steering: 'CLAUDE.md',
  })
  expect(firstRunText(signals)).toBe('No docs/agents/ yet. Found a GitHub remote and CONTEXT.md.')
  const bare = { ...signals, remoteHost: null, hasContextMd: false, hasTriageSkill: false }
  expect(draftSetup(bare).tracker).toEqual({ kind: 'local' })
  expect(draftSetup(bare).triage).toBeNull()
  expect(firstRunText(bare)).toBe('No docs/agents/ yet.')
  expect(remoteHostOf('https://gitlab.example.com/a/b')).toBe('gitlab')
  expect(remoteHostOf('ssh://git.sr.ht/~a/b')).toBe('other')
  expect(remoteHostOf('  ')).toBeNull()
})

test('the domain doc layout reads back from the upstream file', () => {
  expect(parseDomainDoc(up['domain.md']!)).toEqual(DEFAULT_DOCS)
})

test('a Local setup is kept as written and its block names .scratch', () => {
  const doc = up['issue-tracker-local.md']!
  const files = { ...EMPTY, tracker: doc, claudeMd: '# Rules\n' }
  const setup = readSetup(files)
  if (setup.state !== 'ok') throw new Error('expected a setup')
  expect(setup.value.tracker).toEqual({ kind: 'local' })
  const writes = planSetup(setup.value, files, OPTIONS)
  expect(textOf(writes, AGENT_DOCS.tracker)).toBeUndefined()
  const claude = textOf(writes, 'CLAUDE.md')!
  expect(claude).toContain('under `.scratch/<feature-slug>/`')
  expect(claude).not.toContain('docs/issues/')
})
