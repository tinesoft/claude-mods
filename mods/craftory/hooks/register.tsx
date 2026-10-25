/**
 * Every hook and every `$` call of Craftory lives here; src/ is pure data in, data out.
 *
 * Ask in a hook, never hold: a hook has 10 s of its own time and the clock stops only during
 * `next` and `$` calls, so a hook cannot wait on a band press. Gates therefore drop the
 * command and offer Run anyway, and the build queue denies a spawn instead of holding it.
 *
 * Hooks are `($, e, next)` and return `next(e)`'s result unless they deliberately answer.
 */
import {
  atom,
  type EngineInterface,
  read,
  type Register,
  type RenderSurface,
  update,
} from 'claude-code'
import {
  AGENT_DOCS,
  DEFAULT_DOCS,
  draftSetup,
  ensureGitignore,
  firstRunText,
  planSetup,
  retargetTracker,
  type SetupSignals,
} from '../src/agents-md'
import { type KeepWhy, samePath, stoppedAnswer, stoppedStep, withoutIsolation } from '../src/build'
import { CONFIG_PATH, configOf, configWrite, parseConfig, patchConfig } from '../src/config'
import { ENGINE_FLOOR, meetsFloor } from '../src/engine'
import { waitingForTriage } from '../src/evidence'
import { draftKey, specKey } from '../src/features'
import {
  diffSummary,
  type FileWrite,
  GITIGNORE,
  isShared,
  type WritableContext,
} from '../src/files'
import type { RunRequest } from '../src/gates'
import { removalTargets, worktreeRemoveArgv } from '../src/git'
import {
  addTerm,
  deleteTerm,
  editTerm,
  type GlossaryEditError,
  parseGlossary,
  serialiseGlossary,
  termKey,
  termsOf,
} from '../src/glossary'
import { derivedNotices, eventNotices, type NoticeAction } from '../src/notices'
import { renderPane } from '../src/pane'
import { type InboxAction, tabCounts } from '../src/pane-view'
import { namespaced, recognise } from '../src/phases'
import { hasSkill, INSTALL_ARGV, pluginLine, UPDATE_ARGV } from '../src/plugin'
import { type BandActions, type FeatureChoice, renderBand, spinFrameOf } from '../src/rail'
import { linkTerms, Reply } from '../src/reply'
import { planScratchImport, type ScratchFile, scratchSummary } from '../src/scratch'
import {
  checkText,
  type SettingsChange,
  type SettingsFacts,
  type SettingsRow,
} from '../src/sections'
import type { SettingsArgs } from '../src/settings'
import { markdownSummary } from '../src/summary'
import type {
  AgentId,
  AgentSetup,
  GlossaryDoc,
  PluginStatus,
  RepoSnapshot,
  SkillName,
  TermDraft,
} from '../types'
import {
  agentsViewOf,
  copyTerminal,
  keptWorktrees,
  pruneStale,
  removeWorktree,
  seatWorktree,
  setSteeringNote,
  toggleDiff,
  worktreesViewOf,
} from './shell/build'
import {
  activeKey,
  activeRecord,
  allowGate,
  countStep,
  currentFlow,
  dismissedOf,
  dismissNotice,
  draftsOf,
  dropNotice,
  enterFromIssue,
  featuresOf,
  finishAgent,
  finishTurn,
  forgetSeat,
  gatePrompt,
  gateVerdict,
  gitOf,
  hasAgentRuns,
  heldNotices,
  loadFeatures,
  noticeOf,
  pendingSeat,
  planSpawn,
  raiseBudget,
  refreshGit,
  refreshTracker,
  runOf,
  scheduleGit,
  scheduleRefresh,
  seatAgent,
  settle,
  skillStarted,
  switchFeature,
  togglePause,
  touchesTracker,
  trackerOf,
} from './shell/flow'
import {
  applyWrites,
  detectPlugin,
  glossaryTerms,
  installOf,
  installPlugin,
  loadRepo,
  pluginOf,
  readSetupFiles,
  readText,
  repoSnapshot,
  sh,
  writableContext,
} from './shell/repo'
import {
  closeCard,
  closeRailPopups,
  glossaryQueryOf,
  glossaryViewOf,
  isPickingFeatureOf,
  loadPrefs,
  noteReplyTerms,
  openPane,
  openStepOf,
  PANE,
  paneTabOf,
  pressStep,
  rememberGlossaryAtStart,
  requestRun,
  resetPrefs,
  resolvedPrefs,
  runFromCard,
  savePrefs,
  searchGlossary,
  ticketsViewOf,
  togglePicker,
  toneOf,
  uiFor,
  watchAppearance,
} from './shell/ui'

const COMMAND = 'craftory'

const RUN_ANYWAY = 'Run anyway'

const DIAGNOSE_FIRST = 'Diagnose first'

const DIAGNOSE_REASON =
  'The user chose to diagnose first, so code-review does not run yet. Tell them what is failing in Build and run the mattpocock-skills:diagnosing-bugs skill on it.'

const keptReason = (path: string, why: KeepWhy) =>
  `Craftory keeps ${path}: ${why === 'running' ? 'an agent is still working in it' : `its agent ${why === 'failed' ? 'failed' : why === 'over-budget' ? 'ran out of token budget' : 'was stopped'}, and the user decides what happens to its work`}. Do not remove it. Clean up the other worktrees and leave this one.`

const setupNoteState = atom({ plugin: 'craftory', key: 'setupNote' } as const, null)

const settingsSectionState = atom(
  { plugin: 'craftory', key: 'settingsSection' } as const,
  'tracker',
)

const termDraftState = atom({ plugin: 'craftory', key: 'termDraft' } as const, {
  name: '',
  definition: '',
  avoid: '',
  editing: null,
})

const setupDraftState = atom({ plugin: 'craftory', key: 'setupDraft' } as const, null)

const askedFilesState = atom({ plugin: 'craftory', key: 'askedFiles' } as const, [])

const termErrorState = atom({ plugin: 'craftory', key: 'termError' } as const, null)

const WRITE_IT = 'Write'

const NOT_NOW = 'Not now'

const signalsOf = (repo: RepoSnapshot | null, plugin: PluginStatus): SetupSignals => ({
  remoteHost: repo?.remoteHost ?? null,
  hasScratch: repo?.hasScratch ?? false,
  hasContextMd: repo?.hasContextMd ?? false,
  steering: repo?.steering.file ?? null,
  hasTriageSkill: hasSkill(plugin, 'triage'),
})

/** The setup Settings shows: what is on disk, else the person's edits to the repo-signal pre-fill. */
async function currentSetup($: EngineInterface): Promise<{ setup: AgentSetup; isDraft: boolean }> {
  const [repo, plugin, draft] = await Promise.all([
    repoSnapshot($),
    pluginOf($),
    read($, setupDraftState),
  ])
  if (repo?.setup.state === 'ok') return { setup: repo.setup.value, isDraft: false }
  return { setup: draft ?? draftSetup(signalsOf(repo, plugin)), isDraft: true }
}

async function settingsFacts(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
): Promise<SettingsFacts & { isDraft: boolean }> {
  const [repo, prefs, current] = await Promise.all([
    repoSnapshot($),
    resolvedPrefs($, options),
    currentSetup($),
  ])
  return {
    config: configOf(repo?.config),
    setup: current.setup,
    isDraft: current.isDraft,
    prefs,
  }
}

/**
 * The first write to a file other people share, in a session, asks with a short diff summary.
 * An ask that cannot be shown (`-p`) allows: Craftory guides and does not gate.
 */
async function confirmFirstWrites(
  $: EngineInterface,
  writes: readonly FileWrite[],
  ctx: WritableContext,
): Promise<boolean> {
  const asked = await read($, askedFilesState)
  const fresh = writes.filter(w => isShared(w.path, ctx) && !asked.includes(w.path))
  if (fresh.length === 0) return true
  const question = [
    `Craftory will change ${fresh.length === 1 ? 'a file' : `${fresh.length} files`} your team shares:`,
    ...fresh.map(w => `${w.path}: ${diffSummary(w.before, w.after)}`),
  ].join('\n')
  const answer = await $.ui.ask(question, [WRITE_IT, NOT_NOW]).catch(() => WRITE_IT)
  if (answer !== WRITE_IT) return false
  await update($, askedFilesState, held => [...held, ...fresh.map(w => w.path)])
  return true
}

/** Asks where needed, writes, reloads the facts, and says what happened in one line. */
async function commitWrites(
  $: EngineInterface,
  writes: readonly FileWrite[],
  ctx: WritableContext,
): Promise<string> {
  const real = writes.filter(w => w.after !== w.before)
  if (real.length === 0) return 'Everything is already as you set it.'
  if (!(await confirmFirstWrites($, real, ctx))) return 'Not written. Nothing changed.'
  const { wrote, refused } = await applyWrites($, real, ctx)
  await loadRepo($)
  return refused ? `${refused}. Nothing more was written; try again.` : `Saved ${wrote.join(', ')}.`
}

async function say($: EngineInterface, note: string | null) {
  await update($, setupNoteState, () => note)
  $.ui.invalidate('ui.render')
}

async function settingsContext($: EngineInterface, setup: AgentSetup, issuesFolder: string) {
  return {
    ...(await writableContext($)),
    steering: setup.steering,
    docs: setup.docs,
    issuesFolder,
  } satisfies WritableContext
}

/** Applies one Settings change to its files: config.json, the agent docs, or `$.store`. */
async function commitChange($: EngineInterface, change: SettingsChange) {
  const [repo, current, files, configText] = await Promise.all([
    repoSnapshot($),
    currentSetup($),
    readSetupFiles($),
    readText($, CONFIG_PATH),
  ])
  const writes: FileWrite[] = []
  const oldConfig = configOf(repo?.config)
  let nextConfig = oldConfig
  if (change.prefs !== undefined) {
    await savePrefs($, change.prefs)
  }
  if (change.config !== undefined) {
    if (repo?.config.state === 'invalid')
      return say(
        $,
        `.craftory/config.json is not valid JSON (${repo.config.problem}). Fix it first.`,
      )
    const after = patchConfig(configText, change.config)
    writes.push({ path: CONFIG_PATH, before: configText, after })
    nextConfig = configOf(parseConfig(after))
  }
  const next = change.setup ? change.setup(current.setup) : current.setup
  if (change.setup && current.isDraft) await update($, setupDraftState, () => next)
  if (!current.isDraft) {
    const options = {
      worktreeFolder: nextConfig.worktrees.folder,
      localFolder: nextConfig.tracker.local.folder,
      chooseSteering: true,
      refreshBlock: true,
    }
    if (change.setup) writes.push(...planSetup(next, files, options))
    const at = writes.findIndex(w => w.path === AGENT_DOCS.tracker)
    const doc = at === -1 ? files.tracker : writes[at]!.after
    if (doc !== null && next.tracker.kind === 'local') {
      const moved = retargetTracker(
        doc,
        oldConfig.tracker.local.folder,
        nextConfig.tracker.local.folder,
      )
      const write = { path: AGENT_DOCS.tracker, before: files.tracker, after: moved }
      if (moved !== doc) {
        if (at === -1) writes.push(write)
        else writes[at] = write
      }
    }
    if (
      nextConfig.worktrees.folder !== oldConfig.worktrees.folder &&
      !writes.some(w => w.path === GITIGNORE)
    )
      writes.push({
        path: GITIGNORE,
        before: files.gitignore,
        after: ensureGitignore(files.gitignore, nextConfig.worktrees.folder),
      })
  }
  const ctx = await settingsContext($, next, nextConfig.tracker.local.folder)
  await say($, writes.length === 0 ? null : await commitWrites($, writes, ctx))
  if (writes.length > 0) await refreshTracker($)
  await settle($)
}

async function applySetting($: EngineInterface, row: SettingsRow, value: string | boolean) {
  if (row.control === 'text' && typeof value === 'string') {
    const problem = checkText(row, value)
    if (problem !== null) return say($, problem)
  }
  const change =
    row.control === 'switch'
      ? typeof value === 'boolean'
        ? row.write(value)
        : undefined
      : typeof value === 'string'
        ? row.write(value)
        : undefined
  if (change !== undefined) await commitChange($, change)
}

/** Save setup: exactly what `/setup-matt-pocock-skills` would write for the answers on screen. */
async function saveSetup($: EngineInterface) {
  try {
    const [files, configText, current] = await Promise.all([
      readSetupFiles($),
      readText($, CONFIG_PATH),
      currentSetup($),
    ])
    const config = configOf(parseConfig(configText))
    const writes = [
      ...planSetup(current.setup, files, {
        worktreeFolder: config.worktrees.folder,
        localFolder: config.tracker.local.folder,
        chooseSteering: true,
      }),
      ...configWrite(configText),
    ]
    const ctx = await settingsContext($, current.setup, config.tracker.local.folder)
    const note = await commitWrites($, writes, ctx)
    await update($, setupDraftState, () => null)
    await say($, note)
    await refreshTracker($)
  } catch (error) {
    await say($, `Setup failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  await settle($)
}

async function resetSettings($: EngineInterface) {
  const answer = await $.ui
    .ask(
      'Reset Craftory to its defaults? This rewrites .craftory/config.json and clears your personal settings. Docs and the glossary stay.',
      ['Reset', 'Keep'],
    )
    .catch(() => 'Keep')
  if (answer !== 'Reset') return
  const configText = await readText($, CONFIG_PATH)
  const { setup } = await currentSetup($)
  const config = configOf(parseConfig(configText))
  const defaults = patchConfig(null, {})
  const ctx = await settingsContext($, setup, config.tracker.local.folder)
  const note = await commitWrites(
    $,
    [{ path: CONFIG_PATH, before: configText, after: defaults }],
    ctx,
  )
  await resetPrefs($)
  await say($, note === 'Everything is already as you set it.' ? 'Already at the defaults.' : note)
  await refreshTracker($)
  await settle($)
}

async function rerunSetup($: EngineInterface) {
  if (!hasSkill(await pluginOf($), 'setup-matt-pocock-skills'))
    return void $.ui.toast('Install mattpocock-skills first: the setup skill comes with it')
  await $.command.run({ command: namespaced('setup-matt-pocock-skills' as SkillName), args: '' })
}

async function readScratch($: EngineInterface): Promise<ScratchFile[]> {
  const found: ScratchFile[] = []
  const take = async (path: string) => {
    const text = await readText($, path)
    if (text !== null) found.push({ path, text })
  }
  const features = (await $.fs.list('.scratch').catch(() => [])).filter(e => e.kind === 'dir')
  for (const feature of features) {
    const base = `.scratch/${feature.name}`
    await take(`${base}/spec.md`)
    const issues = await $.fs.list(`${base}/issues`).catch(() => [])
    for (const issue of issues)
      if (issue.kind === 'file' && issue.name.endsWith('.md'))
        await take(`${base}/issues/${issue.name}`)
  }
  return found
}

async function scratchPlan($: EngineInterface, folder: string) {
  const taken = (await $.fs.list(folder).catch(() => []))
    .map(e => /^(\d+)-/.exec(e.name)?.[1])
    .flatMap(n => (n === undefined ? [] : [Number(n)]))
  return planScratchImport({ files: await readScratch($), taken, folder })
}

/** Offered only for a Local tracker with a `.scratch/` folder; writes after the person confirms. */
async function importScratch($: EngineInterface) {
  const { setup } = await currentSetup($)
  const config = configOf((await repoSnapshot($))?.config)
  const folder = config.tracker.local.folder
  const plan = await scratchPlan($, folder)
  if (plan.items.length === 0) return say($, 'Nothing to import from .scratch/.')
  const answer = await $.ui
    .ask(
      `Copy ${scratchSummary(plan)} from .scratch/ into ${folder}? Nothing in .scratch/ is moved or deleted.`,
      ['Import', 'Not now'],
    )
    .catch(() => 'Not now')
  if (answer !== 'Import') return
  const { wrote, refused } = await applyWrites(
    $,
    plan.writes,
    await settingsContext($, setup, folder),
  )
  await say(
    $,
    refused
      ? `${refused}. Imported ${wrote.length} of ${plan.items.length}.`
      : `Imported ${scratchSummary(plan)} into ${folder}.`,
  )
  await refreshTracker($)
  await settle($)
}

const TERM_ERRORS: Record<GlossaryEditError, string> = {
  duplicate: 'A term with that name is already in the glossary.',
  'unknown-term': 'That term is no longer in the glossary.',
  'empty-name': 'A term needs a name.',
}

const EMPTY_DRAFT: TermDraft = { name: '', definition: '', avoid: '', editing: null }

/** One glossary edit: read the file, edit the raw slices, write once through the shared guard. */
async function changeGlossary(
  $: EngineInterface,
  edit: (doc: GlossaryDoc | null) => GlossaryDoc | GlossaryEditError,
  done?: (path: string) => string,
) {
  const { setup } = await currentSetup($)
  const path = setup.docs.glossary
  const raw = await readText($, path)
  const loaded = parseGlossary(raw)
  if (loaded.state === 'invalid')
    return update($, termErrorState, () => `${path} could not be read`)
  const next = edit(loaded.state === 'ok' ? loaded.value : null)
  if (typeof next === 'string') {
    await update($, termErrorState, () => TERM_ERRORS[next])
    return $.ui.invalidate('ui.render')
  }
  const config = configOf((await repoSnapshot($))?.config)
  const note = await commitWrites(
    $,
    [{ path, before: raw, after: serialiseGlossary(next) }],
    await settingsContext($, setup, config.tracker.local.folder),
  )
  await update($, termErrorState, () => null)
  await update($, termDraftState, () => EMPTY_DRAFT)
  await say($, done?.(path) ?? note)
  $.ui.invalidate('ui.render')
}

async function saveTerm($: EngineInterface, patch: Partial<TermDraft> = {}) {
  const draft = { ...(await read($, termDraftState)), ...patch }
  await update($, termDraftState, () => draft)
  if (draft.definition.trim() === '' && draft.name.trim() !== '') {
    await update($, termErrorState, () => 'A term needs a definition.')
    return $.ui.invalidate('ui.render')
  }
  const term = {
    name: draft.name.trim(),
    definition: draft.definition.trim(),
    avoid: draft.avoid
      .split(',')
      .map(a => a.trim())
      .filter(Boolean),
  }
  const editing = draft.editing
  await changeGlossary($, doc =>
    editing === null
      ? addTerm(doc, term)
      : doc === null
        ? 'unknown-term'
        : editTerm(doc, termKey(editing), term),
  )
}

async function editTermInForm($: EngineInterface, name: string) {
  const term = (await glossaryTerms($)).find(t => termKey(t.name) === termKey(name))
  if (term === undefined) return
  await update($, termErrorState, () => null)
  await update($, termDraftState, () => ({
    name: term.name,
    definition: term.definition,
    avoid: term.avoid.join(', '),
    editing: term.name,
  }))
  $.ui.invalidate('ui.render')
}

/** Terms in CONTEXT.md (the glossary's older name) that GLOSSARY.md does not have yet. */
async function importContext($: EngineInterface) {
  const imported = parseGlossary(await readText($, 'CONTEXT.md'))
  if (imported.state !== 'ok') return say($, 'CONTEXT.md has no terms to import.')
  const incoming = termsOf(imported.value)
  let added = 0
  await changeGlossary(
    $,
    doc => {
      let current: GlossaryDoc | null = doc
      for (const term of incoming) {
        const next = addTerm(current, term)
        if (typeof next === 'string') continue
        current = next
        added++
      }
      return current ?? { slices: [] }
    },
    path =>
      added === 0
        ? 'Nothing new in CONTEXT.md.'
        : `Imported ${added} of ${incoming.length} terms from CONTEXT.md into ${path}.`,
  )
}

async function copyGlossaryPath($: EngineInterface, surface: RenderSurface) {
  const { setup } = await currentSetup($)
  const copied = await $.ui
    .copy({ text: setup.docs.glossary, surface })
    .catch(() => ({ isCopied: false }))
  $.ui.toast(
    copied.isCopied ? `Copied ${setup.docs.glossary}` : `The glossary is ${setup.docs.glossary}`,
  )
}

async function onNotice($: EngineInterface, action: NoticeAction) {
  switch (action.kind) {
    case 'install':
      return installPlugin($, INSTALL_ARGV)
    case 'update':
      return installPlugin($, UPDATE_ARGV)
    case 'not-now':
      return dismissNotice($, action.key)
    case 'setup':
      await openPane($, 'settings')
      return
    case 'run':
      return requestRun($, action.skill, action.args)
    case 'run-anyway': {
      const notice = await allowGate($, action.id)
      if (notice === undefined) return
      await $.command.run({ command: namespaced(notice.skill), args: notice.args })
      return
    }
    case 'diagnose': {
      await dropNotice($, action.id)
      await $.command.run({ command: namespaced('diagnosing-bugs' as SkillName), args: '' })
      return
    }
    case 'raise-budget': {
      const notice = await noticeOf($, action.id)
      if (notice?.kind !== 'budget') return
      await raiseBudget($, notice.ticket)
      return dropNotice($, notice.id)
    }
    case 'resolve': {
      await dropNotice($, action.id)
      await refreshGit($)
      await openPane($, 'worktrees')
      return
    }
    case 'open-tickets':
      await openPane($, 'tickets')
      return
    case 'rename': {
      const notice = await noticeOf($, action.id)
      if (notice?.kind !== 'drift') return
      await dropNotice($, notice.id)
      return jumpToTerm($, notice.term)
    }
    case 'review-retro': {
      await dropNotice($, action.id)
      return openPane($, 'flow')
    }
    case 'dismiss':
      return dropNotice($, action.id)
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

/** Start feature on a ready-for-agent issue: it enters at `phase` and the earlier phases are skipped. */
async function startFromIssue($: EngineInterface, action: Extract<InboxAction, { kind: 'start' }>) {
  const step = await enterFromIssue($, action)
  if (step?.command)
    await requestRun($, step.command, action.phase === 'align' ? action.ref : step.args)
}

async function openFolder($: EngineInterface, folder: string, surface: RenderSurface) {
  const copied = await $.ui.copy({ text: folder, surface }).catch(() => ({ isCopied: false }))
  $.ui.toast(copied.isCopied ? `Copied ${folder}` : `Could not copy · the folder is ${folder}`)
}

async function jumpToTerm($: EngineInterface, name: string) {
  await update($, settingsSectionState, () => 'glossary')
  await editTermInForm($, name)
  await openPane($, 'settings')
}

async function scratchOffer($: EngineInterface, folder: string) {
  const plan = await scratchPlan($, folder)
  return plan.items.length === 0 ? null : { count: plan.items.length, folder }
}

async function settingsArgs(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
): Promise<Omit<SettingsArgs, 'ui' | 'tone' | 'readOnly'>> {
  const [facts, repo, plugin, section, draft, error, note] = await Promise.all([
    settingsFacts($, options),
    repoSnapshot($),
    pluginOf($),
    read($, settingsSectionState),
    read($, termDraftState),
    read($, termErrorState),
    read($, setupNoteState),
  ])
  return {
    facts,
    section,
    isDraft: facts.isDraft,
    firstRun: firstRunText(signalsOf(repo, plugin)),
    glossary: {
      terms: await glossaryTerms($),
      draft,
      path: facts.setup.docs.glossary,
      hasContextMd: repo?.hasContextMd ?? false,
      error,
    },
    scratch:
      facts.setup.tracker.kind === 'local' &&
      repo?.hasScratch &&
      section === 'tracker' &&
      (await paneTabOf($)) === 'settings'
        ? await scratchOffer($, facts.config.tracker.local.folder)
        : null,
    note,
    on: {
      section: id => {
        void update($, settingsSectionState, () => id).then(() => $.ui.invalidate('ui.render'))
      },
      set: (row, value) => void applySetting($, row, value),
      saveSetup: () => void saveSetup($),
      reset: () => void resetSettings($),
      rerunSetup: () => void rerunSetup($),
      importScratch: () => void importScratch($),
      term: {
        draft: patch => {
          void update($, termDraftState, held => ({ ...held, ...patch })).then(() =>
            $.ui.invalidate('ui.render'),
          )
        },
        save: patch => void saveTerm($, patch),
        cancel: () => {
          void update($, termDraftState, () => EMPTY_DRAFT).then(() => $.ui.invalidate('ui.render'))
        },
        edit: name => void editTermInForm($, name),
        remove: name =>
          void changeGlossary($, doc =>
            doc === null ? 'unknown-term' : deleteTerm(doc, termKey(name)),
          ),
        importContext: () => void importContext($),
        copyPath: () => void copyGlossaryPath($, 'desktop'),
      },
    },
  }
}

const isSupported = async ($: EngineInterface) => meetsFloor((await $.session.version()).base)

const drawsAnything = async ($: EngineInterface) =>
  (await isSupported($)) && (await $.session.surfaces()).length > 0

async function featureChoices($: EngineInterface): Promise<FeatureChoice[]> {
  const [features, drafts, active] = await Promise.all([featuresOf($), draftsOf($), activeKey($)])
  return [
    ...Object.values(features).map(f => ({
      key: specKey(f.spec),
      title: f.title || f.spec,
      isActive: specKey(f.spec) === active,
    })),
    ...Object.values(drafts).map(d => ({
      key: draftKey(d.draftId),
      title: d.title,
      isActive: draftKey(d.draftId) === active,
    })),
  ]
}

const bandActions = ($: EngineInterface): BandActions => ({
  step: (phase, fitsCard) => void pressStep($, phase, fitsCard),
  triage: fitsCard => void pressStep($, 'triage', fitsCard),
  summary: () => void openPane($, 'flow'),
  gear: () => void openPane($, 'settings'),
  run: phase => void runFromCard($, phase),
  openTickets: () => void openPane($, 'tickets'),
  closeCard: () => void closeCard($),
  pickFeature: () => void togglePicker($),
  switchFeature: key => {
    void (async () => {
      await closeRailPopups($)
      await switchFeature($, key)
    })()
  },
  notice: action => void onNotice($, action),
  pauseAll: () => void togglePause($),
  openPanel: () => void openPane($, 'worktrees'),
  raiseBudget: ticket => {
    void raiseBudget($, ticket).then(() => dropNotice($, `budget-${ticket}`))
  },
  diagnose: () => {
    void $.command.run({ command: namespaced('diagnosing-bugs' as SkillName), args: '' })
  },
  writePr: () => void requestRun($, 'pr' as SkillName, ''),
})

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: "Show the active feature's phases, tickets, worktrees, glossary and settings",
      immediate: true,
    })
    await loadPrefs($)
    watchAppearance($)
    if (!(await isSupported($))) {
      $.ui.toast(`Craftory needs Claude Code ${ENGINE_FLOOR} or later. Run claude update.`)
    }
    await Promise.all([loadRepo($), loadFeatures($), detectPlugin($)])
    await rememberGlossaryAtStart($)
    await refreshTracker($)
    await refreshGit($)
    if (configOf((await repoSnapshot($))?.config).worktrees.pruneStale) await pruneStale($)
    await settle($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    if (!(await drawsAnything($))) {
      return {
        text: markdownSummary(await currentFlow($), await pluginOf($)),
      }
    }
    await openPane($, 'flow')
    return { text: 'Opened the Craftory pane.' }
  })

  on('skill.prompt', async ($, e, next) => {
    await skillStarted($, e.skill)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const drop = await gatePrompt($, e)
    return drop === undefined ? next(e) : { drop }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      await finishAgent($, e.agentId as AgentId, e.reason)
      return result
    }
    await noteReplyTerms($, e.answer)
    await finishTurn($, e)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const tool = {
      name: e.tool,
      ...('command' in e && typeof e.command === 'string' && { command: e.command }),
      ...('file_path' in e && typeof e.file_path === 'string' && { path: e.file_path }),
    }
    if (await touchesTracker($, tool)) scheduleRefresh($)
    if (e.tool === 'Bash' && /\bgit\b/.test(tool.command ?? '')) {
      if (await hasAgentRuns($)) scheduleGit($)
    }
    return result
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const decision = await planSpawn($, {
      toolUseId: e.tool_use_id,
      description: e.description,
      prompt: e.prompt,
      ...(e.name !== undefined && { name: e.name }),
      ...(e.isolation !== undefined && { isolation: e.isolation }),
    })
    if (decision.kind === 'pass') return next(e)
    if (decision.kind === 'deny') return { deny: decision.reason }
    // On success the spawn already moved the seat to a run; only a refused or failed call is forgotten.
    const forget = () => forgetSeat($, e.tool_use_id)
    try {
      const result = await next({ ...withoutIsolation(e), name: decision.name })
      if (result.deny !== undefined || result.isError === true) await forget()
      return result
    } catch (error) {
      await forget()
      throw error
    }
  })

  // The seat goes through `cwd`: `agent.spawn` shares the Agent call's `tool_use_id`, so the ticket
  // and its worktree pair exactly. The engine refuses `cwd` together with `isolation: 'worktree'`,
  // so the call lost `isolation` above, and a spawn that fails removes the worktree made for it.
  on('agent.spawn', async ($, e, next) => {
    const seat = await pendingSeat($, e.tool_use_id)
    if (seat === undefined) return next(e)
    const { plan } = seat
    const placed = await seatWorktree($, plan)
    if (!placed.ok) {
      const note = `Craftory could not make ${plan.path}: ${placed.reason}`
      await setSteeringNote($, note)
      await settle($)
      return {
        deny: `${note}. Do not start ${plan.ticket} until that is fixed; tell the user what git said.`,
      }
    }
    await setSteeringNote($, null)
    const undo = async () => {
      if (placed.isFresh) await sh($, worktreeRemoveArgv(plan.path, true))
    }
    let result
    try {
      result = await next({ ...e, cwd: placed.path })
    } catch (error) {
      await undo()
      throw error
    }
    if (result.deny !== undefined || result.agentId === undefined) {
      await undo()
      return result
    }
    await seatAgent($, e.tool_use_id, plan, result.agentId as AgentId)
    return result
  })

  // Yielding a text chunk and returning without `next` sends no request and ends the subagent at
  // once; its Agent call then returns that text. This is the hard stop at the budget.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId as AgentId | undefined
    const run = await runOf($, agentId)
    if (agentId === undefined || run === undefined || run.status !== 'running')
      return yield* next(e)
    if (run.isStopping) {
      yield { kind: 'text', index: 0, text: stoppedAnswer(run) }
      return stoppedStep(e.turnId, e.index, run)
    }
    const result = yield* next(e)
    await countStep($, agentId, result)
    return result
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const found = recognise(e.skill, { strict: false })
    if (found?.kind !== 'phase' || found.phase !== 'review') return next(e)
    const req: RunRequest = { skill: found.skill, args: e.args ?? '', phase: 'review' }
    const verdict = await gateVerdict($, req)
    if (verdict.kind === 'go') return next(e)
    const answer = await $.ui
      .ask(verdict.text, [RUN_ANYWAY, DIAGNOSE_FIRST])
      .catch(() => RUN_ANYWAY)
    return answer === DIAGNOSE_FIRST ? { deny: DIAGNOSE_REASON } : next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const targets = removalTargets(e.command)
    if (targets.length === 0) return next(e)
    const kept = await keptWorktrees($)
    const hit = kept.find(k => targets.some(t => samePath(t, k.path) || samePath(k.path, t)))
    return hit === undefined ? next(e) : { deny: keptReason(hit.path, hit.why) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await isSupported($))) return below
    const prefs = await resolvedPrefs($, options)
    if (!prefs.rail) return below
    const [repo, plugin, flow] = await Promise.all([repoSnapshot($), pluginOf($), currentFlow($)])
    const derived = derivedNotices({
      plugin,
      install: await installOf($),
      repo,
      hasFeature: flow !== null,
      firstRunText: firstRunText({
        remoteHost: repo?.remoteHost ?? null,
        hasScratch: repo?.hasScratch ?? false,
        hasContextMd: repo?.hasContextMd ?? false,
        steering: repo?.steering.file ?? null,
        hasTriageSkill: hasSkill(plugin, 'triage'),
      }),
      dismissed: await dismissedOf($),
    })
    const events = derived.some(n => n.replacesRail) ? [] : eventNotices(await heldNotices($))
    if (flow === null && derived.length === 0 && events.length === 0) return below
    return renderBand({
      ui: uiFor($, e),
      surface: e.surface,
      columns: e.props.bodyColumns,
      maxRows: e.props.maxRows,
      tone: await toneOf($, options, e.surface),
      ascii: prefs.ascii,
      spinFrame: spinFrameOf(await $.clock.now()),
      below,
      layout: prefs.railLayout,
      flow,
      config: configOf(repo?.config),
      waiting: waitingForTriage(await trackerOf($)),
      agents: await agentsViewOf($, flow),
      notices: [...events, ...derived],
      open: await openStepOf($),
      features: await featureChoices($),
      isPickingFeature: await isPickingFeatureOf($),
      on: bandActions($),
    })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.isSummary === true || !(await isSupported($)))
      return next(e)
    const repo = await repoSnapshot($)
    if (!configOf(repo?.config).automation.underlineTerms) return next(e)
    const linked = linkTerms(e.props.text, await glossaryTerms($))
    if (linked.found.length === 0) return next(e)
    const table = $.ui.resolve(e)
    return (
      <Reply
        ui={{ ...uiFor($, e), Markdown: table.Markdown }}
        tone={await toneOf($, options, e.surface)}
        surface={e.surface}
        linked={linked}
        path={repo?.setup.state === 'ok' ? repo.setup.value.docs.glossary : DEFAULT_DOCS.glossary}
        on={{
          ask: term =>
            void $.command.run({ command: namespaced('wait-what' as SkillName), args: term.name }),
          edit: term => void jumpToTerm($, term.name),
        }}
      />
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [flow, git, glossary, resolved] = await Promise.all([
      currentFlow($),
      gitOf($),
      glossaryViewOf($),
      resolvedPrefs($, options),
    ])
    const worktrees = await worktreesViewOf($)
    const tickets = await ticketsViewOf($, flow)
    const actions = bandActions($)
    return renderPane({
      ui: uiFor($, e),
      surface: e.surface,
      tone: await toneOf($, options, e.surface),
      ascii: resolved.ascii,
      spinFrame: spinFrameOf(await $.clock.now()),
      tab: await paneTabOf($),
      pluginLine: pluginLine(await pluginOf($)),
      flow,
      waiting: waitingForTriage(await trackerOf($)),
      counts: tabCounts({
        flow,
        tickets,
        worktrees: git === null ? null : git.worktrees.length,
        terms: glossary.hasFile ? glossary.total : null,
      }),
      tickets,
      worktrees,
      glossary,
      query: await glossaryQueryOf($),
      settings: await settingsArgs($, options),
      on: {
        tab: tab => void openPane($, tab),
        diff: path => void toggleDiff($, path),
        openTerminal: (path, surface) => void copyTerminal($, path, surface),
        remove: path => void removeWorktree($, path),
        prune: () => void pruneStale($),
        openFolder: (folder, surface) => void openFolder($, folder, surface),
        inbox: action =>
          void (action.kind === 'start'
            ? startFromIssue($, action)
            : requestRun($, 'triage' as SkillName, action.ref)),
        implement: ref => void requestRun($, 'implement' as SkillName, ref),
        implementSpec: () =>
          void (async () => {
            const record = await activeRecord($)
            if (record !== null) await requestRun($, 'implement-spec' as SkillName, record.spec)
          })(),
        search: text => void searchGlossary($, text),
        editTerm: name => void jumpToTerm($, name),
        rail: { step: actions.step, triage: actions.triage },
      },
    })
  })
}
