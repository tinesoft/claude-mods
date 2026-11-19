import { atom, type EngineInterface, read, type Timer, update } from 'claude-code'
import { archiveRisks, canArchive, isAutoArchivable, shipFactsOf } from '../../src/archive'
import { integrationContext, isoOf } from '../../src/build'
import { integrationBranchFor } from '../../src/config'
import { driftDiffArgv, findDrift, rankedText, retroSuggestions } from '../../src/drift'
import {
  overBudgetDenial,
  overBudgetVerdict,
  type OverBudgetVerdict,
  ruleVia,
  skipGateDenial,
} from '../../src/deny'
import { deriveFlow, type Flow } from '../../src/evidence'
import { draftKey, enteredRecord, featureOf, isArchived, specKey } from '../../src/features'
import { dropText, type RunRequest } from '../../src/gates'
import { termKey } from '../../src/glossary'
import type { InboxAction } from '../../src/pane-view'
import { namespaced, recognise } from '../../src/phases'
import { bareIsOurs } from '../../src/plugin'
import { TOAST_MS, toastText } from '../../src/signals'
import { attribute } from '../../src/spend'
import { statusLine } from '../../src/summary'
import { SPIN_MS } from '../../src/theme'
import { retryContext } from '../../src/routing'
import type {
  AgentId,
  EventNotice,
  FeatureKey,
  IssueRef,
  PhaseId,
  Running,
  SpendTarget,
} from '../../types'
import {
  activeKey,
  activeRecord,
  adoptRecord,
  createDraft,
  draftsOf,
  featureOfTicket,
  featuresOf,
  promoteDrafts,
  recordChange,
  reselectActive,
  setActive,
} from './features'
import { pendingEscalations } from './escalation'
import { saveForecast } from './forecast'
import { retroContextOf, writeSpendSummary } from './spend-summary'
import { gitOf } from './git'
import { throttleNow } from './limits'
import { ledgerOf, runOf } from './ledger'
import {
  addNotice,
  checkGate,
  consumeGatePass,
  holdsNotice,
  issueGatePass,
  newSignals,
  pruneGateNotices,
  removeNotices,
} from './notices'
import { glossaryTerms, pluginOf, repoFacts, sh } from './repo'
import { budgetStandingsOf, featureSpendOf, moveDraftSpend, overrunNow } from './spend'
import { checkSpendBudgets } from './spend-budgets'
import { trackerOf } from './tracker'

const runningState = atom({ plugin: 'craftory', key: 'running' } as const, null)

let spinner: Timer | undefined

/** What runs in the main session now: a phase's or an entry's skill, or nothing. */
export async function runningOf($: EngineInterface): Promise<Running | null> {
  return read($, runningState)
}

export async function currentFlow($: EngineInterface): Promise<Flow | null> {
  const [{ config }, features, drafts, active, tracker, running, build] = await Promise.all([
    repoFacts($),
    featuresOf($),
    draftsOf($),
    activeKey($),
    trackerOf($),
    read($, runningState),
    ledgerOf($),
  ])
  const feature = featureOf(active, features, drafts)
  if (feature === null) return null
  const budgets = (await budgetStandingsOf($, feature)).phases
  return deriveFlow({ feature, config, tracker, running, build, budgets })
}

/** The flow of every Feature and draft, as the rail would show each one active. */
export async function everyFlow($: EngineInterface): Promise<Flow[]> {
  const [{ config }, features, drafts, tracker, running, build] = await Promise.all([
    repoFacts($),
    featuresOf($),
    draftsOf($),
    trackerOf($),
    read($, runningState),
    ledgerOf($),
  ])
  const keys = [
    ...Object.values(features).map(f => specKey(f.spec)),
    ...Object.keys(drafts).map(draftKey),
  ]
  const flows = await Promise.all(
    keys.map(async key => {
      const feature = featureOf(key, features, drafts)
      if (feature === null) return []
      const budgets = (await budgetStandingsOf($, feature)).phases
      return [deriveFlow({ feature, config, tracker, running, build, budgets })]
    }),
  )
  return flows.flat()
}

/** The status line: the active Feature's summary and, once it has any, what it has cost. */
async function showStatus($: EngineInterface, flow: Flow | null) {
  const spend = flow === null ? null : await featureSpendOf($, flow.feature)
  $.ui.status(statusLine(flow, spend?.text ?? null))
}

/** Redraws what shows spend, after a step or a cost reading changed it. */
export async function refreshSpend($: EngineInterface) {
  const flow = await currentFlow($)
  await checkSpendBudgets($, flow)
  await showStatus($, flow)
  $.ui.invalidate('ui.render')
}

/** Who pays for a step: see `attribute`. */
export async function spendTarget(
  $: EngineInterface,
  agentId: AgentId | undefined,
): Promise<SpendTarget> {
  const [run, running, active] = await Promise.all([
    runOf($, agentId),
    read($, runningState),
    activeKey($),
  ])
  const record = run === undefined ? null : await featureOfTicket($, run.ticket)
  return attribute({
    agentId: agentId ?? null,
    run: run ?? null,
    runFeature: record === null ? null : specKey(record.spec),
    running,
    active,
  })
}

/**
 * Brings everything derived from the atoms up to date: the status line, the spinner, the held
 * notices, the toasts for what the tracker newly shows, and the redraw. Every change a person
 * can see ends here.
 */
export async function settle($: EngineInterface) {
  await autoArchive($)
  const flow = await currentFlow($)
  await writeSpendSummary($, flow)
  await showStatus($, flow)
  const isRunning = flow?.phases.some(s => s.state.kind === 'running') === true
  if (isRunning && spinner === undefined) {
    spinner = $.clock.every(SPIN_MS, () => $.ui.invalidate('ui.render'))
  } else if (!isRunning && spinner !== undefined) {
    spinner.cancel()
    spinner = undefined
  }
  await pruneGateNotices($, flow)
  const tracker = await trackerOf($)
  if (tracker !== null) {
    const held = { features: await featuresOf($), drafts: await draftsOf($), tracker }
    for (const signal of await newSignals($, held)) {
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

/**
 * With `automation.archiveOnShip` on, archives each Feature whose Ship is done (and whose
 * retro is, when one was offered). It runs once per Feature, so work that brings it back is
 * not undone by the next settle.
 */
async function autoArchive($: EngineInterface) {
  if (!(await repoFacts($)).config.automation.archiveOnShip) return
  const active = await activeKey($)
  const at = isoOf(await $.clock.now())
  for (const flow of await everyFlow($)) {
    if (flow.feature.kind !== 'specced') continue
    const { record, key } = flow.feature
    const facts = shipFactsOf(flow)
    if (!isAutoArchivable(record, facts)) continue
    // Written before the Feature is archived, while it is still the one through
    await writeSpendSummary($, flow)
    await recordChange($, key, { kind: 'archive', at })
    if (key === active) await reselectActive($)
  }
}

/** Archives a Feature, asking first when an agent of it has not finished cleanly. */
export async function archiveFeature($: EngineInterface, key: FeatureKey) {
  const feature = featureOf(key, await featuresOf($), await draftsOf($))
  if (feature?.kind !== 'specced' || isArchived(feature.record)) return
  const [flow] = (await everyFlow($)).filter(f => f.feature.key === key)
  if (flow === undefined || !canArchive(flow)) return
  const risks = archiveRisks(feature.record)
  if (risks.length > 0) {
    const answer = await $.ui
      .ask(
        `${feature.record.title || feature.record.spec} has tickets whose agents have not finished (${risks.join(', ')}). Their worktrees stay in the Worktrees tab. Archive it anyway?`,
        ['Archive', 'Cancel'],
      )
      .catch(() => null)
    if (answer !== 'Archive') return
  }
  await recordChange($, key, { kind: 'archive', at: isoOf(await $.clock.now()) })
  if ((await activeKey($)) === key) await reselectActive($)
  await settle($)
}

export async function unarchiveFeature($: EngineInterface, key: FeatureKey) {
  await recordChange($, key, { kind: 'unarchive', at: isoOf(await $.clock.now()) })
  await setActive($, key)
  await settle($)
}

export async function dropNotices($: EngineInterface, drops: (notice: EventNotice) => boolean) {
  await removeNotices($, drops)
  await settle($)
}

export function dropNotice($: EngineInterface, id: string) {
  return dropNotices($, n => n.id === id)
}

/** Lets the one gated run through and drops its notice; false when the notice is already gone. */
export async function allowGate($: EngineInterface, noticeId: string, req: RunRequest) {
  if (!(await holdsNotice($, noticeId))) return false
  await issueGatePass($, req)
  await dropNotice($, noticeId)
  return true
}

export async function gateVerdict($: EngineInterface, req: RunRequest) {
  return checkGate($, req, await currentFlow($))
}

export async function holdForGate($: EngineInterface, req: RunRequest, flow: Flow | null) {
  const verdict = await checkGate($, req, flow)
  if (verdict.kind === 'go') return undefined
  const hard = (await repoFacts($)).config.deny.hardGates
  await addNotice($, {
    kind: 'gate',
    ...(hard && { hard }),
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

/**
 * Starting Build while throttling is in force says so in a held notice first, which the band or,
 * where none is drawn, the pane shows. It never drops or delays the run: the notice only tells the
 * person Build will run fewer implementers at once.
 */
export async function warnBeforeBuild($: EngineInterface, req: RunRequest) {
  if (req.phase !== 'build') return
  const throttle = await throttleNow($, (await repoFacts($)).config)
  if (throttle === null) return
  const { label, ...rest } = throttle
  await addNotice($, { kind: 'throttle', id: 'throttle', window: label, ...rest })
  await settle($)
}

/** A run deny.overBudget refuses: what is over, the switch, and the Feature it is over on. */
export type OverBudgetHold = OverBudgetVerdict & { key: FeatureKey; canRaise: boolean }

/**
 * deny.overBudget for a run of `phase`: what is over, the switch that refuses it and the Feature,
 * or null to let the run through. Only a positive over refuses.
 */
export async function overBudgetCheck(
  $: EngineInterface,
  phase: PhaseId | null,
): Promise<OverBudgetHold | null> {
  if (phase === null) return null
  const { config } = await repoFacts($)
  const flow = await currentFlow($)
  if (flow === null) return null
  const verdict = overBudgetVerdict(config.deny, await overrunNow($, flow, phase))
  return verdict && { ...verdict, key: flow.feature.key, canRaise: flow.feature.kind === 'specced' }
}

/** The deny.overBudget reason for running `skill` of `phase`, or null to let it through. */
export async function overBudgetReason($: EngineInterface, skill: string, phase: PhaseId | null) {
  const over = await overBudgetCheck($, phase)
  return over === null ? null : overBudgetDenial(skill, over.overrun, over.via)
}

/** A press that deny.overBudget refuses: the refusal shows in the band, and nothing runs. */
export async function refuseOverBudget($: EngineInterface, req: RunRequest, over: OverBudgetHold) {
  const { overrun, via, key, canRaise } = over
  await addNotice($, {
    kind: 'over-budget-refusal',
    id: `over-budget-${overrun.scope}`,
    key,
    canRaise,
    ...overrun,
    skill: req.skill,
    via,
  })
  await settle($)
}

export function requestOf(
  name: string | undefined,
  args: string,
  bare?: (skill: string) => boolean,
): RunRequest | undefined {
  const found = name === undefined ? undefined : recognise(name, { bare })
  return found?.kind === 'phase' ? { skill: found.skill, args, phase: found.phase } : undefined
}

function typedCommand(e: { text: string; command?: { name: string; args: string } }) {
  if (e.command !== undefined) return { name: e.command.name, args: e.command.args }
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(e.text.trim())
  return match ? { name: match[1]!, args: (match[2] ?? '').trim() } : undefined
}

export async function gatePrompt(
  $: EngineInterface,
  e: { text: string; command?: { name: string; args: string } },
  canAsk: boolean,
): Promise<string | undefined> {
  const typed = typedCommand(e)
  const req = typed && requestOf(typed.name, typed.args, bareIsOurs(await pluginOf($)))
  if (req) {
    const via = req.phase === null ? null : ruleVia((await repoFacts($)).config.deny, 'skipGate')
    if (req.phase !== null && via !== null) {
      const denial = skipGateDenial(namespaced(req.skill), req.phase, await currentFlow($), via)
      if (denial !== null) return denial
    }
    const overBudget = await overBudgetReason($, namespaced(req.skill), req.phase)
    if (overBudget !== null) return overBudget
    // Where no band asks, the gate cannot hold the command, but the warning is still held: the
    // pane shows it, as it does after a press
    if (canAsk) {
      const verdict = await holdForGate($, req, await currentFlow($))
      if (verdict) return dropText(verdict)
      await consumeGatePass($, req)
    }
    await warnBeforeBuild($, req)
  } else if (typed === undefined) {
    const running = await read($, runningState)
    if (running?.isAwaitingUser) {
      await update($, runningState, held => held && { ...held, isAwaitingUser: false })
      await settle($)
    }
  }
  return undefined
}

export async function startContext(
  $: EngineInterface,
  e: { text: string; command?: { name: string; args: string } },
): Promise<string[] | undefined> {
  const typed = typedCommand(e)
  const req = typed && requestOf(typed.name, typed.args, bareIsOurs(await pluginOf($)))
  if (req?.phase === 'retro') {
    const flow = await currentFlow($)
    const context = flow === null ? null : await retroContextOf($, flow)
    return context === null ? undefined : [context]
  }
  if (req?.phase !== 'build') return undefined
  const [record, git, { config }] = await Promise.all([activeRecord($), gitOf($), repoFacts($)])
  if (record === null || record.integrationBranch === '') return undefined
  const ticket = req.args.trim() as IssueRef
  const model = (await pendingEscalations($))[ticket]
  const kept = record.agents[ticket]
  return [
    integrationContext({
      branch: record.integrationBranch,
      from: git?.branch ?? null,
      folder: config.worktrees.folder,
    }),
    ...(model !== undefined && kept !== undefined
      ? [retryContext({ ticket, model, worktree: kept.worktree, branch: kept.branch })]
      : []),
  ]
}

export async function switchFeature($: EngineInterface, key: FeatureKey) {
  await setActive($, key)
  await settle($)
}

export async function enterFromIssue(
  $: EngineInterface,
  action: Extract<InboxAction, { kind: 'start' }>,
) {
  const tracker = await trackerOf($)
  const issue = tracker?.rich ? tracker.issues.find(i => i.ref === action.ref) : undefined
  if (issue === undefined) return undefined
  if (action.phase === 'align') {
    await createDraft($, { title: issue.title, entry: 'align', enteredFrom: issue.ref })
  } else {
    const { config } = await repoFacts($)
    const record = await adoptRecord(
      $,
      enteredRecord({
        issue,
        phase: action.phase,
        integrationBranch: integrationBranchFor(config, issue.title),
        at: isoOf(await $.clock.now()),
      }),
    )
    await setActive($, specKey(record.spec))
  }
  await settle($)
  return (await currentFlow($))?.phases.find(s => s.phase === action.phase)
}

/** A draft the tracker now shows a spec for becomes a feature, and a run on the draft follows it. */
export async function bindDrafts($: EngineInterface) {
  const tracker = await trackerOf($)
  if (!tracker?.rich) return
  const { config } = await repoFacts($)
  const moved = await promoteDrafts($, tracker, title => integrationBranchFor(config, title))
  for (const { from, to } of moved) {
    await update($, runningState, run => (run?.feature === from ? { ...run, feature: to } : run))
    await moveDraftSpend($, from, to)
  }
}

export async function skillStarted($: EngineInterface, skill: string) {
  const found = recognise(skill)
  if (found?.kind !== 'phase' && found?.kind !== 'entry') return
  const now = await $.clock.now()
  const phase = found.kind === 'phase' ? found.phase : null
  if (found.kind === 'entry' && found.entry === 'wayfinder')
    await removeNotices($, n => n.kind === 'suggest-wayfinder')
  let key = await activeKey($)
  if (key === null && (phase === 'align' || phase === 'spec'))
    key = await createDraft($, { title: 'New feature', entry: phase, enteredFrom: null })
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
  if (phase === 'build') {
    const flow = await currentFlow($)
    if (flow !== null) await saveForecast($, flow)
  }
  await settle($)
  if (phase === 'review' || phase === 'ship') await scanDrift($)
}

/**
 * The notice fires once per grill, on the question that first reaches or crosses the configured
 * count (stories 40 and 42: the default 12 is the twelfth question). `questions` is this mod's own
 * count of Align turns that ended waiting on the user, the only question counter there is: the
 * skill's `Q6 of ~14` is its own estimate and never read.
 */
async function suggestWayfinder(
  $: EngineInterface,
  key: FeatureKey | null,
  questions: number,
  isSuggested: boolean,
) {
  const { suggest, afterQuestions } = (await repoFacts($)).config.entry.wayfinder
  if (key === null || suggest === 'off' || isSuggested || questions < afterQuestions) return
  const feature = featureOf(key, await featuresOf($), await draftsOf($))
  if (feature === null) return
  const held = feature.kind === 'draft' ? feature.draft : feature.record
  if (held.wayfinderSuggestDismissed || (feature.kind === 'specced' && feature.record.map)) return
  await update($, runningState, held => held && { ...held, isSuggested: true })
  await addNotice($, { kind: 'suggest-wayfinder', id: 'suggest-wayfinder' })
  await settle($)
}

/** Ends the main turn's phase run. Returns the phase that was Running as the turn ended, if any. */
export async function finishTurn(
  $: EngineInterface,
  e: { answer: string; isAborted?: boolean },
): Promise<{ feature: FeatureKey; phase: PhaseId } | null> {
  const running = await read($, runningState)
  if (running === null || running.isAwaitingUser) return null
  const ended =
    running.feature !== null && running.phase !== null
      ? { feature: running.feature, phase: running.phase }
      : null
  const grillAsksNext = running.phase === 'align' && !e.isAborted
  if (grillAsksNext) {
    const questions = (running.questions ?? 0) + 1
    await update($, runningState, held => held && { ...held, isAwaitingUser: true, questions })
    await suggestWayfinder($, running.feature, questions, running.isSuggested === true)
    return ended
  }
  await update($, runningState, () => null)
  const isRetro = running.phase === 'retro'
  const suggestions = isRetro && !e.isAborted ? retroSuggestions(e.answer) : null
  if (running.feature !== null && running.phase !== null) {
    await recordChange($, running.feature, {
      kind: 'ended',
      phase: running.phase,
      at: isoOf(await $.clock.now()),
      // The ranked suggestions are the Retro phase's evidence; a retro cancelled or without them is unmet
      ...(suggestions !== null && { artifacts: [rankedText(suggestions)] }),
      ...(isRetro && suggestions === null && { isUnparsed: true }),
    })
  }
  if (isRetro && !e.isAborted) {
    await addNotice($, {
      kind: 'retro-ready',
      id: `retro-${await $.clock.now()}`,
      suggestions,
    })
  }
  return ended
}

export async function markDone($: EngineInterface, phase: PhaseId) {
  const key = await activeKey($)
  if (key === null) return
  await recordChange($, key, { kind: 'mark-done', phase, at: isoOf(await $.clock.now()) })
  await settle($)
}

async function scanDrift($: EngineInterface) {
  const [git, record, terms, { docs }] = await Promise.all([
    gitOf($),
    activeRecord($),
    glossaryTerms($),
    repoFacts($),
  ])
  const integration = record?.integrationBranch
  const base = git?.branch
  if (!integration || !base || integration === base || !terms.some(t => t.avoid.length > 0)) return
  const diff = await sh($, driftDiffArgv(base, integration))
  if (diff === null || diff.exitCode !== 0) return
  for (const f of findDrift(diff.stdout, terms, [docs.glossary, 'CONTEXT.md']).slice(0, 3))
    await addNotice($, {
      kind: 'drift',
      id: `drift-${termKey(f.term)}-${termKey(f.avoided)}`,
      avoided: f.avoided,
      term: f.term,
      count: f.count,
    })
  await settle($)
}
