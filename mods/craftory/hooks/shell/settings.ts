import { atom, type EngineInterface, read, type RenderSurface, update } from 'claude-code'
import {
  draftSetup,
  firstRunText,
  KEEP_SETUP_ARGS,
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
import { defaultContextOf, newGlossary } from '../../src/glossary-map'
import { namespaced, SKILLS } from '../../src/phases'
import { hasSkill } from '../../src/plugin'
import {
  checkCustom,
  checkText,
  type SettingsChange,
  type SettingsFacts,
  type SettingsRow,
} from '../../src/sections'
import type { SettingsData } from '../../src/settings'
import type { AgentSetup, GlossaryDoc, PluginStatus, RepoSnapshot, TermDraft } from '../../types'
import { settle } from './flow'
import { featureDiff, heldFeatureDiff } from './git'
import { hasCostOf } from './spend'
import { refreshTracker } from './sync'
import {
  applyWrites,
  glossaryTerms,
  loadRepo,
  pluginOf,
  readSetupFiles,
  readText,
  repoFacts,
  repoSnapshot,
  withMap,
  writableContext,
} from './repo'
import { copyWithToast, openPane, paneTabOf, resetPrefs, resolvedPrefs, savePrefs } from './ui'

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
  context: null,
})

const setupDraftState = atom({ plugin: 'craftory', key: 'setupDraft' } as const, null)

const askedFilesState = atom({ plugin: 'craftory', key: 'askedFiles' } as const, [])

const termErrorState = atom({ plugin: 'craftory', key: 'termError' } as const, null)

/** What has been typed into each settings field since it was drawn, for VS Code's Save button. */
const typedState = atom({ plugin: 'craftory', key: 'typed' } as const, {})

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
  const setup = draft ?? draftSetup(signalsOf(repo, plugin))
  return { setup: repo?.glossaryMap ? withMap(setup) : setup, isDraft: true }
}

async function settingsFacts(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
): Promise<SettingsFacts & { isDraft: boolean }> {
  const [{ config }, prefs, current, hasCost] = await Promise.all([
    repoFacts($),
    resolvedPrefs($, options),
    currentSetup($),
    hasCostOf($),
  ])
  return {
    config,
    setup: current.setup,
    isDraft: current.isDraft,
    prefs,
    hasCost,
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
  const answer = await $.ui.ask(question, [WRITE_IT, NOT_NOW]).catch(() => NOT_NOW)
  if (answer !== WRITE_IT) return false
  await update($, askedFilesState, held => [...held, ...fresh.map(w => w.path)])
  return true
}

type WriteResult =
  | { kind: 'noop' }
  | { kind: 'declined' }
  | {
      kind: 'refused'
      cause: { kind: 'not-json'; path: string } | { kind: 'write'; problem: string }
    }
  | { kind: 'saved'; wrote: string[] }

async function commitWrites(
  $: EngineInterface,
  writes: readonly FileWrite[],
  ctx: WritableContext,
): Promise<WriteResult> {
  const real = writes.filter(w => w.after !== w.before)
  if (real.length === 0) return { kind: 'noop' }
  if (!(await confirmFirstWrites($, real, ctx))) return { kind: 'declined' }
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
      return { kind: 'refused', cause: { kind: 'not-json', path: write.path } }
    }
  }
  const { wrote, refused } = await applyWrites($, settled, ctx)
  await loadRepo($)
  return refused === null
    ? { kind: 'saved', wrote }
    : { kind: 'refused', cause: { kind: 'write', problem: refused } }
}

function writeNote(result: WriteResult): string {
  switch (result.kind) {
    case 'noop':
      return 'Everything is already as you set it.'
    case 'declined':
      return 'Not written. Nothing changed.'
    case 'refused':
      return result.cause.kind === 'not-json'
        ? `${result.cause.path} is not valid JSON any more. Nothing was written.`
        : `${result.cause.problem}. Nothing more was written; try again.`
    case 'saved':
      return `Saved ${result.wrote.join(', ')}.`
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

async function say($: EngineInterface, note: string | null) {
  await update($, setupNoteState, () => note)
  $.ui.invalidate('ui.render')
}

async function settingsContext($: EngineInterface, setup: AgentSetup) {
  return {
    ...(await writableContext($)),
    steering: setup.steering,
    docs: setup.docs,
    glossaries: ((await repoSnapshot($))?.contexts ?? []).map(c => c.path),
  } satisfies WritableContext
}

async function commitChange($: EngineInterface, change: SettingsChange) {
  const [{ repo, config: oldConfig }, current, files, configText] = await Promise.all([
    repoFacts($),
    currentSetup($),
    readSetupFiles($),
    readText($, CONFIG_PATH),
  ])
  if (change.prefs !== undefined) {
    await savePrefs($, change.prefs)
  }
  if (change.config !== undefined && repo?.config.state === 'invalid')
    return say($, `.craftory/config.json is not valid JSON (${repo.config.problem}). Fix it first.`)
  const { writes, nextSetup } = planSettingsWrites({
    change,
    current,
    files,
    configText,
    oldConfig,
  })
  if (change.setup && current.isDraft) await update($, setupDraftState, () => nextSetup)
  const ctx = await settingsContext($, nextSetup)
  await say($, writes.length === 0 ? null : writeNote(await commitWrites($, writes, ctx)))
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

async function applyCustom(
  $: EngineInterface,
  row: SettingsRow & { control: 'choice' },
  text: string,
) {
  const checked = checkCustom(row, text)
  if ('problem' in checked) return say($, checked.problem)
  await commitChange($, row.write(checked.value))
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
        chooseSteering: true,
      }),
      ...configWrite(configText),
    ]
    const ctx = await settingsContext($, current.setup)
    const result = await commitWrites($, writes, ctx)
    await update($, setupDraftState, () => null)
    await say($, writeNote(result))
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
  const defaults = patchConfig(null, {})
  const ctx = await settingsContext($, setup)
  const result = await commitWrites(
    $,
    [{ path: CONFIG_PATH, before: configText, after: defaults }],
    ctx,
  )
  await resetPrefs($)
  await say($, result.kind === 'noop' ? 'Already at the defaults.' : writeNote(result))
  await refreshTracker($)
  await settle($)
}

async function rerunSetup($: EngineInterface) {
  if (!hasSkill(await pluginOf($), 'setup-matt-pocock-skills'))
    return void $.ui.toast('Install mattpocock-skills first: the setup skill comes with it')
  const repo = await repoSnapshot($)
  const args = repo?.setup.state === 'ok' ? await keepOrRestart($, KEEP_SETUP_ARGS) : ''
  if (args === null) return
  await $.command.run({ command: namespaced(SKILLS.setupMattPocockSkills), args })
}

const START_OVER = 'Start over'

/** Null when the dialog was dismissed: the setup skill does not run. */
async function keepOrRestart($: EngineInterface, keep: string): Promise<string | null> {
  const answer = await $.ui
    .ask('Setup already exists. Keep your tracker, labels and docs layout?', [
      'Keep my setup',
      START_OVER,
    ])
    .catch(() => null)
  if (answer === null) return null
  if (answer === START_OVER) return ''
  return answer === 'Keep my setup' ? keep : `${keep} ${answer}`
}

const TERM_ERRORS: Record<GlossaryEditError, string> = {
  duplicate: 'A term with that name is already in the glossary.',
  'unknown-term': 'That term is no longer in the glossary.',
  'empty-name': 'A term needs a name.',
}

const EMPTY_DRAFT: TermDraft = { name: '', definition: '', avoid: '', editing: null, context: null }

/**
 * The context a new term goes to: the one picked, else where the Feature's diff works most.
 * A render may not keep the diff it reads, so it reads the held one (`heldFeatureDiff`).
 */
async function chosenContext($: EngineInterface, picked: string | null, isRender = false) {
  const contexts = (await repoSnapshot($))?.contexts ?? []
  if (picked !== null && contexts.some(c => c.name === picked)) return picked
  const diff = isRender ? await heldFeatureDiff($) : await featureDiff($)
  return defaultContextOf(diff, contexts)
}

async function changeGlossary(
  $: EngineInterface,
  context: string | null,
  edit: (doc: GlossaryDoc | null) => GlossaryDoc | GlossaryEditError,
  done?: (path: string) => string,
) {
  const { setup } = await currentSetup($)
  const repo = await repoSnapshot($)
  const target = repo?.contexts.find(c => c.name === context) ?? repo?.contexts[0]
  const path = target?.path ?? setup.docs.glossary
  const raw = await readText($, path)
  const loaded = parseGlossary(raw)
  if (loaded.state === 'invalid')
    return update($, termErrorState, () => `${path} could not be read`)
  // a missing file of a mapped context starts in Matt's format, not as a bare heading
  const fresh =
    loaded.state === 'absent' && repo?.glossaryMap && target
      ? parseGlossary(newGlossary(target.name, target.description))
      : loaded
  const next = edit(fresh.state === 'ok' ? fresh.value : null)
  if (typeof next === 'string') {
    await update($, termErrorState, () => TERM_ERRORS[next])
    return $.ui.invalidate('ui.render')
  }
  const result = await commitWrites(
    $,
    [{ path, before: raw, after: serialiseGlossary(next) }],
    await settingsContext($, setup),
  )
  await update($, termErrorState, () => null)
  await update($, termDraftState, () => EMPTY_DRAFT)
  await say($, done?.(path) ?? writeNote(result))
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
  await changeGlossary($, await chosenContext($, draft.context), doc =>
    editing === null
      ? addTerm(doc, term)
      : doc === null
        ? 'unknown-term'
        : editTerm(doc, termKey(editing), term),
  )
}

async function editTermInForm($: EngineInterface, name: string, context?: string) {
  const contexts = (await repoSnapshot($))?.contexts ?? []
  const holder = contexts.find(
    c =>
      (context === undefined || c.name === context) &&
      c.glossary.state === 'ok' &&
      termsOf(c.glossary.value).some(t => termKey(t.name) === termKey(name)),
  )
  const term =
    holder?.glossary.state === 'ok'
      ? termsOf(holder.glossary.value).find(t => termKey(t.name) === termKey(name))
      : undefined
  if (term === undefined) return
  await update($, termErrorState, () => null)
  await update($, termDraftState, () => ({
    name: term.name,
    definition: term.definition,
    avoid: term.avoid.join(', '),
    editing: term.name,
    context: holder?.name ?? null,
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
    await chosenContext($, (await read($, termDraftState)).context),
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
  const { glossary } = (await currentSetup($)).setup.docs
  return copyWithToast($, glossary, surface, {
    ok: `Copied ${glossary}`,
    fail: `The glossary is ${glossary}`,
  })
}

export async function jumpToTerm($: EngineInterface, name: string, context?: string) {
  await update($, settingsSectionState, () => 'glossary')
  await editTermInForm($, name, context)
  await openPane($, 'settings')
}

export async function settingsArgs(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
): Promise<SettingsData> {
  const [facts, repo, plugin, tab, section, draft, error, note] = await Promise.all([
    settingsFacts($, options),
    repoSnapshot($),
    pluginOf($),
    paneTabOf($),
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
      contexts: (repo?.glossaryMap ? repo.contexts : []).map(c => ({
        name: c.name,
        path: c.path,
        state: c.glossary.state,
        terms: c.glossary.state === 'ok' ? termsOf(c.glossary.value) : [],
      })),
      // only the Settings tab shows it, so no other tab's render runs the diff
      context:
        repo?.glossaryMap && tab === 'settings'
          ? await chosenContext($, draft.context, true)
          : null,
      draft,
      path: facts.setup.docs.map ?? facts.setup.docs.glossary,
      hasContextMd: repo?.hasContextMd ?? false,
      error,
      map: repo?.glossaryMap ?? null,
    },
    note,
    on: {
      section: id => {
        void update($, settingsSectionState, () => id).then(() => $.ui.invalidate('ui.render'))
      },
      set: (row, value) => void applySetting($, row, value),
      setCustom: (row, text) => void applyCustom($, row, text),
      saveSetup: () => void saveSetup($),
      reset: () => void resetSettings($),
      rerunSetup: () => void rerunSetup($),
      typed: {
        // No redraw: the field already shows what was typed.
        note: (key, text) => void update($, typedState, held => ({ ...held, [key]: text })),
        submit: (key, fallback, onSubmit) =>
          void (async () => {
            const held = await read($, typedState)
            await update($, typedState, all =>
              Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)),
            )
            onSubmit(held[key] ?? fallback)
          })(),
      },
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
        edit: (name, context) => void editTermInForm($, name, context),
        remove: (name, context) =>
          void changeGlossary($, context ?? null, doc =>
            doc === null ? 'unknown-term' : deleteTerm(doc, termKey(name)),
          ),
        pick: context => {
          void update($, termDraftState, held => ({ ...held, context })).then(() =>
            $.ui.invalidate('ui.render'),
          )
        },
        importContext: () => void importContext($),
        copyPath: surface => void copyGlossaryPath($, surface),
      },
    },
  }
}
