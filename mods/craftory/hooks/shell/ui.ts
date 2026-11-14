/**
 * An atom is declared here and read or updated only here: the engine's state scan accepts
 * `read` and `update` on an atom of the same file, so other modules call these functions.
 */
import {
  atom,
  type EngineInterface,
  read,
  type RenderSurface,
  type Timer,
  update,
} from 'claude-code'
import { parseColorFgBg, SYSTEM_PROBES } from '../../src/appearance'
import { parsePrefOverrides, resolvePrefs, STORE_PREFS } from '../../src/config'
import type { Flow } from '../../src/evidence'
import { termKey } from '../../src/glossary'
import { glossaryView, ticketsView } from '../../src/pane-view'
import { namespaced, SKILLS } from '../../src/phases'
import { type Ui, vscodeBox, vscodeButton } from '../../src/ui'
import { termKeysIn } from '../../src/reply'
import { resolveTone, type Tone } from '../../src/theme'
import { TRACKERS } from '../../src/tracker'
import type { IssueRef, PaneTab, PhaseId, PrefOverrides, SkillName } from '../../types'
import { featuresOf } from './features'
import { currentFlow, holdForGate, requestOf } from './flow'
import { glossaryTerms, repoFacts } from './repo'
import { readContext, refreshFiles, refreshGit, refreshTracker } from './sync'
import { trackerKindOf, trackerOf } from './tracker'

const APPEARANCE_MS = 5_000

const APPEARANCE_PROBE_TIMEOUT_MS = 1500

const prefsState = atom({ plugin: 'craftory', key: 'prefs' } as const, null)

const appearanceState = atom({ plugin: 'craftory', key: 'appearance' } as const, {
  system: null,
  colorFgBg: null,
})

let appearanceTimer: Timer | undefined

/** `Svg` is handed to every surface whose element table has it; the terminal never draws one. */
export function uiFor(
  $: EngineInterface,
  event: Parameters<EngineInterface['ui']['resolve']>[0],
): Ui {
  const table = $.ui.resolve(event)
  const { Box, Text, Button, Link } = table
  const isVscode = event.surface === 'vscode'
  return {
    Box: isVscode ? vscodeBox(Box) : Box,
    Text,
    Button: isVscode ? vscodeButton(Button, Box) : Button,
    Link,
    ...(event.surface !== 'terminal' && 'Svg' in table && { Svg: table.Svg }),
    ...('Input' in table && { Input: table.Input }),
  }
}

async function probeSystem($: EngineInterface): Promise<Tone | null> {
  for (const probe of SYSTEM_PROBES) {
    try {
      const result = await $.process.run(probe.argv, { timeoutMs: APPEARANCE_PROBE_TIMEOUT_MS })
      const tone = probe.read(result)
      if (tone !== undefined) return tone
    } catch {
      // The command is not installed here, or this surface cannot run commands.
    }
  }
  return null
}

async function refreshAppearance($: EngineInterface) {
  const current = {
    system: await probeSystem($),
    colorFgBg: parseColorFgBg(await $.env.get('COLORFGBG')) ?? null,
  }
  const old = await read($, appearanceState)
  if (old.system === current.system && old.colorFgBg === current.colorFgBg) return
  await update($, appearanceState, () => current)
  $.ui.invalidate('ui.render')
}

/** Reads the system appearance off the render path, now and every five seconds. */
export function watchAppearance($: EngineInterface) {
  appearanceTimer?.cancel()
  appearanceTimer = $.clock.every(APPEARANCE_MS, () => refreshAppearance($))
  $.clock.after(0, () => refreshAppearance($))
}

export async function toneOf(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
  surface: RenderSurface,
): Promise<Tone | undefined> {
  const theme = (await $.config.list()).find(row => row.key === 'theme')
  const prefs = await resolvedPrefs($, options)
  const { system, colorFgBg } = await read($, appearanceState)
  return resolveTone({
    theme: prefs.theme,
    claudeTheme: theme?.value,
    surface,
    colorFgBg: colorFgBg ?? undefined,
    system: system ?? undefined,
  })
}

/** The personal prefs this session sees: the mod's options under whatever the person stored. */
export async function resolvedPrefs(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
) {
  return resolvePrefs(options, await read($, prefsState))
}

export async function loadPrefs($: EngineInterface) {
  const prefs = parsePrefOverrides(await $.store.get(STORE_PREFS))
  await update($, prefsState, () => prefs)
}

export async function savePrefs($: EngineInterface, patch: PrefOverrides) {
  const merged = { ...(await read($, prefsState)), ...patch }
  await $.store.set(STORE_PREFS, merged)
  await update($, prefsState, () => merged)
}

export async function resetPrefs($: EngineInterface) {
  await $.store.set(STORE_PREFS, {})
  await update($, prefsState, () => ({}))
}

export const PANE = 'craftory'

const paneTabState = atom({ plugin: 'craftory', key: 'paneTab' } as const, 'flow')

const openPhaseState = atom({ plugin: 'craftory', key: 'openPhase' } as const, null)

const isMapOpenState = atom({ plugin: 'craftory', key: 'isMapOpen' } as const, false)

const isDecidedOpenState = atom({ plugin: 'craftory', key: 'isDecidedOpen' } as const, false)

const pickedMapState = atom({ plugin: 'craftory', key: 'pickedMap' } as const, null)

const isPickingFeatureState = atom({ plugin: 'craftory', key: 'isPickingFeature' } as const, false)

const glossaryQueryState = atom({ plugin: 'craftory', key: 'glossaryQuery' } as const, '')

const lastReplyTermsState = atom({ plugin: 'craftory', key: 'lastReplyTerms' } as const, [])

const glossaryAtStartState = atom({ plugin: 'craftory', key: 'glossaryAtStart' } as const, null)

/** The phase card and the map card share one slot: closing the slot closes both. */
async function closeCards($: EngineInterface) {
  await update($, openPhaseState, () => null)
  await update($, isMapOpenState, () => false)
}

export async function requestRun($: EngineInterface, skill: SkillName, args: string) {
  const req = requestOf(namespaced(skill), args) ?? { skill, args, phase: null }
  if (await holdForGate($, req, await currentFlow($))) return
  await closeCards($)
  await $.command.run({ command: namespaced(skill), args })
}

export function paneTabOf($: EngineInterface) {
  return read($, paneTabState)
}

export function openPhaseOf($: EngineInterface) {
  return read($, openPhaseState)
}

export function isMapOpenOf($: EngineInterface) {
  return read($, isMapOpenState)
}

export function isDecidedOpenOf($: EngineInterface) {
  return read($, isDecidedOpenState)
}

/** Expands or collapses the Decided group of the Tickets tab's map card. */
export async function toggleDecided($: EngineInterface) {
  await update($, isDecidedOpenState, open => !open)
  $.ui.invalidate('ui.render')
}

export function pickedMapOf($: EngineInterface) {
  return read($, pickedMapState)
}

/** Chooses which map the switcher shows as active; the Feature's link is never touched. */
export async function pickMap($: EngineInterface, ref: IssueRef) {
  await update($, pickedMapState, () => ref)
  $.ui.invalidate('ui.render')
}

export function isPickingFeatureOf($: EngineInterface) {
  return read($, isPickingFeatureState)
}

export function glossaryQueryOf($: EngineInterface) {
  return read($, glossaryQueryState)
}

export async function closeCard($: EngineInterface) {
  await closeCards($)
  $.ui.invalidate('ui.render')
}

export async function togglePicker($: EngineInterface) {
  await update($, isPickingFeatureState, picking => !picking)
  $.ui.invalidate('ui.render')
}

/** Shows or hides the frontier card; it shares the card slot, so it closes any phase card. */
export async function toggleMap($: EngineInterface) {
  await update($, openPhaseState, () => null)
  await update($, isMapOpenState, open => !open)
  $.ui.invalidate('ui.render')
}

export async function closeRailPopups($: EngineInterface) {
  await update($, isPickingFeatureState, () => false)
  await closeCards($)
}

export async function searchGlossary($: EngineInterface, text: string) {
  await update($, glossaryQueryState, () => text)
  $.ui.invalidate('ui.render')
}

export async function rememberGlossaryAtStart($: EngineInterface) {
  const atStart = (await glossaryTerms($)).map(t => termKey(t.name))
  await update($, glossaryAtStartState, () => atStart)
}

export async function noteReplyTerms($: EngineInterface, answer: string) {
  const terms = await glossaryTerms($)
  await update($, lastReplyTermsState, () => termKeysIn(answer, terms))
}

/** Copies to the clipboard of the surface the press came from, and says how it went. */
export async function copyWithToast(
  $: EngineInterface,
  text: string,
  surface: RenderSurface,
  words: { ok: string; fail: string },
) {
  const copied = await $.ui.copy({ text, surface }).catch(() => ({ isCopied: false }))
  $.ui.toast(copied.isCopied ? words.ok : words.fail)
}

export async function openPane($: EngineInterface, tab: PaneTab) {
  await update($, paneTabState, () => tab)
  await refreshFiles($)
  await refreshTracker($)
  if (tab === 'worktrees') await refreshGit($)
  await $.ui.open({ id: PANE, title: 'Craftory', focus: true, closeOnEscape: true })
}

export async function closePane($: EngineInterface) {
  await $.ui.close({ id: PANE })
}

/** Opens the pane on `tab`, or closes it when that tab is already showing. */
export async function togglePane($: EngineInterface, tab: PaneTab) {
  const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isUp && (await read($, paneTabState)) === tab) await $.ui.close({ id: PANE })
  else await openPane($, tab)
}

export async function glossaryViewOf($: EngineInterface) {
  const { repo, docs } = await repoFacts($)
  return glossaryView({
    doc: repo?.glossary,
    path: docs.glossary,
    query: await read($, glossaryQueryState),
    used: await read($, lastReplyTermsState),
    atStart: await read($, glossaryAtStartState),
  })
}

export async function ticketsViewOf($: EngineInterface, flow: Flow | null) {
  const [{ repo, config }, tracker, features] = await Promise.all([
    repoFacts($),
    trackerOf($),
    featuresOf($),
  ])
  const spec = TRACKERS[trackerKindOf(repo)]
  return ticketsView({
    flow,
    tracker,
    config,
    header:
      repo === null || spec === undefined ? 'Tracker' : spec.header(await readContext($, repo)),
    featureSpecs: new Set(Object.keys(features)),
  })
}

export async function pressPhase($: EngineInterface, view: PhaseId | 'triage') {
  await update($, isMapOpenState, () => false)
  await update($, openPhaseState, open => (open === view ? null : view))
  $.ui.invalidate('ui.render')
}

const NOTHING_MORE = 'Nothing to add'

/**
 * Asks whether to add to what a button is about to run. The args stand when there is nothing to
 * add, no one to ask, or the person turned the question off in Settings.
 */
export async function withContext($: EngineInterface, question: string, args: string) {
  if ((await read($, prefsState))?.askContext === false) return args
  const answer = await $.ui.ask(question, [NOTHING_MORE]).catch(() => null)
  if (answer === null || answer === NOTHING_MORE || answer.trim() === '') return args
  return args === '' ? answer : `${args} ${answer}`
}

export async function runFromCard($: EngineInterface, phase: PhaseId | 'triage') {
  if (phase === 'triage')
    return requestRun($, SKILLS.triage, await withContext($, 'Anything to add for /triage?', ''))
  const view = (await currentFlow($))?.phases.find(s => s.phase === phase)
  if (view?.command)
    await requestRun(
      $,
      view.command,
      await withContext($, `Anything to add for /${view.command}?`, view.args),
    )
}
