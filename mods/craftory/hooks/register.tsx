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
  type Timer,
  update,
} from 'claude-code'
import {
  AGENT_DOCS,
  DEFAULT_DOCS,
  DEFAULT_LABELS,
  draftSetup,
  ensureGitignore,
  firstRunText,
  planSetup,
  readSetup,
  remoteHostOf,
  retargetTracker,
  type SetupFiles,
  type SetupSignals,
  steeringOf,
} from '../src/agents-md'
import {
  addPending,
  addQueued,
  agentRows,
  type AgentsView,
  agentsView,
  budgetFor,
  budgetK,
  budgetState,
  cleanupPlan,
  conflictText,
  decideSpawn,
  dropPending,
  EMPTY_LEDGER,
  type FinishReason,
  finishRun,
  freshTokens,
  isBuilding,
  type KeepWhy,
  markStopping,
  moveNotices,
  patchRun,
  pauseText,
  recordOf,
  recordUsage,
  samePath,
  seated,
  type SpawnDecision,
  stoppedAnswer,
  stoppedStep,
  stopText,
  tddStepOf,
  withoutIsolation,
} from '../src/build'
import {
  CONFIG_PATH,
  configOf,
  configWrite,
  integrationBranchFor,
  parseConfig,
  patchConfig,
} from '../src/config'
import { driftDiffArgv, findDrift, retroSuggestions } from '../src/drift'
import { ENGINE_FLOOR, meetsFloor } from '../src/engine'
import { deriveFlow, type Flow, waitingForTriage } from '../src/evidence'
import {
  applyChange,
  applyDraftChange,
  bindSpec,
  draftKey,
  enteredRecord,
  type FeatureChange,
  featureOf,
  featurePath,
  FEATURES_DIR,
  isFeatureKey,
  mergeFeature,
  newDraft,
  parseDrafts,
  parseFeature,
  pickActive,
  promote,
  serialiseFeature,
  specKey,
  STORE_DRAFTS,
  STORE_LAST_ACTIVE,
} from '../src/features'
import {
  diffSummary,
  type FileWrite,
  GITIGNORE,
  isShared,
  isWritable,
  type WritableContext,
} from '../src/files'
import { checkRun, consumePass, dropText, issuePass, type RunRequest } from '../src/gates'
import {
  assembleGit,
  basesOf,
  diffLine,
  gitStep2,
  parseRemote,
  parseShortstat,
  parseWorktreeList,
  prunable,
  removalTargets,
  shortstatArgv,
  tipArgv,
  worktreeAddArgv,
  worktreeListArgv,
  worktreeRemoveArgv,
  type WorktreesView,
  worktreesView,
} from '../src/git'
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
import { glossaryView, type InboxAction, tabCounts, ticketsView } from '../src/pane-view'
import { namespaced, recognise } from '../src/phases'
import {
  hasSkill,
  INSTALL_ARGV,
  INSTALL_TIMEOUT_MS,
  installOutcome,
  LIST_ARGV,
  pluginLine,
  pluginStatus,
  PROBE_TIMEOUT_MS,
  UPDATE_ARGV,
} from '../src/plugin'
import { type BandActions, type FeatureChoice, renderBand, spinFrameOf } from '../src/rail'
import { linkTerms, Reply, termKeysIn } from '../src/reply'
import { planScratchImport, type ScratchFile, scratchSummary } from '../src/scratch'
import {
  checkText,
  type SettingsChange,
  type SettingsFacts,
  type SettingsRow,
} from '../src/sections'
import type { SettingsArgs } from '../src/settings'
import { diffSignals, signalBasis, TOAST_MS, toastText } from '../src/signals'
import { markdownSummary, statusLine } from '../src/summary'
import { SPIN_MS } from '../src/theme'
import { type Read, type ReadContext, type ReadResult, readTracker, TRACKERS } from '../src/tracker'
import type {
  AgentId,
  AgentRun,
  AgentSetup,
  EventNotice,
  FeatureKey,
  FeatureRecord,
  GitSnapshot,
  GlossaryDoc,
  InstallState,
  IsoTime,
  IssueRef,
  PaneTab,
  PhaseId,
  PluginStatus,
  RepoSnapshot,
  Running,
  SeatPlan,
  SkillName,
  TermDraft,
} from '../types'
import {
  loadPrefs,
  resetPrefs,
  resolvedPrefs,
  savePrefs,
  toneOf,
  uiFor,
  watchAppearance,
} from './shell/ui'

const PANE = 'craftory'

const COMMAND = 'craftory'

const REFRESH_DEBOUNCE_MS = 800

const TRACKER_TIMEOUT_MS = 20_000

const REMOVE_ANYWAY = 'Remove anyway'

const KEEP_IT = 'Keep it'

const RUN_ANYWAY = 'Run anyway'

const DIAGNOSE_FIRST = 'Diagnose first'

const DIAGNOSE_REASON =
  'The user chose to diagnose first, so code-review does not run yet. Tell them what is failing in Build and run the mattpocock-skills:diagnosing-bugs skill on it.'

const keptReason = (path: string, why: KeepWhy) =>
  `Craftory keeps ${path}: ${why === 'running' ? 'an agent is still working in it' : `its agent ${why === 'failed' ? 'failed' : why === 'over-budget' ? 'ran out of token budget' : 'was stopped'}, and the user decides what happens to its work`}. Do not remove it. Clean up the other worktrees and leave this one.`

const repoState = atom({ plugin: 'craftory', key: 'repo' } as const, null)

const featuresState = atom({ plugin: 'craftory', key: 'features' } as const, {})

const draftsState = atom({ plugin: 'craftory', key: 'drafts' } as const, {})

const activeState = atom({ plugin: 'craftory', key: 'active' } as const, null)

const pluginState = atom({ plugin: 'craftory', key: 'plugin' } as const, { kind: 'checking' })

const installState = atom({ plugin: 'craftory', key: 'install' } as const, { kind: 'idle' })

const dismissedState = atom({ plugin: 'craftory', key: 'dismissed' } as const, [])

let spinner: Timer | undefined

let refreshTimer: Timer | undefined

const paneTabState = atom({ plugin: 'craftory', key: 'paneTab' } as const, 'flow')

const setupNoteState = atom({ plugin: 'craftory', key: 'setupNote' } as const, null)

const trackerState = atom({ plugin: 'craftory', key: 'tracker' } as const, null)

const runningState = atom({ plugin: 'craftory', key: 'running' } as const, null)

const passesState = atom({ plugin: 'craftory', key: 'passes' } as const, [])

const noticesState = atom({ plugin: 'craftory', key: 'notices' } as const, [])

const signalsState = atom({ plugin: 'craftory', key: 'signals' } as const, null)

const buildState = atom({ plugin: 'craftory', key: 'build' } as const, EMPTY_LEDGER)

const gitState = atom({ plugin: 'craftory', key: 'git' } as const, null)

const diffsState = atom({ plugin: 'craftory', key: 'diffs' } as const, {})

const steeringNoteState = atom({ plugin: 'craftory', key: 'steeringNote' } as const, null)

const openStepState = atom({ plugin: 'craftory', key: 'openStep' } as const, null)

const isPickingFeatureState = atom({ plugin: 'craftory', key: 'isPickingFeature' } as const, false)

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

const glossaryQueryState = atom({ plugin: 'craftory', key: 'glossaryQuery' } as const, '')

const lastReplyTermsState = atom({ plugin: 'craftory', key: 'lastReplyTerms' } as const, [])

const glossaryAtStartState = atom({ plugin: 'craftory', key: 'glossaryAtStart' } as const, null)

const readText = ($: EngineInterface, path: string): Promise<string | null> =>
  $.fs.read(path).catch(() => null)

const exists = ($: EngineInterface, path: string): Promise<boolean> =>
  $.fs.exists(path).catch(() => false)

/** `git remote get-url origin`; the desktop and mobile surfaces run no commands, so null there. */
const remoteUrl = ($: EngineInterface): Promise<string | null> =>
  $.process
    .run(['git', 'remote', 'get-url', 'origin'], { timeoutMs: PROBE_TIMEOUT_MS })
    .then(r => (r.exitCode === 0 ? r.stdout.trim() : null))
    .catch(() => null)

async function readSetupFiles($: EngineInterface): Promise<SetupFiles> {
  const [tracker, triage, domain, claudeMd, agentsMd, gitignore] = await Promise.all([
    readText($, AGENT_DOCS.tracker),
    readText($, AGENT_DOCS.triage),
    readText($, AGENT_DOCS.domain),
    readText($, 'CLAUDE.md'),
    readText($, 'AGENTS.md'),
    readText($, GITIGNORE),
  ])
  return { tracker, triage, domain, claudeMd, agentsMd, gitignore }
}

async function loadRepo($: EngineInterface) {
  const [configText, files] = await Promise.all([readText($, CONFIG_PATH), readSetupFiles($)])
  const config = parseConfig(configText)
  const setup = readSetup(files)
  const glossaryPath = setup.state === 'ok' ? setup.value.docs.glossary : DEFAULT_DOCS.glossary
  const [glossaryText, hasContextMd, hasScratch, url, at] = await Promise.all([
    readText($, glossaryPath),
    exists($, 'CONTEXT.md'),
    exists($, '.scratch'),
    remoteUrl($),
    $.clock.now(),
  ])
  const file = steeringOf(files)
  const steering = file === 'CLAUDE.md' ? files.claudeMd : files.agentsMd
  const worktrees = configOf(config).worktrees.folder
  const snapshot: RepoSnapshot = {
    config,
    setup,
    glossary: parseGlossary(glossaryText),
    steering: { file, hasBlock: steering !== null && /^## Agent skills\s*$/m.test(steering) },
    remoteHost: remoteHostOf(url),
    hasContextMd,
    hasScratch,
    hasGitignoreEntry:
      files.gitignore !== null && ensureGitignore(files.gitignore, worktrees) === files.gitignore,
    at,
  }
  await update($, repoState, () => snapshot)
}

async function loadFeatures($: EngineInterface) {
  const entries = await $.fs.list(FEATURES_DIR).catch(() => [])
  const records = await Promise.all(
    entries
      .filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
      .map(async entry => parseFeature((await readText($, `${FEATURES_DIR}${entry.name}`)) ?? '')),
  )
  const features: Record<string, FeatureRecord> = {}
  for (const loaded of records)
    if (loaded.state === 'ok') features[loaded.value.spec] = loaded.value
  const drafts = parseDrafts(await $.store.get(STORE_DRAFTS))
  const last = await $.store.get(STORE_LAST_ACTIVE)
  await update($, featuresState, () => features)
  await update($, draftsState, () => drafts)
  await update($, activeState, () =>
    pickActive({ features, drafts, git: null, lastActive: isFeatureKey(last) ? last : null }),
  )
}

async function detectPlugin($: EngineInterface) {
  const commands = await $.command.list().catch(() => [])
  const listJson = await $.process
    .run(LIST_ARGV, { timeoutMs: PROBE_TIMEOUT_MS })
    .then(r => (r.exitCode === 0 ? r.stdout : null))
    .catch(() => null)
  await update($, pluginState, () => pluginStatus({ commands, listJson }))
}

async function installPlugin($: EngineInterface, argv: readonly string[]) {
  const setInstall = (state: InstallState) => update($, installState, () => state)
  await setInstall({ kind: 'installing', startedAt: await $.clock.now() })
  $.ui.invalidate('ui.render')
  const result = await $.process
    .run(argv, { timeoutMs: INSTALL_TIMEOUT_MS })
    .catch(error => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  const outcome = installOutcome(result)
  await setInstall(outcome.ok ? { kind: 'restart' } : { kind: 'failed', message: outcome.message })
  await detectPlugin($)
  $.ui.invalidate('ui.render')
}

async function writableContext($: EngineInterface, steering?: WritableContext['steering']) {
  const repo = await read($, repoState)
  const config = configOf(repo?.config)
  return {
    steering: repo?.steering.file ?? steering ?? null,
    docs: repo?.setup.state === 'ok' ? repo.setup.value.docs : DEFAULT_DOCS,
    issuesFolder: config.tracker.local.folder,
  } satisfies WritableContext
}

type WriteResult = { ok: true } | { ok: false; reason: string }

/**
 * The only `$.fs.write` call. Refuses a path outside the allowlist (a programming error the
 * engine test catches) and, for files shared with other writers, a file that changed since the
 * write was planned.
 */
async function writeRepoFile(
  $: EngineInterface,
  op: FileWrite,
  ctx: WritableContext,
): Promise<WriteResult> {
  if (!isWritable(op.path, ctx))
    throw new Error(`craftory: ${op.path} is not a file Craftory writes`)
  if (isShared(op.path, ctx) && (await readText($, op.path)) !== op.before) {
    return { ok: false, reason: `${op.path} changed since it was planned` }
  }
  await $.fs.write(op.path, op.after)
  return { ok: true }
}

async function applyWrites($: EngineInterface, writes: readonly FileWrite[], ctx: WritableContext) {
  const wrote: string[] = []
  for (const op of writes) {
    if (op.after === op.before) continue
    const result = await writeRepoFile($, op, ctx)
    if (!result.ok) return { wrote, refused: result.reason }
    wrote.push(op.path)
  }
  return { wrote, refused: null }
}

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
    read($, repoState),
    read($, pluginState),
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
    read($, repoState),
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
    read($, repoState),
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
  if (!hasSkill(await read($, pluginState), 'setup-matt-pocock-skills'))
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
  const config = configOf((await read($, repoState))?.config)
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
  const config = configOf((await read($, repoState))?.config)
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

const isoOf = (ms: number): IsoTime => new Date(ms).toISOString()

async function currentFlow($: EngineInterface): Promise<Flow | null> {
  const [repo, features, drafts, active, tracker, running, build] = await Promise.all([
    read($, repoState),
    read($, featuresState),
    read($, draftsState),
    read($, activeState),
    read($, trackerState),
    read($, runningState),
    read($, buildState),
  ])
  const feature = featureOf(active, features, drafts)
  if (feature === null) return null
  return deriveFlow({ feature, config: configOf(repo?.config), tracker, running, build })
}

/** The tracker kind named in `docs/agents/issue-tracker.md`; Local until setup says otherwise. */
const trackerKindOf = (repo: RepoSnapshot | null) =>
  repo?.setup.state === 'ok' ? repo.setup.value.tracker.kind : 'local'

async function readContext($: EngineInterface, repo: RepoSnapshot): Promise<ReadContext> {
  const [features, active] = await Promise.all([read($, featuresState), read($, activeState)])
  const record = active?.startsWith('spec:') ? features[active.slice(5)] : undefined
  return {
    config: configOf(repo.config),
    labels: (repo.setup.state === 'ok' ? repo.setup.value.triage : null) ?? DEFAULT_LABELS,
    now: await $.clock.now(),
    focus: {
      specs: Object.values(features).map(f => f.spec),
      branch: record?.integrationBranch || null,
    },
    remoteWeb: (await read($, gitState))?.remote?.webUrl ?? null,
    ...(repo.setup.state === 'ok' &&
      repo.setup.value.tracker.kind === 'other' && {
        otherDescription: repo.setup.value.tracker.description,
      }),
  }
}

/** One executor for every tracker's reads: the filesystem for Local, `gh` for GitHub. */
const executeReads = ($: EngineInterface) => (reads: readonly Read[]) =>
  Promise.all(
    reads.map(async (item): Promise<ReadResult> => {
      switch (item.kind) {
        case 'list': {
          const entries = await $.fs.list(item.dir).catch(() => null)
          return {
            kind: 'list',
            entries:
              entries?.map(e => ({
                name: e.name,
                kind: e.kind === 'file' || e.kind === 'dir' ? e.kind : 'other',
                mtimeMs: e.mtimeMs,
              })) ?? null,
          }
        }
        case 'read':
          return { kind: 'read', text: await readText($, item.path) }
        case 'run': {
          const result = await $.process
            .run(item.argv, { timeoutMs: TRACKER_TIMEOUT_MS })
            .catch(() => ({ exitCode: 1, stdout: '' }))
          return { kind: 'run', argv: item.argv, exitCode: result.exitCode, stdout: result.stdout }
        }
        default: {
          const _exhaustive: never = item
          return _exhaustive
        }
      }
    }),
  )

async function refreshTracker($: EngineInterface) {
  const repo = await read($, repoState)
  if (repo === null) return
  const spec = TRACKERS[trackerKindOf(repo)]
  if (spec === undefined) return
  const snapshot = await readTracker(spec, await readContext($, repo), executeReads($))
  await update($, trackerState, () => snapshot)
  await bindDrafts($)
  await cleanupMerged($)
  await settle($)
}

/** Reads the tracker a moment after the last change, so a burst of tool calls costs one read. */
function scheduleRefresh($: EngineInterface) {
  refreshTimer?.cancel()
  refreshTimer = $.clock.after(REFRESH_DEBOUNCE_MS, () => void refreshTracker($))
}

/** A tool call that may have changed the tracker: a write under the issues folder, `gh`, `git push`. */
async function touchesTracker(
  $: EngineInterface,
  tool: { name: string; command?: string; path?: string },
) {
  const repo = await read($, repoState)
  const kind = trackerKindOf(repo)
  if (repo === null) return false
  return TRACKERS[kind]?.touches(await readContext($, repo), tool) === true
}

async function persistDrafts($: EngineInterface) {
  await $.store.set(STORE_DRAFTS, await read($, draftsState))
}

/** The one place a feature record is written: merged with what is on disk, so two sessions converge. */
async function saveFeature($: EngineInterface, record: FeatureRecord): Promise<FeatureRecord> {
  const path = featurePath(record.spec)
  const raw = await readText($, path)
  const disk = raw === null ? null : parseFeature(raw)
  const merged = mergeFeature(disk?.state === 'ok' ? disk.value : null, record)
  const after = serialiseFeature(merged)
  if (after !== raw) await writeRepoFile($, { path, before: raw, after }, await writableContext($))
  return merged
}

/** Applies one change to the active feature: a record is saved, a draft goes to the store. */
async function recordChange($: EngineInterface, key: FeatureKey, change: FeatureChange) {
  const feature = featureOf(key, await read($, featuresState), await read($, draftsState))
  if (feature === null) return
  if (feature.kind === 'draft') {
    const next = applyDraftChange(feature.draft, change)
    await update($, draftsState, held => ({ ...held, [next.draftId]: next }))
    await persistDrafts($)
    return
  }
  const saved = await saveFeature($, applyChange(feature.record, change))
  await update($, featuresState, held => ({ ...held, [saved.spec]: saved }))
}

/** A feature that starts from a command with none in flight is a draft until its spec exists. */
async function startDraft($: EngineInterface, phase: PhaseId): Promise<FeatureKey> {
  const now = await $.clock.now()
  const draft = newDraft({
    draftId: `d${now}`,
    title: 'New feature',
    entry: phase,
    enteredFrom: null,
    at: isoOf(now),
  })
  await update($, draftsState, held => ({ ...held, [draft.draftId]: draft }))
  await persistDrafts($)
  const key = draftKey(draft.draftId)
  await update($, activeState, () => key)
  return key
}

/** A draft whose spec now exists becomes a record on disk, and the active feature follows it. */
async function bindDrafts($: EngineInterface) {
  const [tracker, repo, drafts] = await Promise.all([
    read($, trackerState),
    read($, repoState),
    read($, draftsState),
  ])
  if (!tracker?.rich) return
  const bound = new Set(Object.keys(await read($, featuresState)))
  for (const draft of Object.values(drafts)) {
    const spec = bindSpec(draft, tracker, bound)
    if (spec === undefined) continue
    const config = configOf(repo?.config)
    const record = await saveFeature(
      $,
      promote(draft, spec, integrationBranchFor(config, spec.title)),
    )
    bound.add(spec.ref)
    await update($, featuresState, held => ({ ...held, [record.spec]: record }))
    await update($, draftsState, held =>
      Object.fromEntries(Object.entries(held).filter(([id]) => id !== draft.draftId)),
    )
    const from = draftKey(draft.draftId)
    await update($, activeState, key => (key === from ? specKey(record.spec) : key))
    await update($, runningState, run =>
      run?.feature === from ? { ...run, feature: specKey(record.spec) } : run,
    )
    await persistDrafts($)
  }
}

async function addNotice($: EngineInterface, notice: EventNotice) {
  await update($, noticesState, held => [...held.filter(n => n.id !== notice.id), notice])
}

/**
 * Everything that follows from a changed fact: the status line, the spinner, the toasts and the
 * redraw. The toast basis is first taken only once the tracker has been read, so a restart seeds
 * it and announces nothing that was already there.
 */
async function settle($: EngineInterface) {
  const flow = await currentFlow($)
  $.ui.status(statusLine(flow))
  const isRunning = flow?.steps.some(s => s.state.kind === 'running') === true
  if (isRunning && spinner === undefined) {
    spinner = $.clock.every(SPIN_MS, () => $.ui.invalidate('ui.render'))
  } else if (!isRunning && spinner !== undefined) {
    spinner.cancel()
    spinner = undefined
  }
  const held = await read($, noticesState)
  const stale = new Set(
    held.flatMap(n =>
      n.kind === 'gate' && flow?.steps.find(s => s.phase === n.phase)?.state.kind !== 'gated'
        ? [n.id]
        : [],
    ),
  )
  if (stale.size > 0) await update($, noticesState, list => list.filter(n => !stale.has(n.id)))
  const tracker = await read($, trackerState)
  if (tracker !== null) {
    const next = signalBasis({
      features: await read($, featuresState),
      drafts: await read($, draftsState),
      tracker,
      notices: await read($, noticesState),
    })
    const signals = diffSignals(await read($, signalsState), next)
    await update($, signalsState, () => next)
    for (const signal of signals) {
      $.ui.toast(toastText(signal), { timeoutMs: TOAST_MS })
      if (signal.kind === 'spec-published') {
        await addNotice($, {
          kind: 'spec-published',
          id: `spec-${signal.spec}`,
          spec: signal.spec,
          stories: signal.stories,
        })
      }
    }
  }
  $.ui.invalidate('ui.render')
}

/** A typed or pressed command as a gate sees it; undefined for anything that is not a Matt phase. */
function requestOf(name: string | undefined, args: string): RunRequest | undefined {
  const found = name === undefined ? undefined : recognise(name, { strict: false })
  return found?.kind === 'phase' ? { skill: found.skill, args, phase: found.phase } : undefined
}

/** The command a `prompt.submit` runs: the engine's parse, else the typed `/name args` line. */
function typedCommand(e: { text: string; command?: { name: string; args: string } }) {
  if (e.command !== undefined) return { name: e.command.name, args: e.command.args }
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(e.text.trim())
  return match ? { name: match[1]!, args: (match[2] ?? '').trim() } : undefined
}

async function holdForGate($: EngineInterface, req: RunRequest, flow: Flow | null) {
  const now = await $.clock.now()
  const verdict = checkRun(req, flow, await read($, passesState), now)
  if (verdict.kind === 'go') return undefined
  await addNotice($, {
    kind: 'gate',
    id: `gate-${verdict.phase}`,
    phase: verdict.phase,
    by: verdict.by,
    reason: verdict.reason,
    skill: req.skill,
    args: req.args,
  })
  await settle($)
  return verdict
}

/** A rail press or a notice button: the same gate as a typed command, then the namespaced command. */
async function requestRun($: EngineInterface, skill: SkillName, args: string) {
  const req = requestOf(skill, args) ?? { skill, args, phase: null }
  if (await holdForGate($, req, await currentFlow($))) return
  await update($, openStepState, () => null)
  await $.command.run({ command: namespaced(skill), args })
}

const GIT_MS = 15_000

const SETUP_MS = 600_000

const GIT_DEBOUNCE_MS = 1_500

/** The integration tip last announced to each agent, so a moved tip is told once. */
const told = new Map<string, string>()

let gitTimer: Timer | undefined

type Shell = { exitCode: number; stdout: string; stderr: string }

/** One command; null when it cannot start, which every caller treats as a failed command. */
const sh = (
  $: EngineInterface,
  argv: readonly string[],
  init?: { cwd?: string; timeoutMs?: number },
): Promise<Shell | null> => $.process.run(argv, { timeoutMs: GIT_MS, ...init }).catch(() => null)

async function activeRecord($: EngineInterface): Promise<FeatureRecord | null> {
  const feature = featureOf(
    await read($, activeState),
    await read($, featuresState),
    await read($, draftsState),
  )
  return feature?.kind === 'specced' ? feature.record : null
}

/** The feature a ticket belongs to: its spec is the ticket's parent in the tracker. */
async function featureOfTicket($: EngineInterface, ticket: string): Promise<FeatureRecord | null> {
  const tracker = await read($, trackerState)
  const parent = tracker?.rich ? tracker.issues.find(i => i.ref === ticket)?.parent : null
  return parent ? ((await read($, featuresState))[parent] ?? null) : null
}

async function persistRun($: EngineInterface, run: AgentRun) {
  const record = (await featureOfTicket($, run.ticket)) ?? (await activeRecord($))
  if (record !== null)
    await recordChange($, specKey(record.spec), { kind: 'agent', record: recordOf(run) })
}

type Seat = { ok: true; isFresh: boolean; path: string } | { ok: false; reason: string }

/**
 * Makes the worktree an implementer will work in: `git worktree add -b <branch> <path> <base>`,
 * the files to copy, then the setup command in it. A worktree that is already there (a retry of
 * a kept one) is reused as it is.
 */
async function seatWorktree($: EngineInterface, plan: SeatPlan): Promise<Seat> {
  const root = await $.session.cwd()
  const path = `${root}/${plan.path}`
  const listed = await sh($, worktreeListArgv)
  if (listed === null || listed.exitCode !== 0) return { ok: false, reason: 'git is not available' }
  if (parseWorktreeList(listed.stdout).some(w => samePath(w.path, plan.path)))
    return { ok: true, isFresh: false, path }
  const hasBranch = (await sh($, tipArgv(plan.branch)))?.exitCode === 0
  const added = await sh($, worktreeAddArgv(plan.branch, plan.path, plan.base, hasBranch))
  if (added === null || added.exitCode !== 0)
    return { ok: false, reason: added?.stderr.trim() || 'git worktree add failed' }
  for (const file of plan.copy) {
    if (await exists($, file)) await sh($, ['cp', '--', file, `${plan.path}/${file}`])
  }
  if (plan.setup !== null) {
    const setup = await sh($, plan.setup, { cwd: path, timeoutMs: SETUP_MS })
    if (setup === null || setup.exitCode !== 0)
      $.ui.toast(`Setup failed in ${plan.path} · the agent starts anyway`)
  }
  return { ok: true, isFresh: true, path }
}

async function refreshGit($: EngineInterface) {
  const [repo, features, tracker, ledger] = await Promise.all([
    read($, repoState),
    read($, featuresState),
    read($, trackerState),
    read($, buildState),
  ])
  const config = configOf(repo?.config)
  const listed = await sh($, worktreeListArgv)
  if (listed === null || listed.exitCode !== 0) return
  const entries = parseWorktreeList(listed.stdout)
  const main = entries[0]
  if (main === undefined) return
  const records = Object.values(features)
  const integrationBranches = [...new Set(records.map(r => r.integrationBranch).filter(Boolean))]
  const runs = new Map<string, string>()
  for (const run of Object.values(ledger.runs)) {
    const parent = tracker?.rich ? tracker.issues.find(i => i.ref === run.ticket)?.parent : null
    const integration = parent ? features[parent]?.integrationBranch : undefined
    if (integration) runs.set(run.branch, integration)
  }
  const bases = basesOf({
    entries,
    main: main.branch,
    records,
    runs,
    ticketBranch: config.worktrees.ticketBranch,
  })
  const asked = gitStep2({ entries, bases, integrationBranches })
  const answers = await Promise.all(asked.map(argv => sh($, argv)))
  const results = new Map<string, string>()
  asked.forEach((argv, i) => {
    const answer = answers[i]
    if (answer?.exitCode === 0) results.set(argv.join(' '), answer.stdout)
  })
  const live = Object.values(ledger.runs).filter(r => r.status === 'running')
  const snapshot = assembleGit({
    root: main.path,
    branch: main.branch,
    remote: parseRemote(await remoteUrl($)),
    entries,
    bases,
    results,
    config: configOf(repo?.config),
    integrationBranches,
    runningPaths: new Set(
      entries.filter(e => live.some(r => samePath(e.path, r.worktree))).map(e => e.path),
    ),
    now: await $.clock.now(),
  })
  await update($, gitState, () => snapshot)
  await afterGit($, snapshot, config.worktrees.rebaseOnMove)
  $.ui.invalidate('ui.render')
}

/** What a new look at git asks of the running agents: merge the moved tip, or stop on a conflict. */
async function afterGit($: EngineInterface, snapshot: GitSnapshot, rebaseOnMove: boolean) {
  const ledger = await read($, buildState)
  for (const run of Object.values(ledger.runs)) {
    if (run.status !== 'running' || run.isStopping) continue
    const w = snapshot.worktrees.find(x => samePath(x.path, run.worktree))
    if (w?.isRebasing) {
      await update($, buildState, held => markStopping(held, run.agentId))
      await $.session.send({ to: { agentId: run.agentId }, text: conflictText(run.ticket) })
      await addNotice($, {
        kind: 'rebase-conflict',
        id: `conflict-${run.ticket}`,
        ticket: run.ticket,
        worktree: run.worktree,
      })
      await settle($)
      continue
    }
    if (!rebaseOnMove) continue
    const integration = (await featureOfTicket($, run.ticket))?.integrationBranch
    const tip = integration === undefined ? undefined : snapshot.tips[integration]
    if (integration === undefined || !tip || told.get(run.agentId) === tip) continue
    const [note] = moveNotices(
      { ...ledger, runs: { [run.agentId]: run } },
      snapshot.worktrees,
      integration,
    )
    if (note === undefined) continue
    told.set(run.agentId, tip)
    await $.session.send({ to: { agentId: note.agentId }, text: note.text })
  }
}

/** Reads git a moment after the last git command an agent ran, so a burst costs one read. */
function scheduleGit($: EngineInterface) {
  gitTimer?.cancel()
  gitTimer = $.clock.after(GIT_DEBOUNCE_MS, () => void refreshGit($))
}

async function cleanupInputs($: EngineInterface) {
  const [repo, features, tracker, ledger, git] = await Promise.all([
    read($, repoState),
    read($, featuresState),
    read($, trackerState),
    read($, buildState),
    read($, gitState),
  ])
  const merged = new Set(
    tracker?.rich
      ? tracker.issues
          .filter(i => i.status === 'done' || i.status === 'closed')
          .map(i => i.ref as string)
      : [],
  )
  const plan = cleanupPlan({
    records: Object.values(features).flatMap(f => Object.values(f.agents)),
    merged,
    config: configOf(repo?.config),
    running: new Set(
      Object.values(ledger.runs)
        .filter(r => r.status === 'running')
        .map(r => r.worktree),
    ),
  })
  return { plan, git }
}

/** Removes the worktrees of merged tickets (removeAfterMerge). A dirty one refuses, which is right. */
async function cleanupMerged($: EngineInterface) {
  const { plan, git } = await cleanupInputs($)
  if (git === null) return
  const gone = plan.remove.filter(p => git.worktrees.some(w => samePath(w.path, p)))
  for (const path of gone) await sh($, worktreeRemoveArgv(path))
  if (gone.length > 0) await refreshGit($)
}

/** Worktrees a `git worktree remove` must not touch: running, failed, over-budget or stopped ones. */
async function keptWorktrees($: EngineInterface): Promise<{ path: string; why: KeepWhy }[]> {
  const { plan } = await cleanupInputs($)
  return plan.keep.filter(k => k.why !== 'unmerged')
}

async function countStep(
  $: EngineInterface,
  agentId: AgentId,
  result: {
    answer: string
    usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
    } | null
  },
) {
  const at = await $.clock.now()
  const tdd = tddStepOf(result.answer)
  const seen: { crossed: 'near' | 'over' | null; run: AgentRun | null } = {
    crossed: null,
    run: null,
  }
  await update($, buildState, ledger => {
    const used = recordUsage(
      ledger,
      agentId,
      result.usage === null ? 0 : freshTokens(result.usage),
      at,
    )
    seen.crossed = used.crossed
    seen.run = used.run
    return tdd === null ? used.ledger : patchRun(used.ledger, agentId, { tddStep: tdd })
  })
  const { crossed, run } = seen
  if (run === null) return
  if (crossed === null) return $.ui.invalidate('ui.render')
  if (crossed === 'over') {
    await $.session.send({ to: { agentId }, text: stopText(run.ticket, run.budget) })
    await addNotice($, {
      kind: 'budget',
      id: `budget-${run.ticket}`,
      ticket: run.ticket,
      budget: run.budget,
    })
  }
  await persistRun($, run)
  await settle($)
}

/** The Worktrees tab: every worktree git lists, with what Craftory knows about it. */
async function worktreesViewOf($: EngineInterface): Promise<WorktreesView | null> {
  const [git, features, repo, diffs] = await Promise.all([
    read($, gitState),
    read($, featuresState),
    read($, repoState),
    read($, diffsState),
  ])
  if (git === null) return null
  const config = configOf(repo?.config)
  const records = Object.values(features)
  return worktreesView({
    git,
    records,
    bases: basesOf({
      entries: git.worktrees.map(w => ({
        path: w.path,
        branch: w.branch,
        isMain: w.role === 'checkout',
      })),
      main: git.branch,
      records,
      runs: new Map(),
      ticketBranch: config.worktrees.ticketBranch,
    }),
    kept: await keptWorktrees($),
    diffs,
    folder: config.worktrees.folder,
    now: await $.clock.now(),
  })
}

/** Diff toggles the shortstat line under a row. */
async function toggleDiff($: EngineInterface, path: string) {
  const view = await worktreesViewOf($)
  const row = view?.rows.find(r => r.path === path)
  if (row === undefined) return
  if (row.diff !== null) {
    await update($, diffsState, held =>
      Object.fromEntries(Object.entries(held).filter(([p]) => p !== path)),
    )
    return $.ui.invalidate('ui.render')
  }
  const git = await read($, gitState)
  const base = git === null ? undefined : (await currentBases($, git))[path]
  const result =
    base === undefined || row.branch === null ? null : await sh($, shortstatArgv(base, row.branch))
  const line =
    result?.exitCode === 0 ? diffLine(parseShortstat(result.stdout)) : 'could not read the diff'
  await update($, diffsState, held => ({ ...held, [path]: line }))
  $.ui.invalidate('ui.render')
}

async function currentBases($: EngineInterface, git: GitSnapshot) {
  const [features, repo] = await Promise.all([read($, featuresState), read($, repoState)])
  return basesOf({
    entries: git.worktrees.map(w => ({
      path: w.path,
      branch: w.branch,
      isMain: w.role === 'checkout',
    })),
    main: git.branch,
    records: Object.values(features),
    runs: new Map(),
    ticketBranch: configOf(repo?.config).worktrees.ticketBranch,
  })
}

/** A mod cannot open a terminal, so the row copies `cd <path>` for the user to paste. */
async function copyTerminal($: EngineInterface, path: string, surface: RenderSurface) {
  const copied = await $.ui.copy({ text: `cd ${path}`, surface }).catch(() => ({ isCopied: false }))
  $.ui.toast(
    copied.isCopied
      ? `Copied cd ${path} · paste it in a terminal`
      : `Could not copy · run cd ${path} in a terminal`,
  )
}

/** Remove refuses a running or kept worktree unless the user confirms; only then is it forced. */
async function removeWorktree($: EngineInterface, path: string) {
  const row = (await worktreesViewOf($))?.rows.find(r => r.path === path)
  if (row === undefined || !row.canRemove) return
  if (row.isProtected) {
    const answer = await $.ui
      .ask(`Remove ${row.shown}? Its agent is running or its work is kept. Remove anyway?`, [
        REMOVE_ANYWAY,
        KEEP_IT,
      ])
      .catch(() => KEEP_IT)
    if (answer !== REMOVE_ANYWAY) return
  }
  const result = await sh($, worktreeRemoveArgv(path, row.isProtected))
  $.ui.toast(
    result?.exitCode === 0
      ? `Removed ${row.shown}`
      : `Could not remove ${row.shown}: ${result?.stderr.trim() || 'git did not run'}`,
  )
  await refreshGit($)
}

/** Prune N stale: the stale worktrees Craftory does not keep, removed without force. */
async function pruneStale($: EngineInterface) {
  const git = await read($, gitState)
  if (git === null) return
  const stale = prunable(
    git,
    (await keptWorktrees($)).map(k => k.path),
  )
  let removed = 0
  for (const w of stale) if ((await sh($, worktreeRemoveArgv(w.path)))?.exitCode === 0) removed++
  if (stale.length > 0) $.ui.toast(`Pruned ${removed} of ${stale.length} stale worktrees`)
  await refreshGit($)
}

/** Pause all stops new implementers and asks the running ones to report after their step; again resumes. */
async function togglePause($: EngineInterface) {
  const isPausing = !(await read($, buildState)).isPaused
  await update($, buildState, ledger => ({ ...ledger, isPaused: isPausing }))
  if (isPausing) {
    const ledger = await read($, buildState)
    for (const run of Object.values(ledger.runs))
      if (run.status === 'running')
        await $.session.send({ to: { agentId: run.agentId }, text: pauseText })
  } else {
    $.ui.toast('Build resumed · ask Claude to start the queued tickets')
  }
  await settle($)
}

/** The Agents list for the Build card, from the ledger, the stored records and the last look at git. */
async function agentsViewOf($: EngineInterface, flow: Flow | null): Promise<AgentsView | null> {
  const [repo, ledger, git, note] = await Promise.all([
    read($, repoState),
    read($, buildState),
    read($, gitState),
    read($, steeringNoteState),
  ])
  const config = configOf(repo?.config)
  if (flow === null || !config.automation.liveAgents || flow.tickets.length === 0) return null
  const build = flow.steps.find(s => s.phase === 'build')?.state.kind
  // Before any agent exists the list would only repeat the tickets.
  if (build === 'todo' || build === 'next' || build === 'gated' || build === 'skipped') return null
  const record = flow.feature.kind === 'specced' ? flow.feature.record : null
  const rows = agentRows({
    tickets: flow.tickets,
    ledger,
    records: record?.agents ?? {},
    worktrees: git?.worktrees ?? [],
    config,
    integrationBranch: record?.integrationBranch ?? '',
    now: await $.clock.now(),
  })
  return agentsView({ rows, config, isPaused: ledger.isPaused, note })
}

/** One more `tokenBudget` step for a ticket, stored in the feature record so a restart keeps it. */
async function raiseBudget($: EngineInterface, ticket: IssueRef) {
  const record = await featureOfTicket($, ticket)
  const old = record?.agents[ticket]
  if (record === null || old === undefined) return
  const step = configOf((await read($, repoState))?.config).worktrees.tokenBudget
  const budget = old.budget + step
  await recordChange($, specKey(record.spec), { kind: 'agent', record: { ...old, budget } })
  await update($, buildState, ledger => ({
    ...ledger,
    runs: Object.fromEntries(
      Object.entries(ledger.runs).map(([id, run]) => [
        id,
        run.ticket === ticket && run.status === 'running'
          ? { ...run, budget, budgetState: budgetState(run.tokens, budget) }
          : run,
      ]),
    ),
  }))
  $.ui.toast(`Budget for ${ticket} raised to ${budgetK(budget)} · run it again to continue`)
}

async function finishAgent($: EngineInterface, agentId: AgentId, reason: FinishReason) {
  const paused = (await read($, buildState)).isPaused
  const at = await $.clock.now()
  const done: { run: AgentRun | null } = { run: null }
  await update($, buildState, ledger => {
    const finished = finishRun(
      ledger,
      agentId,
      paused && reason === 'answer' ? 'aborted' : reason,
      at,
    )
    done.run = finished.run
    return finished.ledger
  })
  if (done.run === null) return
  await persistRun($, done.run)
  await refreshGit($)
  await refreshTracker($)
}

async function openPane($: EngineInterface, tab: PaneTab) {
  await update($, paneTabState, () => tab)
  if (tab === 'worktrees') await refreshGit($)
  await $.ui.open({ id: PANE, title: 'Craftory', focus: true, closeOnEscape: true })
}

async function noticeOf($: EngineInterface, id: string) {
  return (await read($, noticesState)).find(n => n.id === id)
}

async function dropNotice($: EngineInterface, id: string) {
  await update($, noticesState, held => held.filter(n => n.id !== id))
  await settle($)
}

async function onNotice($: EngineInterface, action: NoticeAction) {
  switch (action.kind) {
    case 'install':
      return installPlugin($, INSTALL_ARGV)
    case 'update':
      return installPlugin($, UPDATE_ARGV)
    case 'not-now':
      await update($, dismissedState, held => [...held.filter(k => k !== action.key), action.key])
      $.ui.invalidate('ui.render')
      return
    case 'setup':
      await openPane($, 'settings')
      return
    case 'run':
      return requestRun($, action.skill, action.args)
    case 'run-anyway': {
      const notice = await noticeOf($, action.id)
      if (notice?.kind !== 'gate') return
      const req = { skill: notice.skill, args: notice.args, phase: notice.phase }
      const now = await $.clock.now()
      await update($, passesState, held => issuePass(held, req, now))
      await dropNotice($, notice.id)
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

async function glossaryTerms($: EngineInterface) {
  const repo = await read($, repoState)
  return repo?.glossary.state === 'ok' ? termsOf(repo.glossary.value) : []
}

async function glossaryViewOf($: EngineInterface) {
  const repo = await read($, repoState)
  return glossaryView({
    doc: repo?.glossary,
    path: repo?.setup.state === 'ok' ? repo.setup.value.docs.glossary : DEFAULT_DOCS.glossary,
    query: await read($, glossaryQueryState),
    used: await read($, lastReplyTermsState),
    atStart: await read($, glossaryAtStartState),
  })
}

async function ticketsViewOf($: EngineInterface, flow: Flow | null) {
  const [repo, tracker, features] = await Promise.all([
    read($, repoState),
    read($, trackerState),
    read($, featuresState),
  ])
  const spec = TRACKERS[trackerKindOf(repo)]
  return ticketsView({
    flow,
    tracker,
    config: configOf(repo?.config),
    header:
      repo === null || spec === undefined ? 'Tracker' : spec.header(await readContext($, repo)),
    featureSpecs: new Set(Object.keys(features)),
  })
}

/** Start feature on a ready-for-agent issue: it enters at `phase` and the earlier phases are skipped. */
async function startFromIssue($: EngineInterface, action: Extract<InboxAction, { kind: 'start' }>) {
  const tracker = await read($, trackerState)
  const issue = tracker?.rich ? tracker.issues.find(i => i.ref === action.ref) : undefined
  if (issue === undefined) return
  const repo = await read($, repoState)
  const config = configOf(repo?.config)
  const now = await $.clock.now()
  if (action.phase === 'align') {
    const draft = newDraft({
      draftId: `d${now}`,
      title: issue.title,
      entry: 'align',
      enteredFrom: issue.ref,
      at: isoOf(now),
    })
    await update($, draftsState, held => ({ ...held, [draft.draftId]: draft }))
    await persistDrafts($)
    await update($, activeState, () => draftKey(draft.draftId))
  } else {
    const record = await saveFeature(
      $,
      enteredRecord({
        issue,
        phase: action.phase,
        integrationBranch: integrationBranchFor(config, issue.title),
      }),
    )
    await update($, featuresState, held => ({ ...held, [record.spec]: record }))
    await update($, activeState, () => specKey(record.spec))
    await $.store.set(STORE_LAST_ACTIVE, specKey(record.spec))
  }
  await settle($)
  const step = (await currentFlow($))?.steps.find(s => s.phase === action.phase)
  if (step?.command)
    await requestRun($, step.command, action.phase === 'align' ? issue.ref : step.args)
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
    read($, repoState),
    read($, pluginState),
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
      (await read($, paneTabState)) === 'settings'
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

/**
 * The avoid-words of the glossary, found in what the integration branch adds over its base.
 * Run when Review starts and before Ship; each finding becomes a notice and, once, a toast.
 */
async function scanDrift($: EngineInterface) {
  const [git, record, terms, repo] = await Promise.all([
    read($, gitState),
    activeRecord($),
    glossaryTerms($),
    read($, repoState),
  ])
  const integration = record?.integrationBranch
  const base = git?.branch
  if (!integration || !base || integration === base || !terms.some(t => t.avoid.length > 0)) return
  const diff = await sh($, driftDiffArgv(base, integration))
  if (diff === null || diff.exitCode !== 0) return
  const glossary =
    repo?.setup.state === 'ok' ? repo.setup.value.docs.glossary : DEFAULT_DOCS.glossary
  for (const f of findDrift(diff.stdout, terms, [glossary, 'CONTEXT.md']).slice(0, 3))
    await addNotice($, {
      kind: 'drift',
      id: `drift-${termKey(f.term)}-${termKey(f.avoided)}`,
      avoided: f.avoided,
      term: f.term,
      count: f.count,
    })
  await settle($)
}

const isSupported = async ($: EngineInterface) => meetsFloor((await $.session.version()).base)

const drawsAnything = async ($: EngineInterface) =>
  (await isSupported($)) && (await $.session.surfaces()).length > 0

async function featureChoices($: EngineInterface): Promise<FeatureChoice[]> {
  const [features, drafts, active] = await Promise.all([
    read($, featuresState),
    read($, draftsState),
    read($, activeState),
  ])
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

async function pressStep($: EngineInterface, step: PhaseId | 'triage', fitsCard: boolean) {
  if (!fitsCard) return openPane($, 'flow')
  await update($, openStepState, open => (open === step ? null : step))
  $.ui.invalidate('ui.render')
}

async function runFromCard($: EngineInterface, phase: PhaseId | 'triage') {
  if (phase === 'triage') return requestRun($, 'triage' as SkillName, '')
  const step = (await currentFlow($))?.steps.find(s => s.phase === phase)
  if (step?.command) await requestRun($, step.command, step.args)
}

const bandActions = ($: EngineInterface): BandActions => ({
  step: (phase, fitsCard) => void pressStep($, phase, fitsCard),
  triage: fitsCard => void pressStep($, 'triage', fitsCard),
  summary: () => void openPane($, 'flow'),
  gear: () => void openPane($, 'settings'),
  run: phase => void runFromCard($, phase),
  openTickets: () => void openPane($, 'tickets'),
  closeCard: () => {
    void update($, openStepState, () => null).then(() => $.ui.invalidate('ui.render'))
  },
  pickFeature: () => {
    void update($, isPickingFeatureState, picking => !picking).then(() =>
      $.ui.invalidate('ui.render'),
    )
  },
  switchFeature: key => {
    void (async () => {
      await update($, activeState, () => key)
      await update($, isPickingFeatureState, () => false)
      await update($, openStepState, () => null)
      await $.store.set(STORE_LAST_ACTIVE, key)
      await settle($)
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
    const atStart = (await glossaryTerms($)).map(t => termKey(t.name))
    await update($, glossaryAtStartState, () => atStart)
    await refreshTracker($)
    await refreshGit($)
    if (configOf((await read($, repoState))?.config).worktrees.pruneStale) await pruneStale($)
    await settle($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    if (!(await drawsAnything($))) {
      return {
        text: markdownSummary(await currentFlow($), await read($, pluginState)),
      }
    }
    await openPane($, 'flow')
    return { text: 'Opened the Craftory pane.' }
  })

  on('skill.prompt', async ($, e, next) => {
    const found = recognise(e.skill)
    if (found?.kind === 'phase' || found?.kind === 'entry') {
      const now = await $.clock.now()
      const phase = found.kind === 'phase' ? found.phase : null
      let key = await read($, activeState)
      if (key === null && (phase === 'align' || phase === 'spec')) key = await startDraft($, phase)
      await update($, runningState, (): Running => ({
        phase,
        entry: found.kind === 'entry' ? found.entry : null,
        skill: found.skill,
        args: '',
        feature: key,
        startedAt: now,
        isAwaitingUser: false,
        progress: null,
      }))
      if (key !== null && phase !== null)
        await recordChange($, key, { kind: 'ran', phase, at: isoOf(now) })
      await settle($)
      if (phase === 'review' || phase === 'ship') await scanDrift($)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const typed = typedCommand(e)
    const req = typed && requestOf(typed.name, typed.args)
    if (req) {
      const verdict = await holdForGate($, req, await currentFlow($))
      if (verdict) return { drop: dropText(verdict) }
      const now = await $.clock.now()
      await update($, passesState, held => consumePass(held, req, now))
    } else if (typed === undefined) {
      const running = await read($, runningState)
      if (running?.isAwaitingUser) {
        await update($, runningState, held => held && { ...held, isAwaitingUser: false })
        await settle($)
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      await finishAgent($, e.agentId as AgentId, e.reason)
      return result
    }
    const terms = await glossaryTerms($)
    await update($, lastReplyTermsState, () => termKeysIn(e.answer, terms))
    const running = await read($, runningState)
    if (running !== null && !running.isAwaitingUser) {
      const grillAsksNext = running.phase === 'align' && !e.isAborted
      if (grillAsksNext) {
        await update($, runningState, held => held && { ...held, isAwaitingUser: true })
      } else {
        await update($, runningState, () => null)
        if (running.feature !== null && running.phase !== null) {
          await recordChange($, running.feature, {
            kind: 'ended',
            phase: running.phase,
            at: isoOf(await $.clock.now()),
          })
        }
        if (running.phase === 'retro' && !e.isAborted) {
          await addNotice($, {
            kind: 'retro-ready',
            id: `retro-${await $.clock.now()}`,
            suggestions: retroSuggestions(e.answer),
          })
        }
      }
    }
    await refreshTracker($)
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
      const ledger = await read($, buildState)
      if (Object.keys(ledger.runs).length > 0) scheduleGit($)
    }
    return result
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const [flow, repo, record] = await Promise.all([
      currentFlow($),
      read($, repoState),
      activeRecord($),
    ])
    if (flow === null || record === null) return next(e)
    const at = await $.clock.now()
    const decided: { value: SpawnDecision } = { value: { kind: 'pass' } }
    await update($, buildState, ledger => {
      const decision = decideSpawn({
        call: {
          toolUseId: e.tool_use_id,
          description: e.description,
          prompt: e.prompt,
          ...(e.name !== undefined && { name: e.name }),
          ...(e.isolation !== undefined && { isolation: e.isolation }),
        },
        ledger,
        config: configOf(repo?.config),
        isBuildRunning: isBuilding(flow),
        tickets: flow.tickets,
        integrationBranch: record.integrationBranch,
      })
      decided.value = decision
      if (decision.kind === 'steer') return addPending(ledger, e.tool_use_id, decision.plan, at)
      if (decision.kind === 'deny' && decision.isQueued) return addQueued(ledger, decision.ticket)
      return ledger
    })
    const decision = decided.value
    if (decision.kind === 'pass') return next(e)
    if (decision.kind === 'deny') {
      await settle($)
      return { deny: decision.reason }
    }
    // On success the spawn already moved the seat to a run; only a refused or failed call is forgotten.
    const forget = () => update($, buildState, ledger => dropPending(ledger, e.tool_use_id))
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
    const seat = (await read($, buildState)).pending[e.tool_use_id]
    if (seat === undefined) return next(e)
    const { plan } = seat
    const placed = await seatWorktree($, plan)
    if (!placed.ok) {
      const note = `Craftory could not make ${plan.path}: ${placed.reason}`
      await update($, steeringNoteState, () => note)
      await settle($)
      return {
        deny: `${note}. Do not start ${plan.ticket} until that is fixed; tell the user what git said.`,
      }
    }
    await update($, steeringNoteState, () => null)
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
    const repo = await read($, repoState)
    const old = (await featureOfTicket($, plan.ticket))?.agents[plan.ticket]
    const budget = budgetFor(configOf(repo?.config), old)
    const at = await $.clock.now()
    const agentId = result.agentId as AgentId
    await update($, buildState, ledger => seated(ledger, e.tool_use_id, agentId, budget, at))
    const run = (await read($, buildState)).runs[agentId]
    if (run !== undefined) await persistRun($, run)
    await refreshGit($)
    await settle($)
    return result
  })

  // Yielding a text chunk and returning without `next` sends no request and ends the subagent at
  // once; its Agent call then returns that text. This is the hard stop at the budget.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId as AgentId | undefined
    const run = agentId === undefined ? undefined : (await read($, buildState)).runs[agentId]
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
    const verdict = checkRun(
      req,
      await currentFlow($),
      await read($, passesState),
      await $.clock.now(),
    )
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
    const [repo, plugin, flow] = await Promise.all([
      read($, repoState),
      read($, pluginState),
      currentFlow($),
    ])
    const derived = derivedNotices({
      plugin,
      install: await read($, installState),
      repo,
      hasFeature: flow !== null,
      firstRunText: firstRunText({
        remoteHost: repo?.remoteHost ?? null,
        hasScratch: repo?.hasScratch ?? false,
        hasContextMd: repo?.hasContextMd ?? false,
        steering: repo?.steering.file ?? null,
        hasTriageSkill: hasSkill(plugin, 'triage'),
      }),
      dismissed: await read($, dismissedState),
    })
    const events = derived.some(n => n.replacesRail)
      ? []
      : eventNotices(await read($, noticesState))
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
      waiting: waitingForTriage(await read($, trackerState)),
      agents: await agentsViewOf($, flow),
      notices: [...events, ...derived],
      open: await read($, openStepState),
      features: await featureChoices($),
      isPickingFeature: await read($, isPickingFeatureState),
      on: bandActions($),
    })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.isSummary === true || !(await isSupported($)))
      return next(e)
    const repo = await read($, repoState)
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
      read($, gitState),
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
      tab: await read($, paneTabState),
      pluginLine: pluginLine(await read($, pluginState)),
      flow,
      waiting: waitingForTriage(await read($, trackerState)),
      counts: tabCounts({
        flow,
        tickets,
        worktrees: git === null ? null : git.worktrees.length,
        terms: glossary.hasFile ? glossary.total : null,
      }),
      tickets,
      worktrees,
      glossary,
      query: await read($, glossaryQueryState),
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
        search: text => {
          void update($, glossaryQueryState, () => text).then(() => $.ui.invalidate('ui.render'))
        },
        editTerm: name => void jumpToTerm($, name),
        rail: { step: actions.step, triage: actions.triage },
      },
    })
  })
}
