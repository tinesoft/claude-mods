/**
 * What each pane tab says, as plain data. `pane.tsx` draws these views and `register.tsx` builds
 * them from the atoms, so the words are testable without an engine and one rule names a state
 * once (the Flow tab reads the same `Flow` as the rail).
 */
import type {
  CraftoryConfig,
  EnterAt,
  GlossaryDoc,
  Issue,
  IssueRef,
  Loaded,
  PaneTab,
  PhaseId,
  TrackerLink,
  TrackerSnapshot,
  TriageRole,
} from '../types'
import { budgetK } from './build'
import type { Flow, SkipReason, TicketStatus } from './evidence'
import { PHASES } from './phases'
import { termKey, termsOf } from './glossary'
import type { Term } from '../types'

// ─── Tabs ───────────────────────────────────────────────────────────────────────────────

export const TABS: readonly { id: PaneTab; hotkey: string; title: string }[] = [
  { id: 'flow', hotkey: '1', title: 'Flow' },
  { id: 'tickets', hotkey: '2', title: 'Tickets' },
  { id: 'worktrees', hotkey: '3', title: 'Worktrees' },
  { id: 'glossary', hotkey: '4', title: 'Glossary' },
  { id: 'settings', hotkey: '5', title: 'Settings' },
]

/** The number beside each tab title; absent where the tab has nothing to count yet. */
export type TabCounts = Partial<Record<PaneTab, string>>

export function tabCounts(args: {
  flow: Flow | null
  tickets: TicketsView
  worktrees: number | null
  terms: number | null
}): TabCounts {
  const { flow, tickets, worktrees, terms } = args
  return {
    ...(flow !== null && { flow: `${flow.doneCount}/${flow.enabledCount}` }),
    ...(tickets.count > 0 && { tickets: String(tickets.count) }),
    ...(worktrees !== null && { worktrees: String(worktrees) }),
    ...(terms !== null && { glossary: String(terms) }),
  }
}

// ─── Flow ───────────────────────────────────────────────────────────────────────────────

export type FlowRowView = {
  phase: PhaseId
  n: number
  label: string
  /** `/to-spec`, or the helper Review and Ship are reached through. */
  command: string
  state: Flow['steps'][number]['state']['kind']
  result: string
}

const SKIPPED: Record<SkipReason, string> = {
  off: 'off in Settings',
  feature: 'left out for this feature',
  entry: 'this feature entered later',
}

export function flowRows(flow: Flow): FlowRowView[] {
  return flow.steps.map(step => {
    const spec = PHASES[step.phase]
    const s = step.state
    const result = ((): string => {
      switch (s.kind) {
        case 'done':
          return step.artifact === null ? 'Done' : `${spec.artifactLabel}: ${step.artifact}`
        case 'running':
          return s.progress === null ? 'Running' : `Running · ${s.progress}`
        case 'needs-you':
          return `Waiting on you · ${s.meta}`
        case 'failed':
          return s.meta
        case 'over-budget':
          return `${s.ticket} hit its ${budgetK(s.budget)} budget`
        case 'gated':
          return `Gated · ${s.blockers.join(', ') || `${PHASES[s.by].label} is not done`}`
        case 'skipped':
          return `Skipped · ${SKIPPED[s.why]}`
        case 'next':
        case 'todo':
          return spec.why
        default: {
          const _exhaustive: never = s
          return _exhaustive
        }
      }
    })()
    const command = step.command ?? spec.helpers[0]
    return {
      phase: step.phase,
      n: spec.n,
      label: spec.label,
      command: command === undefined ? '' : `/${command}`,
      state: s.kind,
      result,
    }
  })
}

// ─── Tickets ────────────────────────────────────────────────────────────────────────────

/** Where a ready-for-agent issue enters the flow, from Settings › Entry points. */
export function enterPhaseOf(issue: Pick<Issue, 'isBug'>, enterAt: EnterAt): PhaseId {
  if (enterAt === 'tickets') return 'tickets'
  return enterAt === 'bugs-build-else-align' && issue.isBug ? 'build' : 'align'
}

export type InboxAction =
  { kind: 'triage'; ref: IssueRef } | { kind: 'start'; ref: IssueRef; phase: PhaseId }

export type InboxRowView = {
  ref: IssueRef
  title: string
  role: TriageRole
  note: string
  action: InboxAction | null
  /** The button's text: `/triage #51` or `Start feature`. */
  label: string | null
}

export type TicketRowView = {
  ref: IssueRef
  title: string
  status: TicketStatus
  statusLabel: string
  blockedBy: IssueRef[]
  /** `/implement #44`, only on a ticket an agent can take now. */
  command: string | null
}

export type TicketsView = {
  header: string
  /** The folder Open folder copies; null for a tracker that has none. */
  folder: string | null
  /** False when Settings turns triage off. */
  showInbox: boolean
  inbox: InboxRowView[]
  /** Specs and tickets, when the tracker can be read. */
  specLabel: string | null
  tickets: TicketRowView[]
  runAll: string | null
  /** Links and the user's own note, for a tracker Craftory only links to. */
  links: { items: TrackerLink[]; note: string | null } | null
  /** Inbox plus tickets: the number on the tab. */
  count: number
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  merged: 'Merged',
  ready: 'Ready for agent',
  blocked: 'Blocked',
  human: 'Ready for human',
  open: 'Open',
}

const INBOX_ROLES: readonly TriageRole[] = ['needs-triage', 'ready-for-agent', 'ready-for-human']

const byNumber = (a: Issue, b: Issue) => Number(a.ref.slice(1)) - Number(b.ref.slice(1))

function inboxRow(issue: Issue, role: TriageRole, enterAt: EnterAt): InboxRowView {
  const bug = issue.isBug ? ' · bug' : ''
  if (role === 'needs-triage')
    return {
      ref: issue.ref,
      title: issue.title,
      role,
      note: `Not triaged yet${bug}`,
      action: { kind: 'triage', ref: issue.ref },
      label: `/triage ${issue.ref}`,
    }
  if (role === 'ready-for-agent') {
    const phase = enterPhaseOf(issue, enterAt)
    return {
      ref: issue.ref,
      title: issue.title,
      role,
      note: `Enters at ${PHASES[phase].label}${bug}`,
      action: { kind: 'start', ref: issue.ref, phase },
      label: 'Start feature',
    }
  }
  return {
    ref: issue.ref,
    title: issue.title,
    role,
    note: 'No agent · decision for you',
    action: null,
    label: null,
  }
}

export function ticketsView(args: {
  flow: Flow | null
  tracker: TrackerSnapshot | null
  config: CraftoryConfig
  header: string
  /** Specs that already have a feature: their issue is not an inbox item any more. */
  featureSpecs: ReadonlySet<string>
}): TicketsView {
  const { flow, tracker, config, header, featureSpecs } = args
  const empty = {
    header,
    folder: null,
    showInbox: false,
    inbox: [],
    specLabel: null,
    tickets: [],
    runAll: null,
    links: null,
    count: 0,
  } satisfies TicketsView
  if (tracker === null) return empty
  if (!tracker.rich)
    return { ...empty, links: { items: tracker.links, note: tracker.note }, count: 0 }
  const inbox = config.entry.triage.enabled
    ? tracker.issues
        .filter(i => i.kind === 'issue' && i.status === 'open' && !featureSpecs.has(i.ref))
        .sort(byNumber)
        .flatMap(i =>
          i.role !== null && INBOX_ROLES.includes(i.role)
            ? [inboxRow(i, i.role, config.entry.triage.enterAt)]
            : [],
        )
    : []
  const rows = flow?.tickets ?? []
  const tickets = rows.map((r): TicketRowView => ({
    ref: r.issue.ref,
    title: r.issue.title,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status],
    blockedBy: r.blockedBy,
    command: r.status === 'ready' ? `/implement ${r.issue.ref}` : null,
  }))
  const spec = flow?.feature.kind === 'specced' ? flow.feature.record.spec : null
  const unmerged = rows.some(r => r.status !== 'merged' && r.status !== 'human')
  return {
    header,
    folder: tracker.kind === 'local' ? config.tracker.local.folder : null,
    showInbox: config.entry.triage.enabled,
    inbox,
    specLabel: spec === null ? null : `Spec ${spec} · tickets`,
    tickets,
    runAll: spec !== null && unmerged ? `/implement-spec ${spec} · run all in parallel` : null,
    links: null,
    count: inbox.length + tickets.length,
  }
}

// ─── Glossary ───────────────────────────────────────────────────────────────────────────

export type GlossaryView = {
  /** Terms after the search. */
  terms: (Term & { isNew: boolean })[]
  total: number
  /** `GLOSSARY.md · 3 added this session`, or what is missing. */
  summary: string
  used: Term[]
  hasFile: boolean
}

export function glossaryView(args: {
  doc: Loaded<GlossaryDoc> | undefined
  path: string
  query: string
  used: readonly string[]
  atStart: readonly string[] | null
}): GlossaryView {
  const { doc, path, query, used, atStart } = args
  if (doc?.state !== 'ok')
    return {
      terms: [],
      total: 0,
      summary: doc?.state === 'invalid' ? `${path} could not be read` : `No ${path} yet`,
      used: [],
      hasFile: false,
    }
  const all = termsOf(doc.value)
  const known = new Set(atStart ?? all.map(t => termKey(t.name)))
  const added = all.filter(t => !known.has(termKey(t.name))).length
  const needle = query.trim().toLowerCase()
  const shown = all
    .filter(
      t =>
        needle === '' ||
        [t.name, t.definition, ...t.avoid].some(text => text.toLowerCase().includes(needle)),
    )
    .map(t => ({ ...t, isNew: !known.has(termKey(t.name)) }))
  return {
    terms: shown,
    total: all.length,
    summary: `${path} · ${added} added this session`,
    used: all.filter(t => used.includes(termKey(t.name))),
    hasFile: true,
  }
}
