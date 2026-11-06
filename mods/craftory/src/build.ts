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
  StopCause,
  Worktree,
} from '../types'
import { slugify, ticketBranchFor } from './config'
import type { Flow, TicketRow } from './evidence'
import { normalise, withSlash } from './files'
import { byNumber, refSlug } from './tracker/refs'

export const EMPTY_LEDGER: BuildLedger = { pending: {}, runs: {}, queued: [], isPaused: false }

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

export const budgetFor = (config: CraftoryConfig, record: AgentRecord | undefined): number =>
  Math.max(config.worktrees.tokenBudget, record?.budget ?? 0)

export const budgetK = (budget: number) => `${Math.round(budget / 1000)}k`

export function agentName(ref: IssueRef, title: string, taken: ReadonlySet<string>): string {
  const base = `craftory-${refSlug(ref)}-${slugify(title, 4, 32)}`.replace(/-$/, '')
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

function sortCopy(entries: readonly string[]): { copy: string[]; rejectedCopy: string[] } {
  const copy: string[] = []
  const rejectedCopy: string[] = []
  for (const entry of entries) {
    const clean = normalise(entry)
    if (clean === undefined || clean.split('/').includes('.git')) rejectedCopy.push(entry)
    else copy.push(clean)
  }
  return { copy, rejectedCopy }
}

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
    path: `${withSlash(worktrees.folder)}${refSlug(ref)}-${slugify(title, 4, 32)}`,
    base: integrationBranch,
    setup: splitArgv(worktrees.setup),
    ...sortCopy(worktrees.copy),
  }
}

export function splitArgv(command: string): string[] | null {
  const argv: string[] = []
  const word = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of command.matchAll(word)) argv.push(m[1] ?? m[2] ?? m[3] ?? '')
  return argv.length === 0 ? null : argv
}

const liveRuns = (ledger: BuildLedger) =>
  Object.values(ledger.runs).filter(run => run.status === 'running')

export const runningTickets = (ledger: BuildLedger): IssueRef[] => [
  ...liveRuns(ledger).map(run => run.ticket),
  ...Object.values(ledger.pending).map(seat => seat.plan.ticket),
]

export const slotsUsed = (ledger: BuildLedger) => runningTickets(ledger).length

export const runOf = (ledger: BuildLedger, ticket: IssueRef): AgentRun | undefined =>
  Object.values(ledger.runs)
    .filter(run => run.ticket === ticket)
    .sort((a, b) => b.startedAt - a.startedAt)[0]

export const isBuilding = (flow: Flow | null): boolean => {
  const kind = flow?.phases.find(s => s.phase === 'build')?.state.kind
  return kind === 'running' || kind === 'needs-you' || kind === 'over-budget' || kind === 'failed'
}

/**
 * The Agent input without `isolation`: the engine refuses a spawn that has both `cwd` and
 * `isolation: 'worktree'`, and Craftory seats the agent through `cwd`.
 */
export const withoutIsolation = <T extends object>(call: T): Omit<T, 'isolation'> =>
  Object.fromEntries(Object.entries(call).filter(([key]) => key !== 'isolation')) as Omit<
    T,
    'isolation'
  >

const TICKET_REF = /#\d+/g

const namedIn = (text: string, known: ReadonlySet<string>): string[] => [
  ...new Set((text.match(TICKET_REF) ?? []).filter(ref => known.has(ref))),
]

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

export const integrationContext = (args: { branch: string; from: string | null; folder: string }) =>
  `Craftory: use \`${args.branch}\` as the integration branch (create it from \`${args.from ?? 'the current branch'}\` if it does not exist); ` +
  `implementer worktrees live under \`${withSlash(args.folder)}\`.`

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

export const dropPending = (ledger: BuildLedger, toolUseId: string): BuildLedger => {
  if (!(toolUseId in ledger.pending)) return ledger
  return {
    ...ledger,
    pending: Object.fromEntries(Object.entries(ledger.pending).filter(([id]) => id !== toolUseId)),
  }
}

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
    stop: null,
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
    stop: run.stop ?? (state === 'over' ? { cause: 'budget', isDelivered: false } : null),
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
      : reason === 'aborted' || run.stop?.isDelivered === true
        ? 'stopped'
        : 'done'
  const finished: AgentRun = { ...run, status, lastAt: at }
  return { ledger: { ...ledger, runs: { ...ledger.runs, [agentId]: finished } }, run: finished }
}

/** The ticket's running agents get the new budget, and their budget state is judged against it. */
export function raiseRunBudget(ledger: BuildLedger, ticket: IssueRef, budget: number): BuildLedger {
  return {
    ...ledger,
    runs: Object.fromEntries(
      Object.entries(ledger.runs).map(([id, run]) => [
        id,
        run.ticket === ticket && run.status === 'running'
          ? { ...run, budget, budgetState: budgetState(run.tokens, budget) }
          : run,
      ]),
    ),
  }
}

export const isoOf = (ms: Millis): IsoTime => new Date(ms).toISOString()

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

export const pauseText =
  'Craftory: the user paused Build. Finish the step you are on, commit, report where you stopped, then end.'

export const markStopping = (
  ledger: BuildLedger,
  agentId: AgentId,
  cause: StopCause,
): BuildLedger => patchRun(ledger, agentId, { stop: { cause, isDelivered: false } })

export const deliverStop = (ledger: BuildLedger, agentId: AgentId): BuildLedger => {
  const stop = ledger.runs[agentId]?.stop
  return stop ? patchRun(ledger, agentId, { stop: { ...stop, isDelivered: true } }) : ledger
}

const keptNote = (run: AgentRun) => `Its worktree ${run.worktree} is kept`

/**
 * What the parent model reads as the Agent result once Craftory has ended an agent at its next
 * step. The agent itself never takes another turn, so nothing sent to it would be read.
 */
export const stoppedAnswer = (run: AgentRun): string => {
  const { ticket } = run
  const cause = run.stop?.cause ?? 'budget'
  switch (cause) {
    case 'conflict':
      return (
        `Stopped by Craftory: ${ticket} stopped on a merge conflict after the integration branch moved, and was ended. ` +
        `${keptNote(run)}. Do not restart ${ticket}, merge, or remove the worktree. ` +
        'Tell the user which files conflict and that they resolve it, then carry on with the other tickets.'
      )
    case 'budget':
      return (
        `Stopped by Craftory: ${ticket} reached its ${budgetK(run.budget)} token budget and was ended before it finished. ` +
        `${keptNote(run)} with what it committed. Do not restart ${ticket} or remove the worktree. ` +
        'Tell the user it ran out of budget, which the Craftory band lets them raise, and carry on with the other tickets.'
      )
    default: {
      const _exhaustive: never = cause
      return _exhaustive
    }
  }
}

export const stoppedStep = (turnId: string, index: number, run: AgentRun) => ({
  turnId,
  index,
  answer: stoppedAnswer(run),
  toolUses: [],
  stopReason: 'end_turn' as const,
  usage: null,
})

export function moveNotices(
  ledger: BuildLedger,
  worktrees: readonly Pick<Worktree, 'path' | 'behind'>[],
  integrationBranch: string,
): { agentId: AgentId; text: string }[] {
  return liveRuns(ledger).flatMap(run => {
    const behind = worktrees.find(w => samePath(w.path, run.worktree))?.behind ?? 0
    if (behind === 0 || run.stop !== null) return []
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

export const samePath = (absolute: string, relative: string) => {
  const a = absolute.replace(/\/+$/, '')
  const r = relative.replace(/^\.\//, '').replace(/\/+$/, '')
  return a === r || a.endsWith(`/${r}`)
}

export type KeepWhy = 'running' | 'unmerged' | 'failed' | 'over-budget' | 'stopped'

const USER_DECIDES = ', and the user decides what happens to its work'

export const KEEP_REASONS: Record<KeepWhy, string> = {
  running: 'an agent is still working in it',
  unmerged: `its work is not merged yet${USER_DECIDES}`,
  failed: `its agent failed${USER_DECIDES}`,
  'over-budget': `its agent ran out of token budget${USER_DECIDES}`,
  stopped: `its agent was stopped${USER_DECIDES}`,
}

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
  step: string | null
  tokens: number
  budget: number
  elapsedMs: number | null
  worktree: string | null
  branch: string | null
  added: number | null
  deleted: number | null
  commits: string | null
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
  return [...tickets]
    .sort((a, b) => byNumber(a.issue, b.issue))
    .map((row): AgentRow => {
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
            : run.stop !== null
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

export function elapsedText(ms: number | null): string {
  if (ms === null || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export type AgentsView = {
  summary: string
  tokens: string
  rows: AgentRow[]
  more: number
  footer: string
  isPaused: boolean
  note: string | null
}

export const MAX_AGENT_ROWS = 8

export function agentsView(args: {
  rows: readonly AgentRow[]
  config: CraftoryConfig
  isPaused: boolean
  note: string | null
}): AgentsView {
  const { rows, config, isPaused, note } = args
  return {
    summary: agentSummary(rows),
    tokens: `${kTokens(rows.reduce((sum, r) => sum + r.tokens, 0))} tokens`,
    rows: rows.slice(0, MAX_AGENT_ROWS),
    more: Math.max(0, rows.length - MAX_AGENT_ROWS),
    footer: `One git worktree per agent · ${budgetK(config.worktrees.tokenBudget)} token budget each`,
    isPaused,
    note,
  }
}

export const hasMeterLine = (row: AgentRow) =>
  row.tokens > 0 || row.step !== null || row.elapsedMs !== null

export const hasWorktreeLine = (row: AgentRow) => row.worktree !== null || row.note !== null

export function barRole(row: AgentRow): 'skill' | 'hook' | 'danger' | 'perm' {
  if (row.status === 'merged') return 'perm'
  const state = budgetState(row.tokens, row.budget)
  return state === 'over' ? 'danger' : state === 'near' ? 'hook' : 'skill'
}

export const barPercent = (row: AgentRow) =>
  Math.min(100, Math.round((row.tokens / Math.max(1, row.budget)) * 100))
