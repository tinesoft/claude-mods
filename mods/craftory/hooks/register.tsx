/**
 * Ask in a hook, never hold: a hook has 10 s of its own time and the clock stops only during
 * `next` and `$` calls, so a hook cannot wait on a band press. Gates therefore drop the
 * command and offer Run anyway, and the build queue denies a spawn instead of holding it.
 */
import type { EngineInterface, Register, RenderSurface } from 'claude-code'
import { firstRunText } from '../src/agents-md'
import { whileIdle } from '../src/automations'
import {
  KEEP_REASONS,
  runningAgents,
  type KeepWhy,
  samePath,
  stoppedAnswer,
  stoppedStep,
  withoutIsolation,
} from '../src/build'
import { editDenial, reviewDenial, reviewOutflow, ruleVia, skipGateDenial } from '../src/deny'
import { meetsFloor } from '../src/_kit/engine-floor'
import { waitingForTriage } from '../src/evidence'
import type { RunRequest } from '../src/gates'
import { removalTargets, worktreeRemoveArgv } from '../src/git'
import type { Action } from '../src/action'
import { derivedNotices, eventNotices, mainRouteNotices, PANE_NOTICES } from '../src/notices'
import { renderPane } from '../src/pane'
import { type InboxAction, tabCounts } from '../src/pane-view'
import { namespaced, recognise, SKILLS } from '../src/phases'
import { bareIsOurs, INSTALL_ARGV, pluginLine, UPDATE_ARGV } from '../src/plugin'
import { archiveViewOf } from '../src/archive'
import { featureChoices } from '../src/features'
import { type BandActions, renderBand, spinFrameOf } from '../src/rail'
import { linkTerms, Reply } from '../src/reply'
import { spendText } from '../src/spend'
import { markdownSummary, unsupportedText } from '../src/summary'
import { argFor } from '../src/tracker/refs'
import type { AgentId } from '../types'
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
  countStep,
  finishAgent,
  planSpawn,
  raiseBudget,
  retryTicket,
  seatAgent,
  stopStaleAgents,
  togglePause,
} from './shell/agents'
import {
  activeKey,
  activeRecord,
  draftsOf,
  featuresOf,
  loadFeatures,
  recordChange,
} from './shell/features'
import { buildForecastTextOf, forecastNow } from './shell/forecast'
import { retroSummaryRowsOf } from './shell/spend-summary'
import {
  allowGate,
  currentFlow,
  dropNotice,
  dropNotices,
  enterFromIssue,
  finishTurn,
  gatePrompt,
  gateVerdict,
  overBudgetReason,
  markDone,
  refreshSpend,
  settle,
  spendTarget,
  startContext,
  switchFeature,
  archiveFeature,
  unarchiveFeature,
} from './shell/flow'
import { pendingEscalations } from './shell/escalation'
import { mainRouteOf, rememberRoute, routeOfAgent, routeSpawn } from './shell/routing'
import { onSkillStart } from './shell/skill-start'
import {
  finishHandoff,
  noteHandoffWrite,
  noteMainStep,
  noteMainTurnEnd,
  offerArchitecture,
  noteTurnEnded,
  rearmAutomations,
  subagentSkillCall,
} from './shell/automations'
import { gitOf } from './shell/git'
import {
  noteHookSkipTurnEnd,
  noteSkillPrompt,
  noteSkillSeen,
  resetHookSkip,
  turnOffHookEvents,
} from './shell/hook-skip'
import { noteRateLimits, noteUseReading, rateWindowsOf, startRateLimits } from './shell/limits'
import { forgetSeat, markStopDelivered, pendingSeat, runOf } from './shell/ledger'
import { dismissedOf, dismissNotice, heldNotices } from './shell/notices'
import {
  refreshGit,
  refreshTracker,
  scheduleGit,
  scheduleRefresh,
  touchesTracker,
} from './shell/sync'
import {
  endSpend,
  featureSpendOf,
  flushSpend,
  phaseSpendOf,
  setSpendGroup,
  spendSummaryOf,
  spendTabOf,
  noteSpendReading,
  noteSpendStep,
  scheduleSpendFlush,
  spendTotalOf,
  startSpend,
} from './shell/spend'
import { editFeatureBudget, flowBudgetOf } from './shell/budget'
import { continueSpendBudget, raiseSpendBudget } from './shell/spend-budgets'
import { mapViewOf, trackerOf, wayfinderOfferOf } from './shell/tracker'
import {
  detectPlugin,
  glossaryEntries,
  installOf,
  installPlugin,
  loadRepo,
  pluginOf,
  repoFacts,
  sh,
} from './shell/repo'
import { jumpToTerm, settingsArgs, signalsOf } from './shell/settings'
import {
  closeCard,
  closePane,
  closeRailPopups,
  copyWithToast,
  glossaryQueryOf,
  glossaryViewOf,
  isDecidedOpenOf,
  isMapOpenOf,
  isPickingFeatureOf,
  loadPrefs,
  noteReplyTerms,
  openPane,
  togglePane,
  toggleMap,
  pickMap,
  toggleDecided,
  openPhaseOf,
  PANE,
  paneTabOf,
  pressPhase,
  rememberGlossaryAtStart,
  requestRun,
  resolvedPrefs,
  runFromCard,
  filterGlossary,
  searchGlossary,
  ticketsViewOf,
  togglePicker,
  toneOf,
  uiFor,
  watchAppearance,
  withContext,
} from './shell/ui'

const COMMAND = 'craftory'

const RUN_ANYWAY = 'Run anyway'

const DIAGNOSE_FIRST = 'Diagnose first'

const DIAGNOSE_REASON =
  'The user chose to diagnose first, so code-review does not run yet. Tell them what is failing in Build and run the mattpocock-skills:diagnosing-bugs skill on it.'

const keptReason = (path: string, why: KeepWhy) =>
  `Craftory keeps ${path}: ${KEEP_REASONS[why]}. Do not remove it. Clean up the other worktrees and leave this one.`

const NOTHING_MORE = 'Nothing to add'

// The skill starts from whatever it is given, so say what failed and let the user add to it.
async function diagnoseArgs($: EngineInterface, about: string) {
  const answer = await $.ui
    .ask(`What should be diagnosed? ${about}.`, [`Just that: ${about}`, NOTHING_MORE])
    .catch(() => null)
  if (answer === null) return null
  if (answer === NOTHING_MORE || answer.startsWith('Just that')) return about
  return `${about}. ${answer}`
}

async function dispatch($: EngineInterface, action: Action) {
  switch (action.kind) {
    case 'install':
      return installPlugin($, INSTALL_ARGV)
    case 'update':
      return installPlugin($, UPDATE_ARGV)
    case 'not-now':
      return dismissNotice($, action.key)
    case 'setup':
      return openPane($, 'settings')
    case 'run': {
      const args = await withContext($, `Anything to add for /${action.skill}?`, action.args)
      return args === null ? undefined : requestRun($, action.skill, args)
    }
    case 'run-phase':
      return runFromCard($, action.phase)
    case 'run-anyway': {
      const { noticeId, ...req } = action
      // A notice from before hardGates was turned on may still be held: it refuses now.
      if ((await repoFacts($)).config.deny.hardGates) return dropNotice($, noticeId)
      if (await allowGate($, noticeId, req))
        await $.command.run({ command: namespaced(req.skill), args: req.args })
      return
    }
    case 'diagnose': {
      if (action.noticeId !== undefined) await dropNotice($, action.noticeId)
      const args = await diagnoseArgs($, action.about)
      return args === null ? undefined : requestRun($, SKILLS.diagnosingBugs, args)
    }
    case 'retry':
      return retryTicket($, action.ticket, action.model)
    case 'raise-budget': {
      await raiseBudget($, action.ticket)
      return dropNotices($, n => n.kind === 'budget' && n.ticket === action.ticket)
    }
    case 'raise-spend-budget': {
      await raiseSpendBudget($, action.key, action.scope)
      return settle($)
    }
    case 'continue-spend-budget': {
      await continueSpendBudget($, action.key, action.scope, action.budget)
      return settle($)
    }
    case 'resolve': {
      await dropNotice($, action.noticeId)
      await refreshGit($)
      return openPane($, 'worktrees')
    }
    case 'rename': {
      await dropNotice($, action.noticeId)
      return jumpToTerm($, action.term)
    }
    case 'review-retro': {
      await dropNotice($, action.noticeId)
      return openPane($, 'flow')
    }
    case 'dismiss':
      return dropNotice($, action.noticeId)
    case 'turn-off-hook-events':
      return turnOffHookEvents($, action.noticeId)
    case 'automation-run': {
      await dropNotice($, action.noticeId)
      return requestRun($, action.skill, action.args)
    }
    case 'wayfinder': {
      await dropNotice($, action.noticeId)
      // Attach joins the map: the Feature keeps its ref, so the rail shows it from now on
      const key = await activeKey($)
      if (action.map !== undefined && key !== null)
        await recordChange($, key, { kind: 'link-map', map: action.map })
      return requestRun($, SKILLS.wayfinder, action.args)
    }
    case 'dismiss-wayfinder': {
      const key = await activeKey($)
      if (key !== null) await recordChange($, key, { kind: 'dismiss-wayfinder' })
      return dropNotice($, action.noticeId)
    }
    case 'mark-done':
      return markDone($, action.phase)
    case 'write-pr': {
      const args = await withContext($, 'Anything to add for the PR?', '')
      return args === null ? undefined : requestRun($, SKILLS.pr, args)
    }
    case 'open-tickets':
      return openPane($, 'tickets')
    case 'open-panel':
      return openPane($, 'worktrees')
    case 'pause-all':
      return togglePause($)
    case 'archive':
      return archiveFeature($, action.key)
    case 'unarchive':
      return unarchiveFeature($, action.key)
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

async function startFromIssue($: EngineInterface, action: Extract<InboxAction, { kind: 'start' }>) {
  const view = await enterFromIssue($, action)
  if (view?.command)
    await requestRun($, view.command, action.phase === 'align' ? action.arg : view.args)
}

function openFolder($: EngineInterface, folder: string, surface: RenderSurface) {
  return copyWithToast($, folder, surface, {
    ok: `Copied ${folder}`,
    fail: `Could not copy · the folder is ${folder}`,
  })
}

/** Tracker and git reads run subprocesses and the network, so session start does not wait for them. */
async function refreshAtStart($: EngineInterface) {
  await refreshTracker($)
  await refreshGit($)
  if ((await repoFacts($)).config.worktrees.pruneStale) await pruneStale($)
  await settle($)
}

const isSupported = async ($: EngineInterface) => meetsFloor((await $.session.version()).base)

const canAskInBand = async ($: EngineInterface) =>
  (await isSupported($)) &&
  (await $.session.surfaces()).some(surface => surface === 'terminal' || surface === 'desktop')

const drawsAnything = async ($: EngineInterface) =>
  (await isSupported($)) && (await $.session.surfaces()).length > 0

const bandActions = ($: EngineInterface): BandActions => ({
  phase: phase => void pressPhase($, phase),
  triage: () => void pressPhase($, 'triage'),
  summary: () => void openPane($, 'flow'),
  gear: () => void togglePane($, 'settings'),
  closeCard: () => void closeCard($),
  map: () => void toggleMap($),
  pickMap: ref => void pickMap($, ref),
  wayfinder: arg => void requestRun($, SKILLS.wayfinder, arg),
  openFolder: (folder, surface) => void openFolder($, folder, surface),
  pickFeature: () => void togglePicker($),
  switchFeature: key => {
    void (async () => {
      await closeRailPopups($)
      await switchFeature($, key)
    })()
  },
  act: action => void dispatch($, action),
})

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description:
        "Open the Craftory SDLC pane: the active feature's phases, tickets, worktrees, glossary and settings",
      immediate: true,
    })
    await loadPrefs($)
    watchAppearance($)
    if (!(await isSupported($))) {
      $.ui.toast(unsupportedText)
    }
    await Promise.all([
      loadRepo($),
      loadFeatures($),
      detectPlugin($),
      rearmAutomations($),
      resetHookSkip($),
    ])
    // After the features load: a draft's spend is found by its id.
    await startSpend($)
    await startRateLimits($)
    await stopStaleAgents($)
    await rememberGlossaryAtStart($)
    await offerArchitecture($)
    await settle($)
    $.clock.after(0, () => void refreshAtStart($))
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    if (!(await isSupported($))) return { text: unsupportedText }
    if (!(await drawsAnything($))) {
      const flow = await currentFlow($)
      const spend = flow === null ? null : await spendSummaryOf($, flow.feature)
      return { text: markdownSummary(flow, await pluginOf($), spend) }
    }
    await openPane($, 'flow')
    return { text: 'Opened the Craftory pane.' }
  })

  // An organization's security guard may send `skill.prompt` past every mod and print a notice
  // per hook registered for it. A mod cannot see the skip itself, but it sees its effect: a Matt
  // skill started by a typed command or a Skill call whose turn ends with no `skill.prompt`. Two
  // such misses raise a notice offering `hook_events: false`, which registers no `skill.prompt`
  // hook; the Skill call and the typed command then report each start instead.
  if (options.hook_events !== false) {
    on('skill.prompt', async ($, e, next) => {
      await noteSkillPrompt($, e.skill)
      await onSkillStart($, e.skill)
      return next(e)
    })
  }

  on('prompt.submit', async ($, e, next) => {
    const drop = await gatePrompt($, e, await canAskInBand($))
    if (drop !== undefined) return { drop }
    // With `hook_events` off `skill.prompt` is not registered: a typed `/skill` stands in for it.
    // With it on, the typed `/skill` is only watched, to see whether `skill.prompt` follows.
    if (e.command !== undefined) {
      if (options.hook_events === false) await onSkillStart($, e.command.name)
      else await noteSkillSeen($, e.command.name)
    }
    const context = await startContext($, e)
    return next(context === undefined ? e : { ...e, context: [...(e.context ?? []), ...context] })
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      await finishAgent($, e.agentId as AgentId, e.reason)
      return result
    }
    await noteHookSkipTurnEnd($, e, await drawsAnything($))
    await noteReplyTerms($, e.answer)
    await noteTurnEnded($, await finishTurn($, e))
    await noteMainTurnEnd($, e.isAborted === true)
    await finishHandoff($, e.isAborted === true)
    scheduleRefresh($)
    // Off the turn: the write waits on nothing the person is waiting for.
    $.clock.after(0, () => void flushSpend($))
    return result
  })

  on('session.end', async ($, e, next) => {
    await endSpend($, e.reason === 'clear')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const tool = {
      name: e.tool,
      ...('command' in e && typeof e.command === 'string' && { command: e.command }),
      ...('file_path' in e && typeof e.file_path === 'string' && { path: e.file_path }),
    }
    if (await touchesTracker($, tool)) scheduleRefresh($)
    if (e.tool === 'Bash' && /\bgit\b/.test(tool.command ?? '')) scheduleGit($)
    const wentThrough = result.deny === undefined && result.isError !== true
    const writes = e.tool === 'Write' || e.tool === 'Edit'
    if (writes && e.agentId === undefined && wentThrough && tool.path !== undefined)
      await noteHandoffWrite($, tool.path)
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

  // A routed spawn gets its phase's model here, once; its steps never change it, so its cache holds.
  // An implementer whose ticket was pressed Retry on gets the escalation model over any other,
  // unless it forks or resumes a run: those keep their model, as routing leaves them.
  on('agent.spawn', async ($, e, next) => {
    const seat = await pendingSeat($, e.tool_use_id)
    const routing = await routeSpawn($, {
      isImplementer: seat !== undefined,
      ...(e.model !== undefined && { model: e.model }),
      fork: e.fork,
      isResumed: e.resume !== undefined,
    })
    const routed = routing.model === undefined ? e : { ...e, model: routing.model }
    if (seat === undefined) {
      const result = await next(routed)
      if (result.deny === undefined) await rememberRoute($, result.agentId, routing)
      return result
    }
    const { plan } = seat
    const escalation = (await pendingEscalations($))[plan.ticket]
    const keepsModel = e.fork || e.resume !== undefined
    const spawned = escalation === undefined || keepsModel ? routed : { ...e, model: escalation }
    const placed = await seatWorktree($, plan)
    if (!placed.ok) {
      const note = `Craftory could not make ${plan.path}: ${placed.reason}`
      await setSteeringNote($, note)
      await settle($)
      return {
        deny: `${note}. Do not start ${plan.ticket} until that is fixed; tell the user what git said.`,
      }
    }
    await setSteeringNote($, placed.notes.length > 0 ? placed.notes.join(' · ') : null)
    const undo = async () => {
      if (placed.isFresh) await sh($, worktreeRemoveArgv(plan.path, true))
    }
    let result
    try {
      result = await next({ ...spawned, cwd: placed.path })
    } catch (error) {
      await undo()
      throw error
    }
    if (result.deny !== undefined || result.agentId === undefined) {
      await undo()
      return result
    }
    await rememberRoute($, result.agentId, routing)
    await seatAgent($, e.tool_use_id, plan, result.agentId as AgentId, result.model)
    return result
  })

  // A cost that grew after the steps it covers prices them here; the rate-limit windows are kept,
  // and the cost read against them, to tell how much of a window a dollar uses.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('rateLimits')) await noteRateLimits($, e.rateLimits)
    if (e.cost !== undefined) await noteUseReading($, e.cost.usd, e.rateLimits)
    if (e.cost !== undefined && e.changed.includes('cost'))
      if (await noteSpendReading($, e.cost.usd, await activeKey($))) await refreshSpend($)
    return result
  })

  // Yielding a text chunk and returning without `next` sends no request and ends the subagent at
  // once; its Agent call then returns that text. This is the hard stop at the budget. Every step
  // is then charged to whoever it was for; a stopped one carries no usage and is not. A routed
  // subagent's every step carries the effort it spawned with, and never a model. With
  // routing.mainThread on, a main step while a phase runs gets that phase's model and effort; one
  // between phases is left alone, so the session's own model comes back by itself.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId as AgentId | undefined
    const answer = async function* () {
      if (agentId === undefined) {
        const route = (await mainRouteOf($))?.route ?? {}
        const result = yield* next({ ...e, ...route })
        await noteMainStep($, result.usage)
        return result
      }
      const { effort } = await routeOfAgent($, agentId)
      const routed = effort === undefined ? e : { ...e, effort }
      const run = await runOf($, agentId)
      if (run === undefined || run.status !== 'running') return yield* next(routed)
      if (run.stop !== null) {
        await markStopDelivered($, agentId)
        yield { kind: 'text' as const, index: 0, text: stoppedAnswer(run) }
        return stoppedStep(e.turnId, e.index, run)
      }
      const result = yield* next(routed)
      await countStep($, agentId, result)
      return result
    }
    const result = yield* answer()
    const target = await spendTarget($, agentId)
    if (await noteSpendStep($, target, result.usage, await activeKey($))) await refreshSpend($)
    if (agentId !== undefined) scheduleSpendFlush($)
    return result
  })

  // A subagent's run of a skill never counts as the main session's architecture check.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) =>
    e.agentId === undefined ? next(e) : subagentSkillCall($, e.skill, () => next(e)),
  )

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const found = recognise(e.skill, { bare: bareIsOurs(await pluginOf($)) })
    if (found?.kind !== 'phase') return next(e)
    const via = ruleVia((await repoFacts($)).config.deny, 'skipGate')
    if (via !== null) {
      const denial = skipGateDenial(namespaced(found.skill), found.phase, await currentFlow($), via)
      if (denial !== null) return { deny: denial }
    }
    const overBudget = await overBudgetReason($, namespaced(found.skill), found.phase)
    if (overBudget !== null) return { deny: overBudget }
    if (found.phase !== 'review') return next(e)
    const req: RunRequest = { skill: found.skill, args: e.args ?? '', phase: 'review' }
    const verdict = await gateVerdict($, req)
    if (verdict.kind === 'go') return next(e)
    const answer = await $.ui
      .ask(verdict.text, [RUN_ANYWAY, DIAGNOSE_FIRST])
      .catch(() => RUN_ANYWAY)
    return answer === DIAGNOSE_FIRST ? { deny: DIAGNOSE_REASON } : next(e)
  })

  // With `hook_events` off the Skill call stands in for `skill.prompt`; with it on, it is only
  // watched. Beneath the gates above, so a denied call starts nothing.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (options.hook_events === false) await onSkillStart($, e.skill)
    else await noteSkillSeen($, e.skill)
    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, denyIntegrationEdit)
  on('tool.call', { tool: 'Write' }, denyIntegrationEdit)

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const outflow = reviewOutflow(e.command)
    if (outflow !== null && (await repoFacts($)).config.deny.hardGates) {
      const denial = reviewDenial(outflow, await currentFlow($))
      if (denial !== null) return { deny: denial }
    }
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
    const [{ repo, config }, plugin, flow] = await Promise.all([
      repoFacts($),
      pluginOf($),
      currentFlow($),
    ])
    const derived = derivedNotices({
      plugin,
      install: await installOf($),
      repo,
      hasFeature: flow !== null,
      firstRunText: firstRunText(signalsOf(repo, plugin)),
      dismissed: await dismissedOf($),
    })
    const events = derived.some(n => n.replacesRail)
      ? []
      : [
          ...eventNotices(
            whileIdle(await heldNotices($), e.props.isWorking),
            await wayfinderOfferOf($, config.entry.wayfinder.suggest),
          ),
          ...mainRouteNotices(await mainRouteOf($)),
        ]
    if (flow === null && derived.length === 0 && events.length === 0) return below
    return renderBand({
      ui: uiFor($, e),
      surface: e.surface,
      columns: e.props.bodyColumns,
      tone: await toneOf($, options, e.surface),
      ascii: prefs.ascii,
      spinFrame: spinFrameOf(await $.clock.now()),
      below,
      layout: prefs.railLayout,
      flow,
      config,
      waiting: waitingForTriage(await trackerOf($)),
      agents: await agentsViewOf($, flow),
      notices: [...events, ...derived],
      open: await openPhaseOf($),
      map: await mapViewOf($),
      isMapOpen: await isMapOpenOf($),
      features: featureChoices(await featuresOf($), await draftsOf($), await activeKey($)),
      archivable: archiveViewOf(flow, await featuresOf($)).archivable,
      isPickingFeature: await isPickingFeatureOf($),
      spend: flow === null ? null : await featureSpendOf($, flow.feature),
      phaseSpend: flow === null ? {} : await phaseSpendOf($, flow.feature),
      windows: await rateWindowsOf($, config.rateLimits),
      forecast: await buildForecastTextOf($, flow),
      retroSummary: await retroSummaryRowsOf($, flow),
      on: bandActions($),
    })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.isSummary === true || !(await isSupported($)))
      return next(e)
    const { config, docs } = await repoFacts($)
    if (!config.automation.underlineTerms) return next(e)
    const linked = linkTerms(e.props.text, await glossaryEntries($))
    if (linked.found.length === 0) return next(e)
    const table = $.ui.resolve(e)
    return (
      <Reply
        ui={{ ...uiFor($, e), Markdown: table.Markdown }}
        tone={await toneOf($, options, e.surface)}
        surface={e.surface}
        linked={linked}
        path={docs.glossary}
        on={{
          ask: term =>
            void $.command.run({ command: namespaced(SKILLS.waitWhat), args: term.name }),
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
    const agents = await agentsViewOf($, flow)
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
      archive: archiveViewOf(flow, await featuresOf($)),
      agents: runningAgents(agents).length,
      map: await mapViewOf($),
      isMapOpen: await isMapOpenOf($),
      isDecidedOpen: await isDecidedOpenOf($),
      waiting: waitingForTriage(await trackerOf($)),
      counts: tabCounts({
        flow,
        tickets,
        worktrees: git === null ? null : git.worktrees.length,
        terms: glossary.hasFile ? glossary.total : null,
        spend: flow === null ? null : spendText(await spendTotalOf($, flow.feature.key)),
      }),
      tickets,
      worktrees,
      glossary,
      query: await glossaryQueryOf($),
      settings: await settingsArgs($, options),
      spend: await spendTabOf(
        $,
        flow,
        flow === null ? undefined : await forecastNow($, flow.feature.key),
      ),
      budget: await flowBudgetOf($, flow),
      notices: [
        ...eventNotices((await heldNotices($)).filter(n => PANE_NOTICES.has(n.kind))),
        ...mainRouteNotices(await mainRouteOf($)),
      ],
      on: {
        act: actions.act,
        tab: tab => void openPane($, tab),
        spendGroup: group => void setSpendGroup($, group),
        budget: text => void editFeatureBudget($, text),
        diff: path => void toggleDiff($, path),
        openTerminal: (path, surface) => void copyTerminal($, path, surface),
        remove: path => void removeWorktree($, path),
        prune: () => void pruneStale($),
        openFolder: (folder, surface) => void openFolder($, folder, surface),
        inbox: action =>
          void (action.kind === 'start'
            ? startFromIssue($, action)
            : requestRun($, SKILLS.triage, action.arg)),
        implement: arg => void requestRun($, SKILLS.implement, arg),
        implementSpec: () =>
          void (async () => {
            const record = await activeRecord($)
            if (record !== null) {
              const tracker = await trackerOf($)
              const arg = argFor(tracker?.rich ? tracker.issues : null, record.spec)
              await requestRun($, SKILLS.implementSpec, arg)
            }
          })(),
        search: text => void searchGlossary($, text),
        filterGlossary: context => void filterGlossary($, context),
        editTerm: (name, context) => void jumpToTerm($, name, context),
        // the pane has no card to open: a press on its phase strip goes to the Flow tab
        rail: { phase: () => void openPane($, 'flow'), triage: () => void openPane($, 'flow') },
        map: actions.map,
        wayfinder: arg => void requestRun($, SKILLS.wayfinder, arg),
        decided: () => void toggleDecided($),
        closeCard: actions.closeCard,
        pickMap: actions.pickMap,
        settings: () => void openPane($, 'settings'),
        close: () => void closePane($),
      },
    })
  })
}

/** The one hook for Edit and Write: refused under deny.editOnIntegrationBranch, else passed on. */
async function denyIntegrationEdit<E extends { tool: string; file_path: string }, R>(
  $: EngineInterface,
  e: E,
  next: (e: E) => Promise<R>,
): Promise<R | { deny: string }> {
  const denial = await integrationEditDenial($, e.tool, e.file_path)
  return denial === null ? next(e) : { deny: denial }
}

/** The cached git snapshot only: an edit never waits on git, and without one it is let through. */
async function integrationEditDenial($: EngineInterface, tool: string, path: string) {
  const { config } = await repoFacts($)
  const via = ruleVia(config.deny, 'editOnIntegrationBranch')
  if (via === null) return null
  const git = await gitOf($)
  if (git === null) return null
  return editDenial({
    tool,
    path,
    cwd: await $.session.cwd(),
    checkout: {
      root: git.root,
      branch: git.branch,
      others: git.worktrees.map(w => w.path).filter(p => p !== git.root),
    },
    integrationBranch: config.worktrees.integrationBranch,
    via,
  })
}
