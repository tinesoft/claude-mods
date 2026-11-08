/**
 * Ask in a hook, never hold: a hook has 10 s of its own time and the clock stops only during
 * `next` and `$` calls, so a hook cannot wait on a band press. Gates therefore drop the
 * command and offer Run anyway, and the build queue denies a spawn instead of holding it.
 */
import type { EngineInterface, Register, RenderSurface } from 'claude-code'
import { firstRunText } from '../src/agents-md'
import {
  KEEP_REASONS,
  type KeepWhy,
  samePath,
  stoppedAnswer,
  stoppedStep,
  withoutIsolation,
} from '../src/build'
import { ENGINE_FLOOR, meetsFloor } from '../src/engine'
import { waitingForTriage } from '../src/evidence'
import type { RunRequest } from '../src/gates'
import { removalTargets, worktreeRemoveArgv } from '../src/git'
import type { Action } from '../src/action'
import { derivedNotices, eventNotices } from '../src/notices'
import { renderPane } from '../src/pane'
import { type InboxAction, tabCounts } from '../src/pane-view'
import { namespaced, recognise, SKILLS } from '../src/phases'
import { bareIsOurs, INSTALL_ARGV, pluginLine, UPDATE_ARGV } from '../src/plugin'
import { featureChoices } from '../src/features'
import { type BandActions, renderBand, spinFrameOf } from '../src/rail'
import { linkTerms, Reply } from '../src/reply'
import { markdownSummary } from '../src/summary'
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
import {
  allowGate,
  currentFlow,
  dropNotice,
  dropNotices,
  enterFromIssue,
  finishTurn,
  gatePrompt,
  gateVerdict,
  markDone,
  settle,
  skillStarted,
  startContext,
  switchFeature,
} from './shell/flow'
import { gitOf } from './shell/git'
import { forgetSeat, markStopDelivered, pendingSeat, runOf } from './shell/ledger'
import { dismissedOf, dismissNotice, heldNotices } from './shell/notices'
import {
  refreshGit,
  refreshTracker,
  scheduleGit,
  scheduleRefresh,
  touchesTracker,
} from './shell/sync'
import { mapViewOf, trackerOf, wayfinderOfferOf } from './shell/tracker'
import {
  detectPlugin,
  glossaryTerms,
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
  if (answer === null || answer === NOTHING_MORE || answer.startsWith('Just that')) return about
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
    case 'run':
      return requestRun(
        $,
        action.skill,
        await withContext($, `Anything to add for /${action.skill}?`, action.args),
      )
    case 'run-phase':
      return runFromCard($, action.phase)
    case 'run-anyway': {
      const { noticeId, ...req } = action
      if (await allowGate($, noticeId, req))
        await $.command.run({ command: namespaced(req.skill), args: req.args })
      return
    }
    case 'diagnose': {
      if (action.noticeId !== undefined) await dropNotice($, action.noticeId)
      return requestRun($, SKILLS.diagnosingBugs, await diagnoseArgs($, action.about))
    }
    case 'raise-budget': {
      await raiseBudget($, action.ticket)
      return dropNotices($, n => n.kind === 'budget' && n.ticket === action.ticket)
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
    case 'write-pr':
      return requestRun($, SKILLS.pr, await withContext($, 'Anything to add for the PR?', ''))
    case 'open-tickets':
      return openPane($, 'tickets')
    case 'open-panel':
      return openPane($, 'worktrees')
    case 'pause-all':
      return togglePause($)
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
      $.ui.toast(`Craftory needs Claude Code ${ENGINE_FLOOR} or later. Run claude update.`)
    }
    await Promise.all([loadRepo($), loadFeatures($), detectPlugin($)])
    await stopStaleAgents($)
    await rememberGlossaryAtStart($)
    await settle($)
    $.clock.after(0, () => void refreshAtStart($))
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
    const drop = await gatePrompt($, e, await canAskInBand($))
    if (drop !== undefined) return { drop }
    const context = await startContext($, e)
    return next(context === undefined ? e : { ...e, context: [...(e.context ?? []), ...context] })
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      await finishAgent($, e.agentId as AgentId, e.reason)
      return result
    }
    await noteReplyTerms($, e.answer)
    await finishTurn($, e)
    scheduleRefresh($)
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
    if (e.tool === 'Bash' && /\bgit\b/.test(tool.command ?? '')) scheduleGit($)
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
    await setSteeringNote($, placed.notes.length > 0 ? placed.notes.join(' · ') : null)
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
    if (run.stop !== null) {
      await markStopDelivered($, agentId)
      yield { kind: 'text', index: 0, text: stoppedAnswer(run) }
      return stoppedStep(e.turnId, e.index, run)
    }
    const result = yield* next(e)
    await countStep($, agentId, result)
    return result
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const found = recognise(e.skill, { bare: bareIsOurs(await pluginOf($)) })
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
      : eventNotices(
          await heldNotices($),
          await wayfinderOfferOf($, config.entry.wayfinder.suggest),
        )
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
      config,
      waiting: waitingForTriage(await trackerOf($)),
      agents: await agentsViewOf($, flow),
      notices: [...events, ...derived],
      open: await openPhaseOf($),
      map: await mapViewOf($),
      isMapOpen: await isMapOpenOf($),
      features: featureChoices(await featuresOf($), await draftsOf($), await activeKey($)),
      isPickingFeature: await isPickingFeatureOf($),
      on: bandActions($),
    })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.isSummary === true || !(await isSupported($)))
      return next(e)
    const { config, docs } = await repoFacts($)
    if (!config.automation.underlineTerms) return next(e)
    const linked = linkTerms(e.props.text, await glossaryTerms($))
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
      agents: (agents?.rows ?? []).filter(r => r.status === 'running' || r.status === 'near')
        .length,
      map: await mapViewOf($),
      isMapOpen: await isMapOpenOf($),
      isDecidedOpen: await isDecidedOpenOf($),
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
      notices: eventNotices((await heldNotices($)).filter(n => n.kind === 'gate')),
      on: {
        act: actions.act,
        tab: tab => void openPane($, tab),
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
        editTerm: name => void jumpToTerm($, name),
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
