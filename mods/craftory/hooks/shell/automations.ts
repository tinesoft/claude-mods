import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  contextTokens,
  HANDOFF_SCOPE,
  handoffLink,
  handoffNotice,
  isArmed,
  isHandoffDocument,
  isHandoffSkill,
  isHandoffDue,
  NUDGE_PREFIX,
  nudgeNotice,
  rearmSession,
  SESSION_SCOPE,
} from '../../src/automations'
import { isoOf } from '../../src/build'
import type { AutomationNotice, FeatureKey, PhaseId } from '../../types'
import { activeKey, recordChange } from './features'
import { currentFlow } from './flow'
import { addNotice, removeNotices } from './notices'
import { repoFacts, repoSnapshot } from './repo'
import { trackerKindOf } from './tracker'

const firedState = atom({ plugin: 'craftory', key: 'automationsFired' } as const, [])
const handoffRunState = atom({ plugin: 'craftory', key: 'handoffRun' } as const, null)

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

/** The handoff skill started: watch what it writes, for the active Feature. */
export async function noteHandoffStart($: EngineInterface, skill: string) {
  if (!isHandoffSkill(skill)) return
  const feature = await activeKey($)
  await update($, handoffRunState, () => ({ feature, path: null }))
}

/** A main-session write that went through, kept when a handoff run is in flight. */
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

/** The phase a main turn ended in, waiting for the refresh after the turn to read its evidence. */
const endedState = atom({ plugin: 'craftory', key: 'nudgeEnded' } as const, null)

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
  const marks = flow.feature.kind === 'draft' ? flow.feature.draft.marks : flow.feature.record.marks
  if (marks[ended.phase]?.nudgedAt !== undefined) return
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
