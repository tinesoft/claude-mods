import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { isWritable, type WritableContext } from '../src/files'
import { UPSTREAM_FIXTURES as up } from './upstream-fixtures'
import {
  allText,
  mattCommands,
  mountBand,
  mountPane,
  startSession,
  world,
  type World,
} from './harness'

const IN_RANGE = [
  { id: 'mattpocock-skills@claude-plugins-official', version: '1.3.1', enabled: true },
]
const PATHS = [
  'docs/agents/issue-tracker.md',
  'docs/agents/triage-labels.md',
  'docs/agents/domain.md',
  'CLAUDE.md',
  '.gitignore',
  '.craftory/config.json',
]

const openSettings = async ($: Parameters<typeof startSession>[0]) => {
  await (await mountBand($)).press({ key: 'notice-setup' })
  return mountPane($)
}

const github = {
  commands: mattCommands('to-spec', 'triage'),
  plugins: IN_RANGE,
  remote: 'git@github.com:acme/app.git',
  files: { 'CLAUDE.md': '# Rules\n\nRun the tests.\n', '.gitignore': 'node_modules\n' },
}

test('the pane keeps the setup button on the Settings tab only', async ($, on) => {
  world(on, github)
  await startSession($)
  const pane = await mountPane($)
  expect(await pane.find({ key: 'pane-write-setup' })).toBeUndefined()
  await (await mountBand($)).press({ key: 'notice-setup' })
  await pane.redraw()
  expect(await pane.find({ key: 'pane-write-setup' })).toBeDefined()
})

test('setup writes exactly the planned files, as /setup-matt-pocock-skills would', async ($, on) => {
  const w = world(on, github)
  await startSession($)
  const pane = await openSettings($)
  expect(w.writes).toEqual([])
  await pane.press({ key: 'pane-write-setup' })

  expect(w.writes.map(x => x.path)).toEqual(PATHS)
  const text = (path: string) => w.files.get(path)
  expect(text('docs/agents/issue-tracker.md')).toBe(up['issue-tracker-github.md'])
  expect(text('docs/agents/triage-labels.md')).toBe(up['triage-labels.md'])
  expect(text('docs/agents/domain.md')).toBe(up['domain.md'])
  expect(text('.gitignore')).toBe('node_modules\n.worktrees/\n')
  expect(
    text('CLAUDE.md')!.startsWith(
      '# Rules\n\nRun the tests.\n\n## Agent skills\n\n### Issue tracker\n',
    ),
  ).toBe(true)
  expect(text('CLAUDE.md')).toContain('### Triage labels')
  expect(JSON.parse(text('.craftory/config.json')!)).toEqual(DEFAULT_CONFIG)
  expect(w.files.has('AGENTS.md')).toBe(false)
  await pane.redraw()
  expect(await allText(pane)).toContain('Wrote docs/agents/issue-tracker.md')
})

test('nothing is written outside the files Craftory may write', async ($, on) => {
  const w = world(on, github)
  await startSession($)
  await (await openSettings($)).press({ key: 'pane-write-setup' })
  const ctx: WritableContext = {
    steering: 'CLAUDE.md',
    docs: { glossary: 'GLOSSARY.md', adr: 'docs/adr/' },
    issuesFolder: 'docs/issues/',
  }
  expect(w.writes.length).toBeGreaterThan(0)
  for (const { path } of w.writes) expect(isWritable(path, ctx), path).toBe(true)
})

test('setup is idempotent: the second press writes nothing and says so', async ($, on) => {
  const w = world(on, github)
  await startSession($)
  const pane = await openSettings($)
  await pane.press({ key: 'pane-write-setup' })
  const first = w.writes.length
  await pane.press({ key: 'pane-write-setup' })
  expect(w.writes.length).toBe(first)
  await pane.redraw()
  expect(await allText(pane)).toContain('Everything is already set up.')
})

test('after setup the first-run notice is gone', async ($, on) => {
  world(on, github)
  await startSession($)
  await (await openSettings($)).press({ key: 'pane-write-setup' })
  expect(await allText(await mountBand($))).not.toContain('No docs/agents/')
})

test('without a remote it sets up the local tracker, and creates AGENTS.md only when no steering file exists', async ($, on) => {
  const w = world(on, { commands: mattCommands('to-spec'), plugins: IN_RANGE })
  await startSession($)
  await (await openSettings($)).press({ key: 'pane-write-setup' })
  expect(w.files.get('docs/agents/issue-tracker.md')).toContain('# Issue tracker: Local Markdown')
  expect(w.files.get('docs/agents/issue-tracker.md')).toContain('`docs/issues/<n>-<slug>.md`')
  expect(w.files.has('docs/agents/triage-labels.md')).toBe(false)
  expect(w.files.get('AGENTS.md')).toContain('## Agent skills')
  expect(w.files.has('CLAUDE.md')).toBe(false)
})

test('AGENTS.md is edited when it is the only steering file, and CLAUDE.md is not created', async ($, on) => {
  const w = world(on, { ...github, files: { 'AGENTS.md': '# Agents\n' } })
  await startSession($)
  await (await openSettings($)).press({ key: 'pane-write-setup' })
  expect(w.files.get('AGENTS.md')!.startsWith('# Agents\n\n## Agent skills')).toBe(true)
  expect(w.files.has('CLAUDE.md')).toBe(false)
})

test('a shared file edited after it was planned is not overwritten, and the rest waits', async ($, on) => {
  const w: World = world(on, {
    ...github,
    racy: { path: 'CLAUDE.md', onRead: 3, text: '# Rules\n\nSomeone added this meanwhile.\n' },
  })
  await startSession($)
  const pane = await openSettings($)
  await pane.press({ key: 'pane-write-setup' })
  const paths = w.writes.map(x => x.path)
  expect(paths).toEqual([
    'docs/agents/issue-tracker.md',
    'docs/agents/triage-labels.md',
    'docs/agents/domain.md',
  ])
  expect(w.files.get('CLAUDE.md')).toBe('# Rules\n\nRun the tests.\n')
  await pane.redraw()
  expect(await allText(pane)).toContain('CLAUDE.md changed since it was planned')
})

test('an existing .craftory/config.json is left as it is', async ($, on) => {
  const config = '{\n  "version": 1,\n  "custom": true\n}\n'
  const w = world(on, { ...github, files: { ...github.files, '.craftory/config.json': config } })
  await startSession($)
  await (await openSettings($)).press({ key: 'pane-write-setup' })
  expect(w.writes.map(x => x.path)).not.toContain('.craftory/config.json')
  expect(w.files.get('.craftory/config.json')).toBe(config)
})
