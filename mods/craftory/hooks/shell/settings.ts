import { atom, type EngineInterface, read, type RenderSurface, update } from 'claude-code'
import {
  draftSetup,
  firstRunText,
  planSettingsWrites,
  planSetup,
  type SetupSignals,
} from '../../src/agents-md'
import { CONFIG_PATH, configOf, configWrite, parseConfig, patchConfig } from '../../src/config'
import { diffSummary, type FileWrite, isShared, type WritableContext } from '../../src/files'
import {
  addTerm,
  deleteTerm,
  editTerm,
  type GlossaryEditError,
  parseGlossary,
  serialiseGlossary,
  termKey,
  termsOf,
} from '../../src/glossary'
import { namespaced, SKILLS } from '../../src/phases'
import { hasSkill } from '../../src/plugin'
import { planScratchImport, type ScratchFile, scratchSummary } from '../../src/scratch'
import {
  checkText,
  type SettingsChange,
  type SettingsFacts,
  type SettingsRow,
} from '../../src/sections'
import type { SettingsArgs } from '../../src/settings'
import type { AgentSetup, GlossaryDoc, PluginStatus, RepoSnapshot, TermDraft } from '../../types'
import { settle } from './flow'
import { refreshTracker } from './sync'
import {
  applyWrites,
  glossaryTerms,
  loadRepo,
  pluginOf,
  readSetupFiles,
  readText,
  repoSnapshot,
  writableContext,
} from './repo'
import { openPane, paneTabOf, resetPrefs, resolvedPrefs, savePrefs } from './ui'

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

export const signalsOf = (repo: RepoSnapshot | null, plugin: PluginStatus): SetupSignals => ({
  remoteHost: repo?.remoteHost ?? null,
  hasScratch: repo?.hasScratch ?? false,
  hasContextMd: repo?.hasContextMd ?? false,
  steering: repo?.steering.file ?? null,
  hasTriageSkill: hasSkill(plugin, 'triage'),
})

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

async function commitWrites(
  $: EngineInterface,
  writes: readonly FileWrite[],
  ctx: WritableContext,
): Promise<string> {
  const real = writes.filter(w => w.after !== w.before)
  if (real.length === 0) return 'Everything is already as you set it.'
  if (!(await confirmFirstWrites($, real, ctx))) return 'Not written. Nothing changed.'
  const settled: FileWrite[] = []
  for (const write of real) {
    if (write.replan === undefined) {
      settled.push(write)
      continue
    }
    const current = await readText($, write.path)
    try {
      settled.push({ path: write.path, before: current, after: write.replan(current) })
    } catch {
      return `${write.path} is not valid JSON any more. Nothing was written.`
    }
  }
  const { wrote, refused } = await applyWrites($, settled, ctx)
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

async function commitChange($: EngineInterface, change: SettingsChange) {
  const [repo, current, files, configText] = await Promise.all([
    repoSnapshot($),
    currentSetup($),
    readSetupFiles($),
    readText($, CONFIG_PATH),
  ])
  if (change.prefs !== undefined) {
    await savePrefs($, change.prefs)
  }
  if (change.config !== undefined && repo?.config.state === 'invalid')
    return say($, `.craftory/config.json is not valid JSON (${repo.config.problem}). Fix it first.`)
  const { writes, nextConfig, nextSetup } = planSettingsWrites({
    change,
    current,
    files,
    configText,
    oldConfig: configOf(repo?.config),
  })
  if (change.setup && current.isDraft) await update($, setupDraftState, () => nextSetup)
  const ctx = await settingsContext($, nextSetup, nextConfig.tracker.local.folder)
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
  await $.command.run({ command: namespaced(SKILLS.setupMattPocockSkills), args: '' })
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

export async function jumpToTerm($: EngineInterface, name: string) {
  await update($, settingsSectionState, () => 'glossary')
  await editTermInForm($, name)
  await openPane($, 'settings')
}

async function scratchOffer($: EngineInterface, folder: string) {
  const plan = await scratchPlan($, folder)
  return plan.items.length === 0 ? null : { count: plan.items.length, folder }
}

export async function settingsArgs(
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
