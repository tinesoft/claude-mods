/**
 * Every hook and every `$` call of Craftory lives here; src/ is pure data in, data out.
 *
 * Ask in a hook, never hold: a hook has 10 s of its own time and the clock stops only during
 * `next` and `$` calls, so a hook cannot wait on a band press. Gates therefore drop the
 * command and offer Run anyway, and the build queue denies a spawn instead of holding it.
 *
 * Hooks are `($, e, next)` and return `next(e)`'s result unless they deliberately answer.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import {
  configOf,
  configWrite,
  CONFIG_PATH,
  parseConfig,
  parsePrefOverrides,
  resolvePrefs,
  STORE_PREFS,
} from '../src/config'
import { ENGINE_FLOOR, meetsFloor } from '../src/engine'
import {
  FEATURES_DIR,
  isFeatureKey,
  parseDrafts,
  parseFeature,
  pickActive,
  STORE_DRAFTS,
  STORE_LAST_ACTIVE,
} from '../src/features'
import {
  AGENT_DOCS,
  DEFAULT_DOCS,
  draftSetup,
  ensureGitignore,
  firstRunText,
  planSetup,
  readSetup,
  remoteHostOf,
  steeringOf,
  type SetupFiles,
  type SetupSignals,
} from '../src/agents-md'
import { GITIGNORE, isShared, isWritable, type FileWrite, type WritableContext } from '../src/files'
import { derivedNotices, parseDismissed, type NoticeAction } from '../src/notices'
import { renderPane } from '../src/pane'
import { namespaced } from '../src/phases'
import {
  hasSkill,
  INSTALL_ARGV,
  INSTALL_TIMEOUT_MS,
  installOutcome,
  LIST_ARGV,
  PROBE_TIMEOUT_MS,
  pluginLine,
  pluginStatus,
  UPDATE_ARGV,
} from '../src/plugin'
import { renderBand, type Ui } from '../src/rail'
import { parseColorFgBg, resolveTone, type Tone } from '../src/theme'
import { parseGlossary } from '../src/glossary'
import type { FeatureRecord, InstallState, PaneTab, RepoSnapshot } from '../types'

const PANE = 'craftory'
const COMMAND = 'craftory'
const STORE_DISMISSED = 'dismissed'

// ─── Atoms (one owner each, listed with the code that writes them) ──────────────────────
//
// repo        loadRepo (session.start, after any write)
// features    loadFeatures (session.start)
// drafts      loadFeatures (session.start)
// active      loadFeatures (session.start)
// plugin      detectPlugin (session.start, after an install)
// install     installPlugin (notice buttons)
// prefs       session.start
// dismissed   Not now (notice button), session.start
// paneTab     openPane
// setupNote   writeSetup (pane button)

const repoState = atom({ plugin: 'craftory', key: 'repo' } as const, null)
const featuresState = atom({ plugin: 'craftory', key: 'features' } as const, {})
const draftsState = atom({ plugin: 'craftory', key: 'drafts' } as const, {})
const activeState = atom({ plugin: 'craftory', key: 'active' } as const, null)
const pluginState = atom({ plugin: 'craftory', key: 'plugin' } as const, { kind: 'checking' })
const installState = atom({ plugin: 'craftory', key: 'install' } as const, { kind: 'idle' })
const prefsState = atom({ plugin: 'craftory', key: 'prefs' } as const, null)
const dismissedState = atom({ plugin: 'craftory', key: 'dismissed' } as const, [])
const paneTabState = atom({ plugin: 'craftory', key: 'paneTab' } as const, 'flow')
const setupNoteState = atom({ plugin: 'craftory', key: 'setupNote' } as const, null)

// ─── Reads ──────────────────────────────────────────────────────────────────────────────

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

// ─── Writes ─────────────────────────────────────────────────────────────────────────────

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

/** Setup as `/setup-matt-pocock-skills` would write it, from the answers read off the repo. */
async function writeSetup($: EngineInterface) {
  try {
    const [files, configText, url, plugin] = await Promise.all([
      readSetupFiles($),
      readText($, CONFIG_PATH),
      remoteUrl($),
      read($, pluginState),
    ])
    const signals: SetupSignals = {
      remoteHost: remoteHostOf(url),
      hasScratch: await exists($, '.scratch'),
      hasContextMd: await exists($, 'CONTEXT.md'),
      steering: steeringOf(files),
      hasTriageSkill: hasSkill(plugin, 'triage'),
    }
    const read_ = readSetup(files)
    const setup = read_.state === 'ok' ? read_.value : draftSetup(signals)
    const config = configOf(parseConfig(configText))
    const writes = [
      ...planSetup(setup, files, {
        worktreeFolder: config.worktrees.folder,
        localFolder: config.tracker.local.folder,
      }),
      ...configWrite(configText),
    ]
    const ctx = await writableContext($, steeringOf(files) ?? setup.steering)
    const { wrote, refused } = await applyWrites($, writes, {
      ...ctx,
      steering: steeringOf(files) ?? setup.steering,
    })
    const note = refused
      ? `${refused}. Nothing more was written; press again.`
      : wrote.length > 0
        ? `Wrote ${wrote.join(', ')}.`
        : 'Everything is already set up.'
    await update($, setupNoteState, () => note)
    await loadRepo($)
  } catch (error) {
    await update(
      $,
      setupNoteState,
      () => `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  $.ui.invalidate('ui.render')
}

// ─── UI helpers ─────────────────────────────────────────────────────────────────────────

/** `Svg` is handed to every surface whose element table has it; the terminal never draws one. */
function uiFor($: EngineInterface, event: Parameters<EngineInterface['ui']['resolve']>[0]): Ui {
  const table = $.ui.resolve(event)
  const { Box, Text, Button } = table
  return event.surface !== 'terminal' && 'Svg' in table
    ? { Box, Text, Button, Svg: table.Svg }
    : { Box, Text, Button }
}

async function toneOf(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
  surface: RenderSurface,
): Promise<Tone | undefined> {
  const theme = (await $.config.list()).find(row => row.key === 'theme')
  const prefs = resolvePrefs(options, await read($, prefsState))
  return resolveTone({
    theme: prefs.theme,
    claudeTheme: theme?.value,
    surface,
    colorFgBg: parseColorFgBg(await $.env.get('COLORFGBG')),
  })
}

async function openPane($: EngineInterface, tab: PaneTab) {
  await update($, paneTabState, () => tab)
  await $.ui.open({ id: PANE, title: 'Craftory', focus: true, closeOnEscape: true })
}

async function onNotice($: EngineInterface, action: NoticeAction) {
  switch (action.kind) {
    case 'install':
      return installPlugin($, INSTALL_ARGV)
    case 'update':
      return installPlugin($, UPDATE_ARGV)
    case 'not-now': {
      const dismissed = [
        ...(await read($, dismissedState)).filter(k => k !== action.key),
        action.key,
      ]
      await update($, dismissedState, () => dismissed)
      await $.store.set(STORE_DISMISSED, dismissed)
      $.ui.invalidate('ui.render')
      return
    }
    case 'setup':
      await openPane($, 'settings')
      return
    case 'run':
      await $.command.run({ command: namespaced(action.skill), args: action.args })
      return
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

// ─── Hooks ──────────────────────────────────────────────────────────────────────────────

const isSupported = async ($: EngineInterface) => meetsFloor((await $.session.version()).base)

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: "Show the active feature's phases, tickets, worktrees, glossary and settings",
      immediate: true,
    })
    await update($, prefsState, () => parsePrefOverrides(null))
    const [prefs, dismissed] = await Promise.all([
      $.store.get(STORE_PREFS),
      $.store.get(STORE_DISMISSED),
    ])
    await update($, prefsState, () => parsePrefOverrides(prefs))
    await update($, dismissedState, () => parseDismissed(dismissed))
    if (!(await isSupported($))) {
      $.ui.toast(`Craftory needs Claude Code ${ENGINE_FLOOR} or later. Run claude update.`)
    }
    await Promise.all([loadRepo($), loadFeatures($), detectPlugin($)])
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await openPane($, 'flow')
    return { text: 'Opened the Craftory pane.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await isSupported($))) return below
    if (!resolvePrefs(options, await read($, prefsState)).rail) return below
    const [repo, plugin] = await Promise.all([read($, repoState), read($, pluginState)])
    const notices = derivedNotices({
      plugin,
      install: await read($, installState),
      repo,
      hasFeature: (await read($, activeState)) !== null,
      firstRunText: firstRunText({
        remoteHost: repo?.remoteHost ?? null,
        hasScratch: repo?.hasScratch ?? false,
        hasContextMd: repo?.hasContextMd ?? false,
        steering: repo?.steering.file ?? null,
        hasTriageSkill: hasSkill(plugin, 'triage'),
      }),
      dismissed: await read($, dismissedState),
    })
    if (notices.length === 0) return below
    return renderBand({
      ui: uiFor($, e),
      surface: e.surface,
      tone: await toneOf($, options, e.surface),
      below,
      notices,
      on: { notice: action => onNotice($, action) },
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) =>
    renderPane({
      ui: uiFor($, e),
      tone: await toneOf($, options, e.surface),
      tab: await read($, paneTabState),
      pluginLine: pluginLine(await read($, pluginState)),
      setupNote: await read($, setupNoteState),
      on: { writeSetup: () => writeSetup($) },
    }),
  )
}
