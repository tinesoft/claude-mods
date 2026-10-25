/**
 * Build steering: pure transitions over `BuildLedger`. register.tsx owns the one atom and
 * performs the effects each transition names.
 *
 * One implementer, keyed by the Agent tool's `tool_use_id` until the engine gives an agent id:
 *
 *   tool.call Agent ──decideSpawn──► pass | deny (queue, paused, blocked) | steer
 *        steer: `isolation` stripped, `name` set, pending[toolUseId] = SeatPlan
 *   agent.spawn (same tool_use_id) ──► shell makes the worktree, next({ ...e, cwd }),
 *        then seated(): pending[toolUseId] -> runs[agentId]
 *   turn.step (agentId) ──recordUsage──► tokens += fresh tokens; 80% near, 100% over + stopping
 *   turn.step (agentId, isStopping) ──► answered without `next`, which ends the subagent
 *   turn.complete (agentId) ──finishRun──► done | failed | stopped, written to the feature record
 *
 * The seat goes through `agent.spawn`'s `cwd`, not `classic.WorktreeCreate`: the spawn carries
 * the same `tool_use_id` as the call, so the ticket and its worktree pair exactly (M4 spike).
 */
import type {
  AgentId,
  AgentRecord,
  AgentRun,
  BudgetState,
  BuildLedger,
  CraftoryConfig,
  IssueRef,
  IsoTime,
  Millis,
  SeatPlan,
  Worktree,
} from '../types'
import { slugify, ticketBranchFor } from './config'
import type { Flow, TicketRow } from './evidence'

export const EMPTY_LEDGER: BuildLedger = { pending: {}, runs: {}, queued: [], isPaused: false }

/** A budget is near at 80%: `tokens * 5 >= budget * 4`, in integers so 79.99% never rounds up. */
/** The Agent tool input fields Craftory reads. */
export type AgentCall = {
  toolUseId: string
  description: string
  prompt: string
  name?: string
  isolation?: string
}

export type SpawnDecision =
  | { kind: 'pass' }
  | { kind: 'deny'; reason: string; ticket: IssueRef; isQueued: boolean }
  | { kind: 'steer'; name: string; plan: SeatPlan }

// ─── Budget ─────────────────────────────────────────────────────────────────────────────

/**
 * Fresh tokens of one request: input + cache creation + output. Cache reads are excluded:
 * each step re-reads the whole context, so counting them would charge the context once per
 * step and an 80k budget would end within a few steps.
 */
export const freshTokens = (usage: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
}): number => usage.input_tokens + usage.cache_creation_input_tokens + usage.output_tokens

export const budgetState = (tokens: number, budget: number): BudgetState =>
  tokens >= budget ? 'over' : tokens * 5 >= budget * 4 ? 'near' : 'ok'

/** The ticket's budget: the config step, or what Raise budget stored for it, whichever is more. */
export const budgetFor = (config: CraftoryConfig, record: AgentRecord | undefined): number =>
  Math.max(config.worktrees.tokenBudget, record?.budget ?? 0)

export const budgetK = (budget: number) => `${Math.round(budget / 1000)}k`

// ─── Naming and the seat ────────────────────────────────────────────────────────────────

const refNumber = (ref: IssueRef) => ref.replace(/^#/, '')

/** Agent name: `craftory-44-ledger-tax`, `-2` and up for a retry while the name is taken. */
export function agentName(ref: IssueRef, title: string, taken: ReadonlySet<string>): string {
  const base = `craftory-${refNumber(ref)}-${slugify(title, 4, 32)}`.replace(/-$/, '')
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

const withSlash = (folder: string) => (folder.endsWith('/') ? folder : `${folder}/`)

export function seatPlan(args: {
  config: CraftoryConfig
  ref: IssueRef
  title: string
  name: string
  integrationBranch: string
}): SeatPlan {
  const { config, ref, title, name, integrationBranch } = args
  const { worktrees } = config
  return {
    ticket: ref,
    name,
    branch: ticketBranchFor(config, ref, title),
    path: `${withSlash(worktrees.folder)}${refNumber(ref)}-${slugify(title, 4, 32)}`,
    base: integrationBranch,
    setup: splitArgv(worktrees.setup),
    copy: worktrees.copy,
  }
}

/** `pnpm install --frozen-lockfile` to argv, honouring simple quotes. No shell runs it. */
export function splitArgv(command: string): string[] | null {
  const argv: string[] = []
  const word = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of command.matchAll(word)) argv.push(m[1] ?? m[2] ?? m[3] ?? '')
  return argv.length === 0 ? null : argv
}

// ─── Ledger reads ───────────────────────────────────────────────────────────────────────

const liveRuns = (ledger: BuildLedger) =>
  Object.values(ledger.runs).filter(run => run.status === 'running')

/** Running tickets, then the tickets whose spawn is being seated. For the queue reason and the footer. */
export const runningTickets = (ledger: BuildLedger): IssueRef[] => [
  ...liveRuns(ledger).map(run => run.ticket),
  ...Object.values(ledger.pending).map(seat => seat.plan.ticket),
]

export const slotsUsed = (ledger: BuildLedger) => runningTickets(ledger).length

export const runOf = (ledger: BuildLedger, ticket: IssueRef): AgentRun | undefined =>
  Object.values(ledger.runs)
    .filter(run => run.ticket === ticket)
    .sort((a, b) => b.startedAt - a.startedAt)[0]

/** Build is under way: the skill runs, agents work, or one needs the user. */
export const isBuilding = (flow: Flow | null): boolean => {
  const kind = flow?.steps.find(s => s.phase === 'build')?.state.kind
  return kind === 'running' || kind === 'needs-you' || kind === 'over-budget' || kind === 'failed'
}

/**
 * The Agent input without `isolation`: the engine refuses a spawn that has both `cwd` and
 * `isolation: 'worktree'`, and Craftory seats the agent through `cwd` (M4 spike).
 */
export const withoutIsolation = <T extends object>(call: T): Omit<T, 'isolation'> =>
  Object.fromEntries(Object.entries(call).filter(([key]) => key !== 'isolation')) as Omit<
    T,
    'isolation'
  >

// ─── Deciding a spawn ───────────────────────────────────────────────────────────────────

const TICKET_REF = /#\d+/g

/** The tickets a text names, in order, once each. */
const namedIn = (text: string, known: ReadonlySet<string>): string[] => [
  ...new Set((text.match(TICKET_REF) ?? []).filter(ref => known.has(ref))),
]

/**
 * The ticket an Agent call is for: the first not-yet-merged ticket of the feature named in the
 * description, else the name, else the prompt. A prompt also names blockers, so merged ones
 * are skipped.
 */
export function ticketOf(call: AgentCall, tickets: readonly TicketRow[]): TicketRow | undefined {
  const known = new Set<string>(tickets.map(t => t.issue.ref))
  for (const text of [call.description, call.name ?? '', call.prompt]) {
    const open = namedIn(text, known)
      .map(ref => tickets.find(t => t.issue.ref === ref)!)
      .filter(t => t.status !== 'merged')
    if (open[0] !== undefined) return open[0]
  }
  return undefined
}

export function queueReason(
  ticket: IssueRef,
  running: readonly IssueRef[],
  maxParallel: number,
): string {
  const list = running.join(', ')
  return (
    `Craftory runs at most ${maxParallel} implementers at once, and ${list} ${running.length === 1 ? 'is' : 'are'} running. ` +
    `Do not start ${ticket} yet: launch it after one of them returns (${list}), and do not call Agent for ${ticket} again before then.`
  )
}

export const pausedReason = (ticket: IssueRef) =>
  `Build is paused in Craftory. Do not start ${ticket}; wait until the user resumes it, and do not call Agent for ${ticket} before then.`

const blockedReason = (ticket: IssueRef, by: readonly IssueRef[]) =>
  `${ticket} is blocked by ${by.join(', ')}, which ${by.length === 1 ? 'is' : 'are'} not merged yet. ` +
  `Launch ${ticket} after ${by.join(', ')} is merged into the integration branch, and do not call Agent for ${ticket} before then.`

const humanReason = (ticket: IssueRef) =>
  `${ticket} is ready-for-human, so Craftory does not give it to an agent. Leave it for the user, tell them it needs them, and carry on with the other tickets.`

const duplicateReason = (ticket: IssueRef) =>
  `${ticket} already has an agent running. Wait for it to report instead of starting a second one for ${ticket}.`

/**
 * Whether this Agent call is a Build implementer, and what to do with it. An implementer asks
 * for a worktree (`isolation: 'worktree'`, as implement-spec step 4 instructs) while Build runs
 * and names a ticket of the active feature. Mergers and explorers name tickets too but ask for
 * no worktree, so they pass untouched.
 *
 * A denied spawn is the queue (never held): the reason tells the model what to wait for.
 */
export function decideSpawn(args: {
  call: AgentCall
  ledger: BuildLedger
  config: CraftoryConfig
  isBuildRunning: boolean
  tickets: readonly TicketRow[]
  integrationBranch: string
}): SpawnDecision {
  const { call, ledger, config, isBuildRunning, tickets, integrationBranch } = args
  if (!isBuildRunning || call.isolation !== 'worktree') return { kind: 'pass' }
  const row = ticketOf(call, tickets)
  if (row === undefined) return { kind: 'pass' }
  const ticket = row.issue.ref
  const deny = (reason: string, isQueued = false): SpawnDecision => ({
    kind: 'deny',
    reason,
    ticket,
    isQueued,
  })
  if (row.status === 'human') return deny(humanReason(ticket))
  if (row.status === 'blocked') return deny(blockedReason(ticket, row.blockedBy))
  if (runningTickets(ledger).includes(ticket)) return deny(duplicateReason(ticket))
  if (ledger.isPaused) return deny(pausedReason(ticket), true)
  const running = runningTickets(ledger)
  if (running.length >= config.worktrees.maxParallel)
    return deny(queueReason(ticket, running, config.worktrees.maxParallel), true)
  const taken = new Set([
    ...Object.values(ledger.runs).map(run => run.name),
    ...Object.values(ledger.pending).map(seat => seat.plan.name),
  ])
  const name = agentName(ticket, row.issue.title, taken)
  return {
    kind: 'steer',
    name,
    plan: seatPlan({ config, ref: ticket, title: row.issue.title, name, integrationBranch }),
  }
}

// ─── Transitions ────────────────────────────────────────────────────────────────────────

export const addPending = (
  ledger: BuildLedger,
  toolUseId: string,
  plan: SeatPlan,
  at: Millis,
): BuildLedger => ({
  ...ledger,
  pending: { ...ledger.pending, [toolUseId]: { toolUseId, plan, at } },
})

export const addQueued = (ledger: BuildLedger, ticket: IssueRef): BuildLedger =>
  ledger.queued.includes(ticket) ? ledger : { ...ledger, queued: [...ledger.queued, ticket] }

/** The spawn is over, seated or not: forget the pending seat. */
export const dropPending = (ledger: BuildLedger, toolUseId: string): BuildLedger => {
  if (!(toolUseId in ledger.pending)) return ledger
  return {
    ...ledger,
    pending: Object.fromEntries(Object.entries(ledger.pending).filter(([id]) => id !== toolUseId)),
  }
}

/** pending[toolUseId] becomes runs[agentId]; the ticket leaves the queue. */
export function seated(
  ledger: BuildLedger,
  toolUseId: string,
  agentId: AgentId,
  budget: number,
  at: Millis,
): BuildLedger {
  const seat = ledger.pending[toolUseId]
  if (seat === undefined) return ledger
  const { plan } = seat
  const run: AgentRun = {
    agentId,
    ticket: plan.ticket,
    name: plan.name,
    worktree: plan.path,
    branch: plan.branch,
    tokens: 0,
    budget,
    budgetState: 'ok',
    isStopping: false,
    status: 'running',
    tddStep: null,
    startedAt: at,
    lastAt: at,
  }
  const dropped = dropPending(ledger, toolUseId)
  return {
    ...dropped,
    runs: { ...dropped.runs, [agentId]: run },
    queued: dropped.queued.filter(ref => ref !== plan.ticket),
  }
}

/**
 * Adds a step's tokens. `crossed` names the threshold this step crossed. The state only moves
 * ok, near, over, so each fires once. Over also marks the run stopping.
 */
export function recordUsage(
  ledger: BuildLedger,
  agentId: AgentId,
  tokens: number,
  at: Millis,
): { ledger: BuildLedger; crossed: 'near' | 'over' | null; run: AgentRun | null } {
  const run = ledger.runs[agentId]
  if (run === undefined) return { ledger, crossed: null, run: null }
  const total = run.tokens + tokens
  const state = budgetState(total, run.budget)
  const crossed = state === run.budgetState || state === 'ok' ? null : state
  const next: AgentRun = {
    ...run,
    tokens: total,
    budgetState: state,
    isStopping: run.isStopping || state === 'over',
    lastAt: at,
  }
  return { ledger: { ...ledger, runs: { ...ledger.runs, [agentId]: next } }, crossed, run: next }
}

export function patchRun(
  ledger: BuildLedger,
  agentId: AgentId,
  patch: Partial<AgentRun>,
): BuildLedger {
  const run = ledger.runs[agentId]
  return run === undefined
    ? ledger
    : { ...ledger, runs: { ...ledger.runs, [agentId]: { ...run, ...patch } } }
}

const TDD_FULL = /\b(red|green|refactor)\b[^\n\d]{0,20}?\btest\s+(\d+)\s+of\s+(\d+)/i
const TDD_LEAD = /^\s*(?:TDD\s*[:·-]\s*)?(red|green|refactor)\s*(?:[:·-]|$)/im

/**
 * The TDD step from a step's answer, only when the agent says it: `red · test 4 of 5`, or just
 * the colour when a line leads with it. Null means not observable; the row then shows none.
 */
export function tddStepOf(answer: string): string | null {
  const full = TDD_FULL.exec(answer)
  if (full) return `${full[1]!.toLowerCase()} · test ${full[2]} of ${full[3]}`
  const lead = TDD_LEAD.exec(answer)
  return lead ? lead[1]!.toLowerCase() : null
}

export type FinishReason = 'answer' | 'aborted' | 'refusal' | 'error'

export function finishRun(
  ledger: BuildLedger,
  agentId: AgentId,
  reason: FinishReason,
  at: Millis,
): { ledger: BuildLedger; run: AgentRun | null } {
  const run = ledger.runs[agentId]
  if (run === undefined || run.status !== 'running') return { ledger, run: null }
  const status: AgentRun['status'] =
    reason === 'refusal' || reason === 'error'
      ? 'failed'
      : reason === 'aborted' || run.isStopping
        ? 'stopped'
        : 'done'
  const finished: AgentRun = { ...run, status, lastAt: at }
  return { ledger: { ...ledger, runs: { ...ledger.runs, [agentId]: finished } }, run: finished }
}

const isoOf = (ms: Millis): IsoTime => new Date(ms).toISOString()

/** A live run as the stored fact: written at the seat, at threshold crossings and at the end. */
export function recordOf(run: AgentRun): AgentRecord {
  const isOver =
    run.budgetState === 'over' && (run.status === 'running' || run.status === 'stopped')
  return {
    ticket: run.ticket,
    name: run.name,
    branch: run.branch,
    worktree: run.worktree,
    tokens: run.tokens,
    budget: run.budget,
    outcome: isOver ? 'over-budget' : run.status,
    startedAt: isoOf(run.startedAt),
    ...(run.status !== 'running' && { endedAt: isoOf(run.lastAt) }),
  }
}

// ─── Stopping, pausing and moving ───────────────────────────────────────────────────────

export const stopText = (ticket: IssueRef, budget: number) =>
  `Craftory: ${ticket} reached its ${budgetK(budget)} token budget. Stop now. ` +
  'Do not start new work. Report what is done, what is left and the state of the tests, then end.'

export const pauseText =
  'Craftory: the user paused Build. Finish the step you are on, commit, report where you stopped, then end.'

export const conflictText = (ticket: IssueRef) =>
  `Craftory: ${ticket} stopped on a merge conflict after the integration branch moved. Do not continue. ` +
  'Report which files conflict and what you were doing, then end. The user resolves it.'

export const markStopping = (ledger: BuildLedger, agentId: AgentId): BuildLedger =>
  patchRun(ledger, agentId, { isStopping: true })

/** What a stopping agent's next `turn.step` says in place of a model request. */
export const stoppedAnswer = (run: AgentRun) =>
  run.budgetState === 'over'
    ? `Stopped by Craftory: ${run.ticket} is over its ${budgetK(run.budget)} token budget. The worktree is kept.`
    : `Stopped by Craftory: ${run.ticket} was paused. The worktree is kept.`

/** The result `turn.step` returns for a stopping agent instead of calling `next`. */
export const stoppedStep = (turnId: string, index: number, run: AgentRun) => ({
  turnId,
  index,
  answer: stoppedAnswer(run),
  toolUses: [],
  stopReason: 'end_turn' as const,
  usage: null,
})

/**
 * The running agents to tell that the integration tip moved and they are behind it. Craftory
 * never rebases a worktree under a running agent: the agent merges the new tip itself.
 */
export function moveNotices(
  ledger: BuildLedger,
  worktrees: readonly Pick<Worktree, 'path' | 'behind'>[],
  integrationBranch: string,
): { agentId: AgentId; text: string }[] {
  return liveRuns(ledger).flatMap(run => {
    const behind = worktrees.find(w => samePath(w.path, run.worktree))?.behind ?? 0
    if (behind === 0 || run.isStopping) return []
    return [
      {
        agentId: run.agentId,
        text:
          `Craftory: ${integrationBranch} moved and your branch is ${behind} commit${behind === 1 ? '' : 's'} behind it. ` +
          `At your next safe point, merge ${integrationBranch} into your branch, run the tests, then carry on.`,
      },
    ]
  })
}

/** `/repo/.worktrees/44-x` and `.worktrees/44-x` are the same worktree. */
export const samePath = (absolute: string, relative: string) => {
  const a = absolute.replace(/\/+$/, '')
  const r = relative.replace(/^\.\//, '').replace(/\/+$/, '')
  return a === r || a.endsWith(`/${r}`)
}

// ─── Cleanup ────────────────────────────────────────────────────────────────────────────

export type KeepWhy = 'running' | 'unmerged' | 'failed' | 'over-budget' | 'stopped'

/**
 * Which worktrees to remove (merged and removeAfterMerge, or a failed one when keepFailed is
 * off) and which to keep with the reason. Running worktrees are always kept.
 */
export function cleanupPlan(args: {
  records: readonly AgentRecord[]
  merged: ReadonlySet<string>
  config: CraftoryConfig
  running: ReadonlySet<string>
}): { remove: string[]; keep: { path: string; why: KeepWhy }[] } {
  const { records, merged, config, running } = args
  const remove: string[] = []
  const keep: { path: string; why: KeepWhy }[] = []
  for (const r of records) {
    if (running.has(r.worktree) || r.outcome === 'running') {
      keep.push({ path: r.worktree, why: 'running' })
    } else if (r.outcome === 'done') {
      if (merged.has(r.ticket) && config.worktrees.removeAfterMerge) remove.push(r.worktree)
      else keep.push({ path: r.worktree, why: 'unmerged' })
    } else if (config.worktrees.keepFailed) {
      keep.push({ path: r.worktree, why: r.outcome })
    } else {
      remove.push(r.worktree)
    }
  }
  return { remove, keep }
}

// ─── The agents list ────────────────────────────────────────────────────────────────────

export type RowStatus =
  | 'merged'
  | 'awaiting-merge'
  | 'running'
  | 'queued'
  | 'needs-you'
  | 'near'
  | 'over'
  | 'failed'
  | 'stopped'

export type AgentRow = {
  ref: IssueRef
  title: string
  status: RowStatus
  /** The TDD step, only when the agent said it; the state words for the rows without an agent. */
  step: string | null
  tokens: number
  budget: number
  /** Null when no agent ever ran for the ticket. */
  elapsedMs: number | null
  worktree: string | null
  branch: string | null
  added: number | null
  deleted: number | null
  /** `3 commits`, `1 commit · 1 behind`; null before the first look at git. */
  commits: string | null
  /** Why a row has no agent: what it waits for, or where it merged. */
  note: string | null
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const recordRowStatus = (r: AgentRecord): RowStatus =>
  r.outcome === 'over-budget' && r.tokens >= r.budget
    ? 'over'
    : r.outcome === 'failed'
      ? 'failed'
      : r.outcome === 'done'
        ? 'awaiting-merge'
        : 'stopped'

/** One row per ticket of the feature, from the ledger, the stored records and the git snapshot. */
export function agentRows(args: {
  tickets: readonly TicketRow[]
  ledger: BuildLedger
  records: Readonly<Record<string, AgentRecord>>
  worktrees: readonly Worktree[]
  config: CraftoryConfig
  integrationBranch: string
  now: Millis
}): AgentRow[] {
  const { tickets, ledger, records, worktrees, config, integrationBranch, now } = args
  const byNumber = [...tickets].sort(
    (a, b) => Number(a.issue.ref.slice(1)) - Number(b.issue.ref.slice(1)),
  )
  return byNumber.map((row): AgentRow => {
    const ref = row.issue.ref
    const run = runOf(ledger, ref)
    const record = records[ref]
    const base: Omit<AgentRow, 'status'> = {
      ref,
      title: row.issue.title,
      step: null,
      tokens: 0,
      budget: budgetFor(config, record),
      elapsedMs: null,
      worktree: null,
      branch: null,
      added: null,
      deleted: null,
      commits: null,
      note: null,
    }
    const withGit = (path: string): Partial<AgentRow> => {
      const w = worktrees.find(x => samePath(x.path, path))
      if (w === undefined) return {}
      return {
        added: w.added,
        deleted: w.deleted,
        commits: [
          plural(w.commits, 'commit'),
          ...(w.behind > 0 ? [`${w.behind} behind`] : []),
        ].join(' · '),
      }
    }
    if (row.status === 'merged') {
      const kept = record !== undefined && worktrees.some(w => samePath(w.path, record.worktree))
      return {
        ...base,
        status: 'merged',
        tokens: record?.tokens ?? 0,
        elapsedMs: elapsedOf(record),
        note: `merged into ${integrationBranch} · worktree ${kept ? 'kept' : 'removed'}`,
      }
    }
    if (run?.status === 'running') {
      const status: RowStatus =
        run.budgetState === 'over'
          ? 'over'
          : run.isStopping
            ? 'stopped'
            : run.budgetState === 'near'
              ? 'near'
              : 'running'
      return {
        ...base,
        status,
        step: run.tddStep,
        tokens: run.tokens,
        budget: run.budget,
        elapsedMs: now - run.startedAt,
        worktree: run.worktree,
        branch: run.branch,
        ...withGit(run.worktree),
      }
    }
    if (record !== undefined) {
      return {
        ...base,
        status: recordRowStatus(record),
        tokens: record.tokens,
        elapsedMs: elapsedOf(record),
        worktree: record.worktree,
        branch: record.branch,
        note:
          record.outcome === 'over-budget' && record.tokens < record.budget
            ? `budget raised to ${budgetK(record.budget)} · run it again to continue`
            : null,
        ...withGit(record.worktree),
      }
    }
    if (row.status === 'human') {
      return { ...base, status: 'needs-you', note: 'ready-for-human · not for agents' }
    }
    if (row.status === 'blocked') {
      return { ...base, status: 'queued', note: `waits for ${row.blockedBy.join(', ')}` }
    }
    return {
      ...base,
      status: 'queued',
      note: ledger.isPaused
        ? 'paused'
        : ledger.queued.includes(ref)
          ? 'waits for a free slot'
          : 'ready to start',
    }
  })
}

const elapsedOf = (record: AgentRecord | undefined): number | null => {
  if (record === undefined) return null
  const end =
    record.endedAt === undefined ? Date.parse(record.startedAt) : Date.parse(record.endedAt)
  const ms = end - Date.parse(record.startedAt)
  return Number.isFinite(ms) ? ms : null
}

export const ROW_LABELS: Record<RowStatus, string> = {
  merged: 'Merged',
  'awaiting-merge': 'Done',
  running: 'Running',
  queued: 'Queued',
  'needs-you': 'Needs you',
  near: 'Near budget',
  over: 'Over budget',
  failed: 'Failed',
  stopped: 'Stopped',
}

/** `2 running · 1 merged · 1 queued · 1 for you`. */
export function agentSummary(rows: readonly AgentRow[]): string {
  const n = (...statuses: RowStatus[]) => rows.filter(r => statuses.includes(r.status)).length
  const parts: [number, string][] = [
    [n('running', 'near'), 'running'],
    [n('over'), 'over budget'],
    [n('failed'), 'failed'],
    [n('stopped'), 'stopped'],
    [n('awaiting-merge'), 'to merge'],
    [n('merged'), 'merged'],
    [n('queued'), 'queued'],
    [n('needs-you'), 'for you'],
  ]
  return parts.flatMap(([count, word]) => (count > 0 ? [`${count} ${word}`] : [])).join(' · ')
}

export const kTokens = (n: number) => (n === 0 ? '0' : `${(n / 1000).toFixed(1)}k`)

/** `4m 01s`, or an em dash before the agent started. */
export function elapsedText(ms: number | null): string {
  if (ms === null || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
