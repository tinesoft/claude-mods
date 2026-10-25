/**
 * Facts to Flow: the one place a phase's state is decided (plan "Phase evidence"). Nothing
 * here is stored. The rail, card, gates, status line and summary all read `Flow`, so an
 * evidence rule exists once.
 *
 * Layers, in order:
 *   1. skipped (off in Settings, skipped for the feature, before the phase it entered at)
 *   2. running or needs-you, from the skill the session observed
 *   3. done, from EVIDENCE[phase]
 *   4. gated: a todo phase whose nearest enabled predecessor has its gate on and is not done
 *   5. next: the first enabled phase after the last done one, when it is still todo
 */
import type {
  AgentRecord,
  BuildLedger,
  CraftoryConfig,
  Feature,
  Issue,
  IssueRef,
  PhaseId,
  PhaseMark,
  PullRequest,
  Running,
  SkillName,
  TrackerSnapshot,
} from '../types'
import { PHASE_ORDER, PHASES, predecessor } from './phases'

export type SkipReason = 'off' | 'feature' | 'entry'

export type StepState =
  | { kind: 'done'; artifact: string | null }
  | { kind: 'running'; progress: string | null }
  | { kind: 'needs-you'; meta: string }
  | { kind: 'failed'; meta: string }
  | { kind: 'over-budget'; ticket: IssueRef; budget: number }
  | { kind: 'next' }
  | { kind: 'gated'; by: PhaseId; blockers: string[] }
  | { kind: 'skipped'; why: SkipReason }
  | { kind: 'todo' }

export type Step = {
  phase: PhaseId
  state: StepState
  /** The command this phase submits for this feature (the config choice), or null (Review, Ship). */
  command: SkillName | null
  /** What the rail submits after the command: the spec ref for to-tickets and implement-spec. */
  args: string
  /** The artifact line on the card, from evidence or the feature's marks. */
  artifact: string | null
  /** Why a not-done phase is not done; feeds the gate text. */
  blockers: string[]
  /** The card offers Mark done: the phase is open and nothing else could show it done. */
  canMarkDone: boolean
}

export type TicketStatus = 'merged' | 'ready' | 'blocked' | 'human' | 'open'

export type TicketRow = { issue: Issue; status: TicketStatus; blockedBy: IssueRef[] }

export type Flow = {
  feature: Feature
  title: string
  steps: Step[] // always PHASE_ORDER, one per phase
  next: PhaseId | null
  current: PhaseId | null // running or needs-you
  doneCount: number
  enabledCount: number
  spec: Issue | null
  tickets: TicketRow[]
}

export type FlowInput = {
  feature: Feature
  config: CraftoryConfig
  tracker: TrackerSnapshot | null
  running: Running | null
  /** The live Build ledger: agents still working keep Build running after the skill's turn ends. */
  build?: BuildLedger | null
}

export type Facts = {
  feature: Feature
  spec: Issue | null
  tickets: TicketRow[]
  marks: Partial<Record<PhaseId, PhaseMark>>
  /** The phase the observed skill is working on for this feature. */
  runningPhase: PhaseId | null
  /** The pull request from the feature's integration branch, when the tracker has one. */
  pr: PullRequest | null
  /** Agents still working for this feature. */
  liveAgents: number
  /** The tracker holds issues and a pull request to read: false on GitLab and Other. */
  hasTrackerEvidence: boolean
}

export type Evidence =
  | { done: true; artifact: string | null }
  /** `artifact` on a phase not yet done is what it works on, such as the integration branch. */
  | { done: false; blockers: string[]; artifact?: string | null }

export type Rule = (facts: Facts) => Evidence

const isMerged = (issue: Issue) => issue.status === 'done' || issue.status === 'closed'

const ticketStatus = (issue: Issue, byRef: ReadonlyMap<string, Issue>): TicketStatus => {
  if (isMerged(issue)) return 'merged'
  if (issue.role === 'ready-for-human') return 'human'
  const open = issue.blockedBy.filter(ref => {
    const blocker = byRef.get(ref)
    return blocker === undefined || !isMerged(blocker)
  })
  if (open.length > 0) return 'blocked'
  return issue.role === 'ready-for-agent' || issue.role === null ? 'ready' : 'open'
}

const byNumber = (a: Issue, b: Issue) => Number(a.ref.slice(1)) - Number(b.ref.slice(1))

const count = (rows: readonly TicketRow[], status: TicketStatus) =>
  rows.filter(r => r.status === status).length

/** `#43 to #47 · 1 ready, 4 blocked`, the Tickets card's artifact line. */
export function ticketsLine(rows: readonly TicketRow[]): string {
  const refs = rows.map(r => r.issue).sort(byNumber)
  const span = refs.length > 1 ? `${refs[0]!.ref} to ${refs.at(-1)!.ref}` : refs[0]!.ref
  const parts = (
    [
      ['merged', 'merged'],
      ['ready', 'ready'],
      ['blocked', 'blocked'],
      ['human', 'for you'],
      ['open', 'open'],
    ] as const
  ).flatMap(([status, word]) => {
    const n = count(rows, status)
    return n > 0 ? [`${n} ${word}`] : []
  })
  return [span, ...(parts.length > 0 ? [parts.join(', ')] : [])].join(' · ')
}

const laterStarted = (f: Facts, phase: PhaseId) =>
  PHASE_ORDER.slice(PHASE_ORDER.indexOf(phase) + 1).some(
    p => f.marks[p]?.ranAt !== undefined || f.runningPhase === p,
  )

const integrationBranchOf = (f: Facts): string | null =>
  f.feature.kind === 'specced' ? f.feature.record.integrationBranch || null : null

const listRefs = (rows: readonly TicketRow[]) => {
  const refs = rows.map(r => r.issue.ref)
  return refs.length > 3
    ? `${refs.slice(0, 3).join(', ')} and ${refs.length - 3} more`
    : refs.join(', ')
}

const agentsOf = (f: Facts): AgentRecord[] =>
  f.feature.kind === 'specced' ? Object.values(f.feature.record.agents) : []

/** When the newest implementer finished, as milliseconds; 0 with none. */
const lastMergeAt = (f: Facts): number =>
  Math.max(
    0,
    ...agentsOf(f)
      .filter(a => a.outcome === 'done' && a.endedAt !== undefined)
      .map(a => Date.parse(a.endedAt!)),
  )

/**
 * One rule per phase, `Record<PhaseId, Rule>` so a new phase without a rule fails the build.
 * Rules read tracker state, the feature's marks and its agent records, never skill text.
 * Review is Build's close-out (`code-review` ended after the last ticket merged); Ship is the
 * pull request from the integration branch being ready for review; Retro is `retro` after Ship.
 * A phase a person marks done is done.
 */
const RULES: Record<PhaseId, Rule> = {
  align: f => {
    const mark = f.marks.align
    const artifact = mark?.artifacts?.join(' · ') ?? null
    if (mark?.markedDoneAt !== undefined) return { done: true, artifact }
    if (mark?.ranAt !== undefined && (laterStarted(f, 'align') || f.spec !== null))
      return { done: true, artifact }
    return {
      done: false,
      blockers: [mark?.ranAt !== undefined ? 'the grill has not ended' : 'not run yet'],
    }
  },
  spec: f => {
    if (f.spec !== null) return { done: true, artifact: f.spec.location }
    // A specced feature has its spec by construction, even before the tracker has been read.
    if (f.feature.kind === 'specced') return { done: true, artifact: f.feature.record.spec }
    return { done: false, blockers: ['no spec has been published yet'] }
  },
  tickets: f => {
    if (f.tickets.length === 0) return { done: false, blockers: ['no tickets yet'] }
    if (f.tickets.length > 1 && f.tickets.every(t => t.issue.blockedBy.length === 0))
      return { done: false, blockers: ['the tickets have no blocking edges'] }
    return { done: true, artifact: ticketsLine(f.tickets) }
  },
  build: f => {
    const branch = integrationBranchOf(f)
    const work = f.tickets.filter(t => t.status !== 'human')
    if (work.length === 0)
      return { done: false, blockers: ['no tickets to build'], artifact: branch }
    const open = work.filter(t => t.status !== 'merged')
    if (open.length === 0) return { done: true, artifact: branch }
    return { done: false, blockers: [`${listRefs(open)} not merged yet`], artifact: branch }
  },
  review: f => {
    const mark = f.marks.review
    const branch = integrationBranchOf(f)
    if (mark?.markedDoneAt !== undefined) return { done: true, artifact: branch }
    const build = EVIDENCE.build(f)
    if (!build.done) return { done: false, blockers: ['Build is not done'] }
    if (mark?.ranAt === undefined)
      return { done: false, blockers: ['code-review has not run on the integration branch'] }
    if (mark.endedAt === undefined)
      return { done: false, blockers: ['the review has not finished'] }
    // A ticket merged after the review ended means the diff changed under it.
    if (lastMergeAt(f) > Date.parse(mark.endedAt))
      return { done: false, blockers: ['a ticket merged after the last review'] }
    return { done: true, artifact: branch }
  },
  ship: f => {
    if (f.marks.ship?.markedDoneAt !== undefined) return { done: true, artifact: f.pr?.url ?? null }
    const pr = f.pr
    if (pr === null) return { done: false, blockers: ['no pull request yet'] }
    if (pr.state === 'closed') return { done: false, blockers: ['the pull request was closed'] }
    if (pr.state === 'open' && pr.isDraft)
      return {
        done: false,
        blockers: ['the pull request is still a draft'],
        artifact: `${pr.ref} (draft)`,
      }
    return { done: true, artifact: pr.url }
  },
  retro: f => {
    const mark = f.marks.retro
    if (mark?.markedDoneAt !== undefined) return { done: true, artifact: null }
    if (!EVIDENCE.ship(f).done) return { done: false, blockers: ['Ship is not done'] }
    if (mark?.ranAt === undefined) return { done: false, blockers: ['not run yet'] }
    if (mark.endedAt === undefined) return { done: false, blockers: ['the retro has not finished'] }
    return { done: true, artifact: null }
  },
}

/** Whether a person's mark can stand in for the evidence of `phase` on this tracker. */
export const canMark = (f: Facts, phase: PhaseId): boolean =>
  PHASES[phase].markDone === 'always' || !f.hasTrackerEvidence

/** The rules, with a person's mark standing in wherever the phase's `markDone` allows it. */
export const EVIDENCE = Object.fromEntries(
  PHASE_ORDER.map((phase): [PhaseId, Rule] => [
    phase,
    f => {
      const evidence = RULES[phase](f)
      return !evidence.done && canMark(f, phase) && f.marks[phase]?.markedDoneAt !== undefined
        ? { done: true, artifact: evidence.artifact ?? null }
        : evidence
    },
  ]),
) as Record<PhaseId, Rule>

const buildProgress = (f: Facts): string | null => {
  const work = f.tickets.filter(t => t.status !== 'human')
  return work.length === 0
    ? null
    : `${work.filter(t => t.status === 'merged').length}/${work.length}`
}

/** An agent that failed or ran out of budget and whose ticket is still unmerged needs the user. */
function buildAttention(f: Facts): StepState | undefined {
  const merged = new Set(
    f.tickets.filter(t => t.status === 'merged').map(t => t.issue.ref as string),
  )
  const open = agentsOf(f).filter(a => !merged.has(a.ticket))
  const over = open.find(a => a.outcome === 'over-budget' && a.tokens >= a.budget)
  if (over !== undefined) return { kind: 'over-budget', ticket: over.ticket, budget: over.budget }
  const failed = open.find(a => a.outcome === 'failed')
  return failed === undefined ? undefined : { kind: 'failed', meta: `${failed.ticket} failed` }
}

/**
 * A feature that entered at Build from an issue (a ready-for-agent bug) has no spec and no
 * tickets: the issue is the one unit of work, so it stands in as its own ticket.
 */
export const isSelfEntry = (feature: Feature): boolean =>
  feature.kind === 'specced' &&
  feature.record.entry === 'build' &&
  feature.record.enteredFrom === feature.record.spec

export function factsOf({ feature, tracker, running, build }: FlowInput): Facts {
  const issues = tracker?.rich ? tracker.issues : []
  const specRef = feature.kind === 'specced' ? feature.record.spec : null
  const byRef = new Map(issues.map(i => [i.ref as string, i]))
  const own = specRef === null ? [] : issues.filter(i => i.parent === specRef).sort(byNumber)
  const itself = specRef === null ? undefined : byRef.get(specRef)
  const children = own.length === 0 && isSelfEntry(feature) && itself ? [itself] : own
  const live =
    running !== null && (running.feature === null || running.feature === feature.key)
      ? running.phase
      : null
  return {
    feature,
    spec: specRef === null ? null : (byRef.get(specRef) ?? null),
    tickets: children.map(issue => ({
      issue,
      status: ticketStatus(issue, byRef),
      blockedBy: issue.blockedBy,
    })),
    marks: feature.kind === 'draft' ? feature.draft.marks : feature.record.marks,
    runningPhase: live,
    pr: tracker?.rich ? tracker.pr : null,
    liveAgents: Object.values(build?.runs ?? {}).filter(r => r.status === 'running').length,
    hasTrackerEvidence: tracker?.rich ?? true,
  }
}

const skipReason = (input: FlowInput, phase: PhaseId): SkipReason | undefined => {
  const { feature, config } = input
  if (!config.phases[phase].enabled) return 'off'
  if (feature.kind === 'specced' && feature.record.skipped.includes(phase)) return 'feature'
  const entry = feature.kind === 'draft' ? feature.draft.entry : feature.record.entry
  return PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(entry) ? 'entry' : undefined
}

/** A mark is offered while the phase waits; a running, failed or skipped phase has more pressing buttons. */
const OPEN_FOR_MARK: ReadonlySet<StepState['kind']> = new Set(['todo', 'next', 'gated'])

export function deriveFlow(input: FlowInput): Flow {
  const { feature, config, running } = input
  const facts = factsOf(input)
  const live = facts.runningPhase === null ? null : running
  const evidence = Object.fromEntries(PHASE_ORDER.map(p => [p, EVIDENCE[p](facts)])) as Record<
    PhaseId,
    Evidence
  >
  const kindOf = (phase: PhaseId): StepState => {
    const why = skipReason(input, phase)
    if (why !== undefined) return { kind: 'skipped', why }
    const e = evidence[phase]
    if (phase === 'build' && !e.done) {
      const attention = buildAttention(facts)
      if (attention !== undefined) return attention
    }
    const progress = phase === 'build' ? buildProgress(facts) : null
    if (live !== null && live.phase === phase) {
      return live.isAwaitingUser
        ? { kind: 'needs-you', meta: live.progress ?? 'waiting on you' }
        : { kind: 'running', progress: live.progress ?? progress }
    }
    if (phase === 'build' && !e.done && facts.liveAgents > 0) return { kind: 'running', progress }
    if (e.done) return { kind: 'done', artifact: e.artifact }
    return { kind: 'todo' }
  }
  const states = Object.fromEntries(PHASE_ORDER.map(p => [p, kindOf(p)])) as Record<
    PhaseId,
    StepState
  >
  const on = (p: PhaseId) => states[p].kind !== 'skipped'
  const blockersOf = (p: PhaseId) => {
    const e = evidence[p]
    const state = states[p]
    if (state.kind === 'running' || state.kind === 'needs-you')
      return [`${PHASES[p].label} is still running`]
    if (state.kind === 'over-budget')
      return [`${state.ticket} hit its ${Math.round(state.budget / 1000)}k token budget`]
    if (state.kind === 'failed') return [state.meta]
    return e.done ? [] : e.blockers
  }

  for (const phase of PHASE_ORDER) {
    if (states[phase].kind !== 'todo') continue
    const by = predecessor(phase, on)
    if (by !== undefined && config.phases[by].gate && states[by].kind !== 'done') {
      states[phase] = { kind: 'gated', by, blockers: blockersOf(by) }
    }
  }
  const lastDone = PHASE_ORDER.findLastIndex(p => states[p].kind === 'done')
  const candidate = PHASE_ORDER.slice(lastDone + 1).find(on)
  if (candidate !== undefined && config.automation.suggestNext && states[candidate].kind === 'todo')
    states[candidate] = { kind: 'next' }

  const spec = facts.spec
  const specRef = feature.kind === 'specced' ? feature.record.spec : ''
  const steps = PHASE_ORDER.map((phase): Step => ({
    phase,
    state: states[phase],
    command:
      phase === 'build' && isSelfEntry(feature)
        ? PHASES.build.commands[1]
        : (config.phases[phase].command ?? null),
    args: phase === 'tickets' || phase === 'build' ? specRef : '',
    artifact: evidence[phase].artifact ?? null,
    blockers: blockersOf(phase),
    canMarkDone: canMark(facts, phase) && OPEN_FOR_MARK.has(states[phase].kind),
  }))
  return {
    feature,
    title:
      spec?.title ||
      (feature.kind === 'draft' ? feature.draft.title : feature.record.title) ||
      'Untitled feature',
    steps,
    next: steps.find(s => s.state.kind === 'next')?.phase ?? null,
    current:
      steps.find(s => s.state.kind === 'running' || s.state.kind === 'needs-you')?.phase ?? null,
    doneCount: steps.filter(s => s.state.kind === 'done').length,
    enabledCount: steps.filter(s => s.state.kind !== 'skipped').length,
    spec,
    tickets: facts.tickets,
  }
}

/** Issues outside every feature that wait for triage: the number on the rail's Inbox button. */
export const waitingForTriage = (tracker: TrackerSnapshot | null): number =>
  tracker?.rich
    ? tracker.issues.filter(i => i.kind === 'issue' && i.role === 'needs-triage').length
    : 0
