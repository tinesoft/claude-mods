import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  ARCHITECTURE_SCOPE,
  architectureLastRunOf,
  architectureNotice,
  contextTokens,
  HANDOFF_SCOPE,
  handoffLink,
  handoffNotice,
  isArchitectureDue,
  isArchitectureSkill,
  isArmed,
  isHandoffDocument,
  isHandoffSkill,
  isHandoffDue,
  isRetroDue,
  isMidBuild,
  NUDGE_PREFIX,
  nudgeNotice,
  rearmSession,
  retroNotice,
  SESSION_SCOPE,
  withArchitectureRun,
} from '../../src/automations'
import { isoOf } from '../../src/build'
import { markOf } from '../../src/features'
import { bareIsOurs } from '../../src/plugin'
import { STATE_FILE } from '../../src/files'
import type { AutomationNotice, FeatureKey, PhaseId } from '../../types'
import { activeKey, activeRecord, recordChange } from './features'
import { currentFlow, everyFlow } from './flow'
import { addNotice, removeNotices } from './notices'
import { pluginOf, readText, repoFacts, repoSnapshot, writableContext, writeRepoFile } from './repo'
import { trackerKindOf, trackerOf } from './tracker'

const firedState = atom({ plugin: 'craftory', key: 'automationsFired' } as const, [])
const handoffRunState = atom({ plugin: 'craftory', key: 'handoffRun' } as const, null)

/** The architecture check has started in the main session and has not reported yet. */
const architectureRunState = atom({ plugin: 'craftory', key: 'architectureRun' } as const, false)

/** The phase a main turn ended in, waiting for the refresh after the turn to read its evidence. */
const endedState = atom({ plugin: 'craftory', key: 'nudgeEnded' } as const, null)

async function hasFired($: EngineInterface, scope: string) {
  return !isArmed(await read($, firedState), scope)
}

/** Holds the notice once per scope; the band draws it when no turn runs. False when already fired. */
export async function raiseAutomation($: EngineInterface, notice: AutomationNotice) {
  if (await hasFired($, notice.scope)) return false
  await update($, firedState, fired => [...fired, notice.scope])
  await addNotice($, notice)
  $.ui.invalidate('ui.render')
  return true
}

/** A new session re-arms the session-scoped automations. */
export async function rearmAutomations($: EngineInterface) {
  await update($, firedState, rearmSession)
  await removeNotices($, n => n.kind === 'automation' && n.scope.startsWith(SESSION_SCOPE))
}

/** One main-session step answered: offers the handoff once its context reaches 80%. */
export async function noteMainStep(
  $: EngineInterface,
  usage: {
    input_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  } | null,
) {
  if (usage === null) return
  const { config } = await repoFacts($)
  if (!config.automation.handoffAt80 || (await hasFired($, HANDOFF_SCOPE))) return
  const window = await $.session
    .usage()
    .then(u => u.context.window)
    .catch(() => 0)
  if (isHandoffDue(contextTokens(usage), window)) await raiseAutomation($, handoffNotice())
}

/**
 * After each tracker read (the `tool.call` refresh in the session, and the read at session start
 * for a merge made while away): offers a retro once the active Feature's PR has merged. One notice
 * per Feature: the offer is stored on the Feature as it is raised, answered or not.
 */
export async function noteMergedPr($: EngineInterface) {
  const { config } = await repoFacts($)
  if (!config.automation.retroOnPr) return
  const [key, record, tracker] = await Promise.all([activeKey($), activeRecord($), trackerOf($)])
  if (key === null || record === null || !tracker?.rich) return
  if (isRetroDue(record, tracker.pr) && (await raiseAutomation($, retroNotice(key))))
    await recordChange($, key, { kind: 'retro-offered' })
}

/** At session start: offers the architecture check when its last run is over 7 days old. */
export async function offerArchitecture($: EngineInterface) {
  const { config } = await repoFacts($)
  if (!config.automation.weeklyArchitecture || (await hasFired($, ARCHITECTURE_SCOPE))) return
  if ((await everyFlow($)).some(isMidBuild)) return
  const last = architectureLastRunOf(await readText($, STATE_FILE))
  if (isArchitectureDue(last, await $.clock.now())) await raiseAutomation($, architectureNotice())
}

/** The skill's prompt is loading: its done report will be this turn's answer. */
export async function noteSkillStarted($: EngineInterface, skill: string) {
  if (isArchitectureSkill(skill, bareIsOurs(await pluginOf($))))
    await update($, architectureRunState, () => true)
}

/**
 * A subagent's Skill call: the prompt it expands inside `call` is the subagent's, so a run of the
 * architecture skill there leaves the main session's run flag as it was.
 */
export async function subagentSkillCall<R>(
  $: EngineInterface,
  skill: string,
  call: () => Promise<R>,
) {
  if (!isArchitectureSkill(skill, bareIsOurs(await pluginOf($)))) return call()
  const before = await read($, architectureRunState)
  try {
    return await call()
  } finally {
    await update($, architectureRunState, () => before)
  }
}

/**
 * A main turn ended. The architecture check's done report records `architectureLastRun`; a
 * cancelled run leaves it as it was.
 */
export async function noteMainTurnEnd($: EngineInterface, isAborted: boolean) {
  if (!(await read($, architectureRunState))) return
  await update($, architectureRunState, () => false)
  if (isAborted) return
  const before = await readText($, STATE_FILE)
  const after = withArchitectureRun(before, isoOf(await $.clock.now()))
  await writeRepoFile($, { path: STATE_FILE, before, after }, await writableContext($))
}

/** The handoff skill started: watch what it writes, for the active Feature. */
export async function noteHandoffStart($: EngineInterface, skill: string) {
  if (!isHandoffSkill(skill, bareIsOurs(await pluginOf($)))) return
  const feature = await activeKey($)
  await update($, handoffRunState, () => ({ feature, path: null }))
}

/** A main-session Write or Edit that went through, kept when a handoff run is in flight. */
export async function noteHandoffWrite($: EngineInterface, path: string) {
  if (!isHandoffDocument(path)) return
  await update($, handoffRunState, run => run && { ...run, path })
}

/** The main turn ended: a handoff run that wrote its document links it from the Feature card. */
export async function finishHandoff($: EngineInterface, isAborted: boolean) {
  const run = await read($, handoffRunState)
  if (run === null) return
  await update($, handoffRunState, () => null)
  const path = handoffLink(run, isAborted)
  if (path !== null && run.feature !== null)
    await recordChange($, run.feature, { kind: 'handoff', path })
}

/** A main turn ended while `ended` was Running: the next refresh checks its Done-when. */
export async function noteTurnEnded(
  $: EngineInterface,
  ended: { feature: FeatureKey; phase: PhaseId } | null,
) {
  if (ended === null || !(await repoFacts($)).config.automation.nudgeUnmetDone) return
  await update($, endedState, () => ended)
}

/**
 * Runs once the refresh after a turn has read the tracker: when the phase the turn ended in still
 * lacks its evidence, the band says so, once per phase per Feature (the mark is kept on the
 * Feature, so a dismiss holds across sessions). A nudge whose phase is now done is taken back.
 */
export async function nudgeUnmetDone($: EngineInterface) {
  const flow = await currentFlow($)
  const done = new Set(flow?.phases.filter(p => p.state.kind === 'done').map(p => p.phase))
  await removeNotices(
    $,
    n =>
      n.kind === 'automation' &&
      n.id.startsWith(NUDGE_PREFIX) &&
      done.has(n.id.slice(NUDGE_PREFIX.length) as PhaseId),
  )
  const ended = await read($, endedState)
  if (ended === null) return
  await update($, endedState, () => null)
  const { config } = await repoFacts($)
  if (!config.automation.nudgeUnmetDone || flow === null || flow.feature.key !== ended.feature)
    return
  const view = flow.phases.find(p => p.phase === ended.phase)
  if (view === undefined || view.state.kind === 'done' || view.state.kind === 'skipped') return
  if (markOf(flow.feature, ended.phase).nudgedAt !== undefined) return
  await recordChange($, ended.feature, {
    kind: 'nudged',
    phase: ended.phase,
    at: isoOf(await $.clock.now()),
  })
  await raiseAutomation(
    $,
    nudgeNotice(ended.feature, ended.phase, trackerKindOf(await repoSnapshot($))),
  )
}
