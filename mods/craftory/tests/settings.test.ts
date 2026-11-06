import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { DEFAULT_LABELS } from '../src/agents-md'
import { DEFAULT_CONFIG } from '../src/config'
import { TOKENS } from '../src/theme'
import { ALL_ROWS, pathOf, SECTIONS, type SettingsFacts, type SettingsRow } from '../src/sections'
import { UPSTREAM_FIXTURES as up } from './upstream-fixtures'
import {
  allText,
  featureWorld,
  mattCommands,
  mountPane,
  startSession,
  texts,
  MATT_SKILLS,
  IN_RANGE,
  world,
  type WorldOptions,
} from './harness'

const TRACKER_DOCS: Record<string, string> = {
  local: '# Issue tracker: Local Markdown\n\nIssues live in `docs/issues/`.\n',
  github: up['issue-tracker-github.md']!,
  gitlab: up['issue-tracker-gitlab.md']!,
  other: '# Issue tracker: Other\n\nWe use Linear.\n',
}

const setupFiles = (kind: string) => ({
  'docs/agents/issue-tracker.md': TRACKER_DOCS[kind]!,
  'docs/agents/triage-labels.md': up['triage-labels.md']!,
  'docs/agents/domain.md': up['domain.md']!,
  'CLAUDE.md':
    '# Rules\n\n## Agent skills\n\n### Issue tracker\n\nx. See `docs/agents/issue-tracker.md`.\n',
  'GLOSSARY.md': '# G\n\n## Language\n\n**Customer**:\nThe paying account.\n_Avoid_: client\n',
})

const settings = async <S extends 'terminal' | 'desktop' | 'mobile' = 'terminal'>(
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  kind = 'local',
  options: WorldOptions = {},
  surface: S = 'terminal' as S,
  section = 'entry',
) => {
  const w = featureWorld(on, {
    commands: mattCommands(...MATT_SKILLS, 'setup-matt-pocock-skills'),
    surfaces: [surface],
    ...options,
    files: { ...setupFiles(kind), ...options.files },
  })
  await startSession($, surface)
  const pane = await mountPane($, surface)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: `section-section-${section}` })
  return { w, pane }
}

const sectionOf = (row: SettingsRow) => SECTIONS.find(s => s.rows.includes(row))!.id

const kindOfRow = (id: string) =>
  id.includes('github')
    ? 'github'
    : id.includes('gitlab')
      ? 'gitlab'
      : id === 'other-description'
        ? 'other'
        : 'local'

const FACTS: SettingsFacts = {
  config: DEFAULT_CONFIG,
  setup: {
    tracker: { kind: 'local' },
    triage: DEFAULT_LABELS,
    docs: { glossary: 'GLOSSARY.md', adr: 'docs/adr/' },
    steering: 'CLAUDE.md',
  },
  prefs: { rail: true, railLayout: 'row', theme: 'auto', ascii: false },
}

for (const row of ALL_ROWS) {
  test(`Settings › ${row.id} writes its value to ${row.file}`, async ($, on) => {
    const { w, pane } = await settings(on, $, kindOfRow(row.id), {}, 'terminal', sectionOf(row))
    const facts = { ...FACTS, setup: { ...FACTS.setup, tracker: { kind: 'local' as const } } }
    let change
    if (row.control === 'switch') {
      await pane.press({ key: `set-${row.id}` })
      change = row.write(!row.read(facts))
    } else if (row.control === 'choice') {
      const pick = row.options(facts).find(([v]) => v !== row.read(facts))![0]
      await pane.press({ key: `set-${row.id}-${pick}` })
      change = row.write(pick)
    } else {
      await pane.input({ key: `set-${row.id}`, text: 'changed' })
      change = row.write('changed')
    }
    if (row.file === 'prefs') {
      expect(w.store.get('prefs')).toMatchObject(change.prefs!)
      expect(w.writes).toEqual([])
      return
    }
    const next = change.setup ? change.setup(FACTS.setup) : FACTS.setup
    const path = pathOf(row.file, next)
    expect(
      w.writes.map(x => x.path),
      row.id,
    ).toContain(path)
  })
}

test('the config file keeps its unknown keys and key order when a value changes', async ($, on) => {
  const raw = '{\n  "version": 1,\n  "custom": true,\n  "worktrees": { "maxParallel": 2 }\n}\n'
  const { w, pane } = await settings(
    on,
    $,
    'local',
    { files: { '.craftory/config.json': raw } },
    'terminal',
    'worktrees',
  )
  await pane.press({ key: 'set-wt-max-parallel-4' })
  const saved = JSON.parse(w.files.get('.craftory/config.json')!)
  expect(saved.custom).toBe(true)
  expect(saved.worktrees.maxParallel).toBe(4)
  expect(Object.keys(saved).slice(0, 2)).toEqual(['version', 'custom'])
})

test('the first write to a shared file asks with a diff summary; later writes to it do not', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', { ask: () => 'Write' }, 'terminal', 'docs')
  await pane.press({ key: 'set-docs-glossary' }).catch(() => undefined)
  await pane.input({ key: 'set-docs-adr', text: 'adr/' })
  const asked = () =>
    w.calls
      .filter(c => c.tool === 'AskUserQuestion')
      .map(c => (c.questions as { question: string }[])[0]!.question)
  expect(asked()).toHaveLength(1)
  expect(asked()[0]).toContain('docs/agents/domain.md')
  expect(asked()[0]).toMatch(/\+\d+ −\d+ lines/)
  await pane.input({ key: 'set-docs-adr', text: 'adr2/' })
  expect(asked()).toHaveLength(1)
  expect(w.files.get('docs/agents/domain.md')).toContain('adr2/')
})

test('declining the first-write ask writes nothing', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', { ask: () => 'Not now' }, 'terminal', 'docs')
  await pane.input({ key: 'set-docs-adr', text: 'adr/' })
  expect(w.writes).toEqual([])
  await pane.redraw()
  expect(await allText(pane)).toContain('Not written. Nothing changed.')
})

test('an empty value is refused with a reason and nothing is written', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'worktrees')
  await pane.input({ key: 'set-wt-folder', text: '  ' })
  await pane.redraw()
  expect(w.writes).toEqual([])
  expect(await allText(pane)).toContain('Worktree folder needs a value')
})

test('mobile draws every value but no control that changes one', async ($, on) => {
  const { pane } = await settings(on, $, 'local', {}, 'mobile', 'worktrees')
  expect(await allText(pane)).toContain('Settings are read-only on mobile')
  expect(await allText(pane)).toContain('pnpm install --frozen-lockfile')
  expect(await pane.find({ key: 'set-wt-setup' })).toBeUndefined()
  expect(await pane.find({ key: 'set-wt-keep-failed' })).toBeUndefined()
  expect(await pane.find({ key: 'settings-reset' })).toBeUndefined()
})

test('rows whose behaviour is not built yet say so', async ($, on) => {
  const { pane } = await settings(on, $, 'local', {}, 'terminal', 'automation')
  const words = await texts(pane)
  expect(words.filter(w => w.startsWith('Not active yet'))).toHaveLength(3)
})

test('Reset to defaults asks, then restores config.json and clears personal prefs', async ($, on) => {
  const { w, pane } = await settings(
    on,
    $,
    'local',
    { ask: () => 'Reset', store: { prefs: { ascii: true } } },
    'terminal',
    'worktrees',
  )
  await pane.press({ key: 'set-wt-max-parallel-6' })
  await pane.press({ key: 'settings-reset' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!)).toEqual(DEFAULT_CONFIG)
  expect(w.store.get('prefs')).toEqual({})
})

const SETUP = 'mattpocock-skills:setup-matt-pocock-skills'

test('Re-run /setup-matt-pocock-skills on a repo that is set up tells the skill to keep it', async ($, on) => {
  const { w, pane } = await settings(on, $)
  await pane.press({ key: 'settings-rerun' })
  expect(w.commandsRun).toContainEqual({
    command: SETUP,
    args: expect.stringContaining('Do not switch tracker'),
  })
})

test('Start over re-runs the setup skill with nothing to keep', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', { ask: () => 'Start over' })
  await pane.press({ key: 'settings-rerun' })
  expect(w.commandsRun).toContainEqual({ command: SETUP, args: '' })
})

test('first run pre-fills Settings from the repo and writes nothing until Save setup', async ($, on) => {
  const w = world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    remote: 'git@github.com:acme/app.git',
    files: { 'CLAUDE.md': '# Rules\n' },
  })
  await startSession($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'section-section-tracker' })
  const words = await texts(pane)
  expect(words).toContain('Set up Craftory')
  expect(words.join(' ')).toContain('Found a GitHub remote')
  await pane.press({ key: 'set-tracker-kind-gitlab' })
  expect(w.writes.map(x => x.path)).not.toContain('docs/agents/issue-tracker.md')
  await pane.press({ key: 'pane-write-setup' })
  expect(w.files.get('docs/agents/issue-tracker.md')).toContain('# Issue tracker: GitLab')
})

test('the plugin status and the rail switch head the tab', async ($, on) => {
  const { pane } = await settings(on, $)
  expect(await allText(pane)).toContain('mattpocock-skills 1.3.1 installed · tested with 1.3.x')
  expect(await pane.find({ key: 'set-pref-rail' })).toBeDefined()
})

test('desktop draws the switches as Svg tracks in the tone’s colours', async ($, on) => {
  const dark = await settings(on, $, 'local', { theme: 'dark' }, 'desktop', 'automation')
  const svgs = await dark.pane.findAll({ type: 'Svg' })
  expect(svgs.length).toBeGreaterThanOrEqual(6)
  expect(String(svgs[0]!.props.source)).toContain(TOKENS.dark.switchOn)
})

const CONFIG = '.craftory/config.json'
const MINE = '{\n  "version": 1,\n  "worktrees": { "maxParallel": 3 }\n}\n'
const THEIRS = '{\n  "version": 1,\n  "worktrees": { "maxParallel": 3 },\n  "custom": true\n}\n'

test('a setting is applied to config.json as it is when written, not as it was when the pane last read it', async ($, on) => {
  const { w, pane } = await settings(
    on,
    $,
    'local',
    { files: { [CONFIG]: MINE }, racy: { path: CONFIG, onRead: 3, text: THEIRS } },
    'terminal',
    'worktrees',
  )
  await pane.press({ key: 'set-wt-max-parallel-6' })
  const saved = JSON.parse(w.files.get(CONFIG)!)
  expect(saved.custom).toBe(true)
  expect(saved.worktrees.maxParallel).toBe(6)
})

test('config.json edited between that re-read and the write is not overwritten', async ($, on) => {
  const { w, pane } = await settings(
    on,
    $,
    'local',
    { files: { [CONFIG]: MINE }, racy: { path: CONFIG, onRead: 5, text: THEIRS } },
    'terminal',
    'worktrees',
  )
  await pane.press({ key: 'set-wt-max-parallel-6' })
  expect(w.files.get(CONFIG)).toBe(MINE)
  await pane.redraw()
  expect(await allText(pane)).toContain('.craftory/config.json changed since it was planned')
})
