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
import { byNumber } from './tracker/refs'
import type { Term } from '../types'

export const TABS: readonly { id: PaneTab; hotkey: string; title: string }[] = [
  { id: 'flow', hotkey: '1', title: 'Flow' },
  { id: 'tickets', hotkey: '2', title: 'Tickets' },
  { id: 'worktrees', hotkey: '3', title: 'Worktrees' },
  { id: 'glossary', hotkey: '4', title: 'Glossary' },
  { id: 'settings', hotkey: '5', title: 'Settings' },
]

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

export type FlowRowView = {
  phase: PhaseId
  n: number
  label: string
  command: string
  state: Flow['phases'][number]['state']['kind']
  result: string
}

const SKIPPED: Record<SkipReason, string> = {
  off: 'off in Settings',
  feature: 'left out for this feature',
  entry: 'this feature entered later',
}

export function flowRows(flow: Flow): FlowRowView[] {
  return flow.phases.map(view => {
    const spec = PHASES[view.phase]
    const s = view.state
    const result = ((): string => {
      switch (s.kind) {
        case 'done':
          return view.artifact === null ? 'Done' : `${spec.artifactLabel}: ${view.artifact}`
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
    const command = view.command ?? spec.helpers[0]
    return {
      phase: view.phase,
      n: spec.n,
      label: spec.label,
      command: command === undefined ? '' : `/${command}`,
      state: s.kind,
      result,
    }
  })
}

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
  label: string | null
}

export type TicketRowView = {
  ref: IssueRef
  title: string
  status: TicketStatus
  statusLabel: string
  blockedBy: IssueRef[]
  command: string | null
}

export type TicketsView = {
  header: string
  folder: string | null
  showInbox: boolean
  inbox: InboxRowView[]
  specLabel: string | null
  tickets: TicketRowView[]
  runAll: string | null
  links: { items: TrackerLink[]; note: string | null } | null
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

function inboxRow(issue: Issue, role: TriageRole, enterAt: EnterAt): InboxRowView {
  const bug = issue.isBug ? ' · bug' : ''
  if (issue.kind === 'spec') {
    return {
      ref: issue.ref,
      title: issue.title,
      role,
      note: `Spec without a feature · Enters at ${PHASES.tickets.label}`,
      action: { kind: 'start', ref: issue.ref, phase: 'tickets' },
      label: 'Start feature',
    }
  }
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
        .filter(
          i =>
            (i.kind === 'issue' || (i.kind === 'spec' && i.role === 'ready-for-agent')) &&
            i.status === 'open' &&
            !featureSpecs.has(i.ref),
        )
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
    folder: tracker.kind === 'local' ? '.scratch/' : null,
    showInbox: config.entry.triage.enabled,
    inbox,
    specLabel: spec === null ? null : `Spec ${spec} · tickets`,
    tickets,
    runAll: spec !== null && unmerged ? `/implement-spec ${spec} · run all in parallel` : null,
    links: null,
    count: inbox.length + tickets.length,
  }
}

export type GlossaryView = {
  terms: (Term & { isNew: boolean })[]
  total: number
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
