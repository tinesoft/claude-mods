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
  CraftoryConfig,
  Feature,
  Issue,
  IssueRef,
  PhaseId,
  PhaseMark,
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
}

export type Facts = {
  feature: Feature
  spec: Issue | null
  tickets: TicketRow[]
  marks: Partial<Record<PhaseId, PhaseMark>>
  /** The phase the observed skill is working on for this feature. */
  runningPhase: PhaseId | null
}

export type Evidence = { done: true; artifact: string | null } | { done: false; blockers: string[] }

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

/**
 * One rule per phase, `Record<PhaseId, Rule>` so a new phase without a rule fails the build.
 * Rules read tracker state and the feature's marks, never skill text. Build onward are not
 * tracked yet (M4).
 */
export const EVIDENCE: Record<PhaseId, Rule> = {
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
  build: () => ({ done: false, blockers: ['not tracked yet'] }),
  review: () => ({ done: false, blockers: ['not tracked yet'] }),
  ship: () => ({ done: false, blockers: ['not tracked yet'] }),
  retro: () => ({ done: false, blockers: ['not tracked yet'] }),
}

export function factsOf({ feature, tracker, running }: FlowInput): Facts {
  const issues = tracker?.rich ? tracker.issues : []
  const specRef = feature.kind === 'specced' ? feature.record.spec : null
  const byRef = new Map(issues.map(i => [i.ref as string, i]))
  const children = specRef === null ? [] : issues.filter(i => i.parent === specRef).sort(byNumber)
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
  }
}

const skipReason = (input: FlowInput, phase: PhaseId): SkipReason | undefined => {
  const { feature, config } = input
  if (!config.phases[phase].enabled) return 'off'
  if (feature.kind === 'specced' && feature.record.skipped.includes(phase)) return 'feature'
  const entry = feature.kind === 'draft' ? feature.draft.entry : feature.record.entry
  return PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(entry) ? 'entry' : undefined
}

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
    if (live !== null && live.phase === phase) {
      return live.isAwaitingUser
        ? { kind: 'needs-you', meta: live.progress ?? 'waiting on you' }
        : { kind: 'running', progress: live.progress }
    }
    const e = evidence[phase]
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
    if (states[p].kind === 'running' || states[p].kind === 'needs-you')
      return [`${PHASES[p].label} is still running`]
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
    command: config.phases[phase].command ?? null,
    args: phase === 'tickets' || phase === 'build' ? specRef : '',
    artifact: evidence[phase].done ? evidence[phase].artifact : null,
    blockers: blockersOf(phase),
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
