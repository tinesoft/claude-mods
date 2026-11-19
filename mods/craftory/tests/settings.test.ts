import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { DEFAULT_LABELS } from '../src/agents-md'
import { DEFAULT_CONFIG } from '../src/config'
import { EFFORTS } from '../src/routing'
import { TOKENS } from '../src/theme'
import {
  ALL_ROWS,
  checkCustom,
  pathOf,
  SECTIONS,
  type SettingsFacts,
  type SettingsRow,
} from '../src/sections'
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
  prefs: { rail: true, railLayout: 'row', theme: 'auto', ascii: false, askContext: true },
  hasCost: true,
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

for (const surface of ['desktop', 'mobile'] as const) {
  test(`${surface}: Settings › Personal has no Theme row, since the ${surface} follows the system`, async ($, on) => {
    const { pane } = await settings(on, $, 'local', {}, surface, 'personal')
    const words = await texts(pane)
    expect(words).toContain('Rail layout')
    expect(words).not.toContain('Theme')
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

test('a path outside the repo is refused with a hint at the Local tracker default, .scratch/', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'docs')
  await pane.input({ key: 'set-docs-adr', text: '../elsewhere/' })
  await pane.redraw()
  expect(w.writes).toEqual([])
  const words = await allText(pane)
  expect(words).toContain('Use a path inside the repo, such as .scratch/')
  expect(words).not.toContain('docs/issues/')
})

test('mobile draws every value but no control that changes one', async ($, on) => {
  const { pane } = await settings(on, $, 'local', {}, 'mobile', 'worktrees')
  expect(await allText(pane)).toContain('Settings are read-only on mobile')
  expect(await allText(pane)).toContain('pnpm install --frozen-lockfile')
  expect(await pane.find({ key: 'set-wt-setup' })).toBeUndefined()
  expect(await pane.find({ key: 'set-wt-keep-failed' })).toBeUndefined()
  expect(await pane.find({ key: 'settings-reset' })).toBeUndefined()
})

test('every automation row is built: none says Not active yet', async ($, on) => {
  const { pane } = await settings(on, $, 'local', {}, 'terminal', 'automation')
  const words = await texts(pane)
  expect(words.filter(w => w.startsWith('Not active yet'))).toHaveLength(0)
})

test('the deny rules appear under Automation, off, and turning one on writes deny in config.json', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'automation')
  const words = await allText(pane)
  expect(words).toContain('Deny a gated phase until the one before it is done')
  expect(words).toContain('Deny edits in your checkout on an integration branch')
  await pane.press({ key: 'set-deny-skip-gate' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!).deny).toEqual({
    hardGates: false,
    skipGate: true,
    editOnIntegrationBranch: false,
    overBudget: false,
  })
  await pane.press({ key: 'set-deny-edit-on-integration' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!).deny).toEqual({
    hardGates: false,
    skipGate: true,
    editOnIntegrationBranch: true,
    overBudget: false,
  })
})

test('Deny over budget is a switch in Automation, and turning it on writes deny.overBudget', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'automation')
  expect(await allText(pane)).toContain('Deny phase skills and agents over budget')
  await pane.press({ key: 'set-deny-over-budget' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!).deny.overBudget).toBe(true)
})

test('Hard gates is a switch in Automation, and turning it on writes deny.hardGates', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'automation')
  expect(await allText(pane)).toContain('Hard gates')
  await pane.press({ key: 'set-deny-hard-gates' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!).deny.hardGates).toBe(true)
})

test('with Hard gates on, the deny rules read on and cannot be turned off', async ($, on) => {
  const { w, pane } = await settings(
    on,
    $,
    'local',
    { files: { '.craftory/config.json': JSON.stringify({ deny: { hardGates: true } }) } },
    'terminal',
    'automation',
  )
  expect(await allText(pane)).toContain('On because Hard gates is on.')
  await pane.press({ key: 'set-deny-skip-gate' }).catch(() => undefined)
  await pane.press({ key: 'set-deny-edit-on-integration' }).catch(() => undefined)
  await pane.press({ key: 'set-deny-over-budget' }).catch(() => undefined)
  expect(JSON.parse(w.files.get('.craftory/config.json')!).deny).toEqual({ hardGates: true })
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

test('Worktrees shows the test command, unset, and its 600 s timeout', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'worktrees')
  const text = await allText(pane)
  expect(text).toContain('Test command')
  expect(text).toContain('Test timeout')
  await pane.input({ key: 'set-wt-test', text: 'pnpm test' })
  await pane.press({ key: 'set-wt-test-timeout-300' })
  const config = JSON.parse(w.files.get('.craftory/config.json')!)
  expect(config.worktrees).toMatchObject({ test: 'pnpm test', testTimeoutSec: 300 })
})

const choiceRow = (id: string) => {
  const row = ALL_ROWS.find(r => r.id === id)!
  if (row.control !== 'choice') throw new Error(`${id} is not a choice row`)
  return row
}

test('the own-value fields read their units and keep to the config bounds', () => {
  const parallel = choiceRow('wt-max-parallel')
  const budget = choiceRow('wt-token-budget')
  const timeout = choiceRow('wt-test-timeout')
  expect(checkCustom(parallel, '12')).toEqual({ value: '12' })
  expect(checkCustom(parallel, '2.5')).toEqual({
    problem: 'Parallel worktrees, at most: use 1 to 16',
  })
  expect(checkCustom(parallel, '17')).toEqual({
    problem: 'Parallel worktrees, at most: use 1 to 16',
  })
  expect(checkCustom(budget, '250k')).toEqual({ value: '250000' })
  expect(checkCustom(budget, '1M')).toEqual({ value: '1000000' })
  expect(checkCustom(budget, '150000')).toEqual({ value: '150000' })
  expect(checkCustom(budget, '5k')).toEqual({ problem: 'Token budget per agent: use 10k to 1000k' })
  expect(checkCustom(timeout, '90 s')).toEqual({ value: '90' })
  expect(checkCustom(timeout, '4 min')).toEqual({ value: '240' })
  expect(checkCustom(timeout, '45')).toEqual({ value: '45' })
  expect(checkCustom(timeout, '15 min')).toEqual({ problem: 'Test timeout: use 10 s to 10 min' })
  expect(checkCustom(timeout, 'soon')).toEqual({ problem: 'Test timeout: use 10 s to 10 min' })
})

test('Worktrees › a parallel limit of your own is saved and shown among the choices', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'worktrees')
  await pane.input({ key: 'set-wt-max-parallel-custom', text: '12' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!).worktrees.maxParallel).toBe(12)
  await pane.redraw()
  await pane.press({ key: 'set-wt-max-parallel-12' })
})

test('Worktrees › an own value out of bounds is refused with the bounds', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'worktrees')
  await pane.input({ key: 'set-wt-token-budget-custom', text: '2M' })
  expect(w.files.get('.craftory/config.json')).toBeUndefined()
  await pane.redraw()
  expect(await allText(pane)).toContain('Token budget per agent: use 10k to 1000k')
})

const savedBudgets = (w: { files: Map<string, string> }) =>
  JSON.parse(w.files.get('.craftory/config.json')!).budgets

test('Pipeline › a Feature budget and a phase’s budget are written to the config defaults', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  await pane.press({ key: 'set-budget-feature-20' })
  expect(savedBudgets(w).featureUsd).toBe(20)
  await pane.redraw()
  await pane.press({ key: 'set-phase-build-budget-10' })
  expect(savedBudgets(w).phaseUsd.build).toBe(10)
  await pane.redraw()
  await pane.press({ key: 'set-phase-build-budget-0' })
  expect(savedBudgets(w).phaseUsd.build).toBe(0)
})

test('Pipeline › a budget of your own is whole dollars, $ or not, and shown among the choices', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  await pane.input({ key: 'set-budget-feature-custom', text: '$35' })
  expect(savedBudgets(w).featureUsd).toBe(35)
  await pane.input({ key: 'set-phase-spec-budget-custom', text: '3' })
  expect(savedBudgets(w).phaseUsd.spec).toBe(3)
  await pane.redraw()
  expect(await texts(pane)).toContain('$35')
  await pane.input({ key: 'set-phase-spec-budget-custom', text: '2.5' })
  await pane.redraw()
  expect(await allText(pane)).toContain('Spec budget: use Off to $100000')
})

test('Pipeline › where this session keeps no cost ledger the budget rows say they need one', async ($, on) => {
  const { pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  expect(await allText(pane)).toContain('Needs a cost ledger: budgets do not apply on this surface')
})

test('Pipeline › with a cost ledger the budget rows carry no such note', async ($, on) => {
  const { pane } = await settings(on, $, 'local', { cost: () => 0 }, 'terminal', 'pipeline')
  const text = await allText(pane)
  expect(text).toContain('Feature budget')
  expect(text).not.toContain('Needs a cost ledger')
})

test('Pipeline › Near budget at offers 70%, 80% and 90%, no Off, and writes budgets.warnAtPercent', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  expect(await allText(pane)).toContain('Near budget at')
  expect(await pane.find({ key: 'set-budget-warn-at-70' })).toBeDefined()
  expect(await pane.find({ key: 'set-budget-warn-at-90' })).toBeDefined()
  expect(await pane.find({ key: 'set-budget-warn-at-100' })).toBeUndefined()
  await pane.press({ key: 'set-budget-warn-at-90' })
  expect(savedBudgets(w).warnAtPercent).toBe(90)
  await pane.redraw()
  await pane.input({ key: 'set-budget-warn-at-custom', text: '75%' })
  expect(savedBudgets(w).warnAtPercent).toBe(75)
})

test('Near budget at takes an own value within 50% to 95%', () => {
  const row = choiceRow('budget-warn-at')
  expect(checkCustom(row, '75%')).toEqual({ value: '75' })
  expect(checkCustom(row, '96')).toEqual({ problem: 'Near budget at: use 50% to 95%' })
})

test('Worktrees › Throttle at and While throttled write rateLimits, with 100% as Off', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'worktrees')
  const text = await allText(pane)
  expect(text).toContain('Throttle at')
  expect(text).toContain('While throttled')
  await pane.press({ key: 'set-rl-throttle-at-90' })
  await pane.press({ key: 'set-rl-throttled-parallel-2' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!).rateLimits).toEqual({
    throttleAt: 90,
    throttledParallel: 2,
  })
  await pane.redraw()
  await pane.press({ key: 'set-rl-throttle-at-100' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!).rateLimits.throttleAt).toBe(100)
})

test('the throttle rows take an own value within the config bounds', () => {
  const at = choiceRow('rl-throttle-at')
  const parallel = choiceRow('rl-throttled-parallel')
  expect(checkCustom(at, '85%')).toEqual({ value: '85' })
  expect(checkCustom(at, '85')).toEqual({ value: '85' })
  expect(checkCustom(at, '40')).toEqual({ problem: 'Throttle at: use 50% to 100%' })
  expect(checkCustom(parallel, '4')).toEqual({ value: '4' })
  expect(checkCustom(parallel, '0')).toEqual({ problem: 'While throttled: use 1 to 16' })
})

const savedPhases = (w: { files: Map<string, string> }) =>
  JSON.parse(w.files.get('.craftory/config.json')!).phases

test('Pipeline › each phase has a model and an effort row, both on session', async ($, on) => {
  const { pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  const text = await allText(pane)
  for (const label of ['Build model', 'Build effort', 'Review model', 'Align effort'])
    expect(text).toContain(label)
  for (const key of ['set-phase-build-model-session', 'set-phase-build-effort-session'])
    expect(await pane.find({ key })).toBeDefined()
  for (const level of EFFORTS)
    expect(await pane.find({ key: `set-phase-review-effort-${level}` })).toBeDefined()
})

test('Pipeline › picking a model and an effort writes phases.<phase>.model and .effort', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  await pane.press({ key: 'set-phase-build-model-sonnet' })
  expect(savedPhases(w).build.model).toBe('sonnet')
  await pane.redraw()
  await pane.press({ key: 'set-phase-build-effort-medium' })
  expect(savedPhases(w).build).toMatchObject({ model: 'sonnet', effort: 'medium' })
  await pane.redraw()
  await pane.press({ key: 'set-phase-build-model-session' })
  expect(savedPhases(w).build.model).toBe('session')
})

test('Pipeline › a model id of your own is saved and shown among the choices', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  await pane.input({ key: 'set-phase-review-model-custom', text: ' claude-opus-4-1-20250805 ' })
  expect(savedPhases(w).review.model).toBe('claude-opus-4-1-20250805')
  await pane.redraw()
  expect(await pane.find({ key: 'set-phase-review-model-claude-opus-4-1-20250805' })).toBeDefined()
})

test('Pipeline › a model of your own that is no model id is refused and nothing is written', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  await pane.input({ key: 'set-phase-review-model-custom', text: 'my best model' })
  expect(w.files.get('.craftory/config.json')).toBeUndefined()
  await pane.redraw()
  expect(await allText(pane)).toContain('Review model: type an alias or a full model id')
})

test('the model rows read an own id typed in as one value', () => {
  const row = choiceRow('phase-build-model')
  expect(checkCustom(row, 'claude-sonnet-4-5[1m]')).toEqual({ value: 'claude-sonnet-4-5[1m]' })
  expect(checkCustom(row, '')).toHaveProperty('problem')
})

const savedRouting = (w: { files: Map<string, string> }) =>
  JSON.parse(w.files.get('.craftory/config.json')!).routing

test('Pipeline › Retry on offers opus by default and writes routing.escalateTo', async ($, on) => {
  const { w, pane } = await settings(on, $, 'local', {}, 'terminal', 'pipeline')
  expect(await allText(pane)).toContain('Retry stuck tickets on')
  expect(await pane.find({ key: 'set-routing-escalate-to-opus' })).toBeDefined()
  await pane.press({ key: 'set-routing-escalate-to-sonnet' })
  expect(savedRouting(w).escalateTo).toBe('sonnet')
  await pane.redraw()
  await pane.press({ key: 'set-routing-escalate-to-session' })
  expect(savedRouting(w).escalateTo).toBe('session')
  await pane.redraw()
  await pane.input({ key: 'set-routing-escalate-to-custom', text: 'claude-opus-4-1-20250805' })
  expect(savedRouting(w).escalateTo).toBe('claude-opus-4-1-20250805')
})

test('the Retry on row refuses text that is no model id', () => {
  const row = choiceRow('routing-escalate-to')
  expect(checkCustom(row, 'claude-opus-4-1')).toEqual({ value: 'claude-opus-4-1' })
  expect(checkCustom(row, 'my best model')).toHaveProperty('problem')
})
