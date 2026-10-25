import { atom, type EngineInterface, read, type Timer, update } from 'claude-code'
import { DEFAULT_DOCS, DEFAULT_LABELS } from '../../src/agents-md'
import {
  addPending,
  addQueued,
  type AgentCall,
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
  integrationContext,
  isBuilding,
  markStopping,
  moveNotices,
  patchRun,
  pauseText,
  recordOf,
  recordUsage,
  samePath,
  seated,
  type SpawnDecision,
  stopText,
  tddStepOf,
} from '../../src/build'
import { configOf, integrationBranchFor } from '../../src/config'
import { driftDiffArgv, findDrift, retroSuggestions } from '../../src/drift'
import { deriveFlow, type Flow } from '../../src/evidence'
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
} from '../../src/features'
import { checkRun, consumePass, dropText, issuePass, type RunRequest } from '../../src/gates'
import {
  assembleGit,
  basesOf,
  gitStep2,
  parseRemote,
  parseWorktreeList,
  worktreeListArgv,
  worktreeRemoveArgv,
} from '../../src/git'
import { termKey } from '../../src/glossary'
import type { InboxAction } from '../../src/pane-view'
import { recognise } from '../../src/phases'
import { bareIsOurs } from '../../src/plugin'
import { diffSignals, signalBasis, TOAST_MS, toastText } from '../../src/signals'
import { statusLine } from '../../src/summary'
import { SPIN_MS } from '../../src/theme'
import {
  type Read,
  type ReadContext,
  type ReadResult,
  readTracker,
  TRACKERS,
} from '../../src/tracker'
import type {
  AgentId,
  AgentRun,
  EventNotice,
  FeatureKey,
  FeatureRecord,
  GitSnapshot,
  IsoTime,
  IssueRef,
  NoticeKey,
  PhaseId,
  RepoSnapshot,
  Running,
  SeatPlan,
} from '../../types'
import {
  glossaryTerms,
  pluginOf,
  readText,
  remoteUrl,
  repoSnapshot,
  sh,
  writableContext,
  writeRepoFile,
} from './repo'

const REFRESH_DEBOUNCE_MS = 800

const TRACKER_TIMEOUT_MS = 20_000

const featuresState = atom({ plugin: 'craftory', key: 'features' } as const, {})

const draftsState = atom({ plugin: 'craftory', key: 'drafts' } as const, {})

const activeState = atom({ plugin: 'craftory', key: 'active' } as const, null)

const dismissedState = atom({ plugin: 'craftory', key: 'dismissed' } as const, [])

let spinner: Timer | undefined

let refreshTimer: Timer | undefined

const trackerState = atom({ plugin: 'craftory', key: 'tracker' } as const, null)

const runningState = atom({ plugin: 'craftory', key: 'running' } as const, null)

const passesState = atom({ plugin: 'craftory', key: 'passes' } as const, [])

const noticesState = atom({ plugin: 'craftory', key: 'notices' } as const, [])

const signalsState = atom({ plugin: 'craftory', key: 'signals' } as const, null)

const buildState = atom({ plugin: 'craftory', key: 'build' } as const, EMPTY_LEDGER)

const gitState = atom({ plugin: 'craftory', key: 'git' } as const, null)

export async function loadFeatures($: EngineInterface) {
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

/**
 * A record still marked running with no live run in this session belongs to a session that
 * ended without closing it. `stopped` outranks `running` in the merge order, so this sticks.
 */
export async function stopStaleAgents($: EngineInterface) {
  const [features, ledger] = await Promise.all([read($, featuresState), read($, buildState)])
  const live = new Set(
    Object.values(ledger.runs)
      .filter(run => run.status === 'running')
      .map(run => run.ticket),
  )
  const at = isoOf(await $.clock.now())
  for (const record of Object.values(features))
    for (const agent of Object.values(record.agents))
      if (agent.outcome === 'running' && !live.has(agent.ticket))
        await recordChange($, specKey(record.spec), {
          kind: 'agent',
          record: { ...agent, outcome: 'stopped', endedAt: at },
        })
}

const isoOf = (ms: number): IsoTime => new Date(ms).toISOString()

export async function currentFlow($: EngineInterface): Promise<Flow | null> {
  const [repo, features, drafts, active, tracker, running, build] = await Promise.all([
    repoSnapshot($),
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

export const trackerKindOf = (repo: RepoSnapshot | null) =>
  repo?.setup.state === 'ok' ? repo.setup.value.tracker.kind : 'local'

export async function readContext($: EngineInterface, repo: RepoSnapshot): Promise<ReadContext> {
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

function executeReads($: EngineInterface, reads: readonly Read[]) {
  return Promise.all(
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
}

export async function refreshTracker($: EngineInterface) {
  const repo = await repoSnapshot($)
  if (repo === null) return
  const spec = TRACKERS[trackerKindOf(repo)]
  if (spec === undefined) return
  const snapshot = await readTracker(spec, await readContext($, repo), reads =>
    executeReads($, reads),
  )
  await update($, trackerState, () => snapshot)
  await bindDrafts($)
  await cleanupMerged($)
  await settle($)
}

export function scheduleRefresh($: EngineInterface) {
  refreshTimer?.cancel()
  refreshTimer = $.clock.after(REFRESH_DEBOUNCE_MS, () => void refreshTracker($))
}

export async function touchesTracker(
  $: EngineInterface,
  tool: { name: string; command?: string; path?: string },
) {
  const repo = await repoSnapshot($)
  const kind = trackerKindOf(repo)
  if (repo === null) return false
  return TRACKERS[kind]?.touches(await readContext($, repo), tool) === true
}

async function persistDrafts($: EngineInterface) {
  await $.store.set(STORE_DRAFTS, await read($, draftsState))
}

async function saveFeature($: EngineInterface, record: FeatureRecord): Promise<FeatureRecord> {
  const path = featurePath(record.spec)
  const raw = await readText($, path)
  const disk = raw === null ? null : parseFeature(raw)
  const merged = mergeFeature(disk?.state === 'ok' ? disk.value : null, record)
  const after = serialiseFeature(merged)
  if (after !== raw) await writeRepoFile($, { path, before: raw, after }, await writableContext($))
  return merged
}

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

async function bindDrafts($: EngineInterface) {
  const [tracker, repo, drafts] = await Promise.all([
    read($, trackerState),
    repoSnapshot($),
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

export async function settle($: EngineInterface) {
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

export function ledgerOf($: EngineInterface) {
  return read($, buildState)
}

export function featuresOf($: EngineInterface) {
  return read($, featuresState)
}

export function draftsOf($: EngineInterface) {
  return read($, draftsState)
}

export function activeKey($: EngineInterface) {
  return read($, activeState)
}

export function trackerOf($: EngineInterface) {
  return read($, trackerState)
}

export function heldNotices($: EngineInterface) {
  return read($, noticesState)
}

export function dismissedOf($: EngineInterface) {
  return read($, dismissedState)
}

export function gitOf($: EngineInterface) {
  return read($, gitState)
}

export async function hasAgentRuns($: EngineInterface) {
  return Object.keys((await read($, buildState)).runs).length > 0
}

export async function runOf($: EngineInterface, agentId: AgentId | undefined) {
  return agentId === undefined ? undefined : (await read($, buildState)).runs[agentId]
}

export async function pendingSeat($: EngineInterface, toolUseId: string) {
  return (await read($, buildState)).pending[toolUseId]
}

export async function forgetSeat($: EngineInterface, toolUseId: string) {
  await update($, buildState, ledger => dropPending(ledger, toolUseId))
}

export async function dismissNotice($: EngineInterface, key: NoticeKey) {
  await update($, dismissedState, held => [...held.filter(k => k !== key), key])
  $.ui.invalidate('ui.render')
}

export async function allowGate($: EngineInterface, id: string) {
  const notice = await noticeOf($, id)
  if (notice?.kind !== 'gate') return undefined
  const req = { skill: notice.skill, args: notice.args, phase: notice.phase }
  const now = await $.clock.now()
  await update($, passesState, held => issuePass(held, req, now))
  await dropNotice($, notice.id)
  return notice
}

export async function gateVerdict($: EngineInterface, req: RunRequest) {
  return checkRun(req, await currentFlow($), await read($, passesState), await $.clock.now())
}

export async function switchFeature($: EngineInterface, key: FeatureKey) {
  await update($, activeState, () => key)
  await $.store.set(STORE_LAST_ACTIVE, key)
  await settle($)
}

export async function enterFromIssue(
  $: EngineInterface,
  action: Extract<InboxAction, { kind: 'start' }>,
) {
  const tracker = await read($, trackerState)
  const issue = tracker?.rich ? tracker.issues.find(i => i.ref === action.ref) : undefined
  if (issue === undefined) return undefined
  const repo = await repoSnapshot($)
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
  return (await currentFlow($))?.steps.find(s => s.phase === action.phase)
}

export async function skillStarted($: EngineInterface, skill: string) {
  const found = recognise(skill)
  if (found?.kind !== 'phase' && found?.kind !== 'entry') return
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

export async function gatePrompt(
  $: EngineInterface,
  e: { text: string; command?: { name: string; args: string } },
  canAsk: boolean,
): Promise<string | undefined> {
  const typed = typedCommand(e)
  const req = typed && requestOf(typed.name, typed.args, bareIsOurs(await pluginOf($)))
  if (req) {
    if (!canAsk) return undefined
    const verdict = await holdForGate($, req, await currentFlow($))
    if (verdict) return dropText(verdict)
    const now = await $.clock.now()
    await update($, passesState, held => consumePass(held, req, now))
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
  if (req?.phase !== 'build') return undefined
  const [record, git, repo] = await Promise.all([activeRecord($), gitOf($), repoSnapshot($)])
  if (record === null || record.integrationBranch === '') return undefined
  return [
    integrationContext({
      branch: record.integrationBranch,
      from: git?.branch ?? null,
      folder: configOf(repo?.config).worktrees.folder,
    }),
  ]
}

export async function finishTurn($: EngineInterface, e: { answer: string; isAborted?: boolean }) {
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
}

export async function planSpawn($: EngineInterface, call: AgentCall): Promise<SpawnDecision> {
  const [flow, repo, record] = await Promise.all([currentFlow($), repoSnapshot($), activeRecord($)])
  if (flow === null || record === null) return { kind: 'pass' }
  const at = await $.clock.now()
  const decided: { value: SpawnDecision } = { value: { kind: 'pass' } }
  await update($, buildState, ledger => {
    const decision = decideSpawn({
      call,
      ledger,
      config: configOf(repo?.config),
      isBuildRunning: isBuilding(flow),
      tickets: flow.tickets,
      integrationBranch: record.integrationBranch,
    })
    decided.value = decision
    if (decision.kind === 'steer') return addPending(ledger, call.toolUseId, decision.plan, at)
    if (decision.kind === 'deny' && decision.isQueued) return addQueued(ledger, decision.ticket)
    return ledger
  })
  if (decided.value.kind === 'deny') await settle($)
  return decided.value
}

export async function seatAgent(
  $: EngineInterface,
  toolUseId: string,
  plan: SeatPlan,
  agentId: AgentId,
) {
  const repo = await repoSnapshot($)
  const old = (await featureOfTicket($, plan.ticket))?.agents[plan.ticket]
  const budget = budgetFor(configOf(repo?.config), old)
  const at = await $.clock.now()
  await update($, buildState, ledger => seated(ledger, toolUseId, agentId, budget, at))
  const run = (await read($, buildState)).runs[agentId]
  if (run !== undefined) await persistRun($, run)
  await refreshGit($)
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

export async function holdForGate($: EngineInterface, req: RunRequest, flow: Flow | null) {
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

const GIT_DEBOUNCE_MS = 1_500

const told = new Map<string, string>()

let gitTimer: Timer | undefined

export async function activeRecord($: EngineInterface): Promise<FeatureRecord | null> {
  const feature = featureOf(
    await read($, activeState),
    await read($, featuresState),
    await read($, draftsState),
  )
  return feature?.kind === 'specced' ? feature.record : null
}

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

export async function refreshGit($: EngineInterface) {
  const [repo, features, tracker, ledger] = await Promise.all([
    repoSnapshot($),
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

export function scheduleGit($: EngineInterface) {
  gitTimer?.cancel()
  gitTimer = $.clock.after(GIT_DEBOUNCE_MS, () => void refreshGit($))
}

export async function cleanupInputs($: EngineInterface) {
  const [repo, features, tracker, ledger, git] = await Promise.all([
    repoSnapshot($),
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

async function cleanupMerged($: EngineInterface) {
  const { plan, git } = await cleanupInputs($)
  if (git === null) return
  const gone = plan.remove.filter(p => git.worktrees.some(w => samePath(w.path, p)))
  for (const path of gone) await sh($, worktreeRemoveArgv(path))
  if (gone.length > 0) await refreshGit($)
}

export async function countStep(
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

export async function togglePause($: EngineInterface) {
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

export async function markDone($: EngineInterface, phase: PhaseId) {
  const key = await read($, activeState)
  if (key === null) return
  await recordChange($, key, { kind: 'mark-done', phase, at: isoOf(await $.clock.now()) })
  await settle($)
}

export async function raiseBudget($: EngineInterface, ticket: IssueRef) {
  const record = await featureOfTicket($, ticket)
  const old = record?.agents[ticket]
  if (record === null || old === undefined) return
  const step = configOf((await repoSnapshot($))?.config).worktrees.tokenBudget
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

export async function finishAgent($: EngineInterface, agentId: AgentId, reason: FinishReason) {
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

export async function noticeOf($: EngineInterface, id: string) {
  return (await read($, noticesState)).find(n => n.id === id)
}

export async function dropNotice($: EngineInterface, id: string) {
  await update($, noticesState, held => held.filter(n => n.id !== id))
  await settle($)
}

async function scanDrift($: EngineInterface) {
  const [git, record, terms, repo] = await Promise.all([
    read($, gitState),
    activeRecord($),
    glossaryTerms($),
    repoSnapshot($),
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
