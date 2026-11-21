import type {
  ContextSnapshot,
  CraftoryConfig,
  EnterAt,
  GlossaryMap,
  Issue,
  IssueRef,
  PaneTab,
  PhaseId,
  TrackerLink,
  TrackerSnapshot,
  TriageRole,
} from '../types'
import { ofBudgetText } from './budgets'
import { budgetK } from './build'
import { phaseButtons, type CardView } from './card-model'
import type { Flow, SkipReason, TicketStatus } from './evidence'
import { PHASES } from './phases'
import {
  contextTermKey,
  contextTermKeys,
  contextTerms,
  mergedTerms,
  termKey,
  termsOf,
} from './glossary'
import { argFor, byNumber } from './tracker/refs'
import type { Term } from '../types'

export const TABS: readonly { id: PaneTab; hotkey: string; title: string }[] = [
  { id: 'flow', hotkey: '1', title: 'Flow' },
  { id: 'tickets', hotkey: '2', title: 'Tickets' },
  { id: 'worktrees', hotkey: '3', title: 'Worktrees' },
  { id: 'glossary', hotkey: '4', title: 'Glossary' },
  { id: 'settings', hotkey: '5', title: 'Settings' },
  // Last, so the hotkeys of the first five keep their meaning.
  { id: 'spend', hotkey: '6', title: 'Spend' },
]

export type TabCounts = Partial<Record<PaneTab, string>>

export function tabCounts(args: {
  flow: Flow | null
  tickets: TicketsView
  worktrees: number | null
  terms: number | null
  /** The active Feature's short spend (`$4.12`); null with none. */
  spend?: string | null
}): TabCounts {
  const { flow, tickets, worktrees, terms, spend } = args
  return {
    ...(flow !== null && { flow: `${flow.doneCount}/${flow.enabledCount}` }),
    ...(tickets.count > 0 && { tickets: String(tickets.count) }),
    ...(worktrees !== null && { worktrees: String(worktrees) }),
    ...(terms !== null && { glossary: String(terms) }),
    ...(spend && { spend }),
  }
}

export type FlowRowView = {
  phase: PhaseId
  n: number
  label: string
  command: string
  state: Flow['phases'][number]['state']['kind']
  result: string
  /** Absent on a row with nothing left to do: done, skipped, or not yet reachable. */
  buttons?: Pick<CardView, 'primary' | 'secondary'>
}

const ACTIONABLE: ReadonlySet<FlowRowView['state']> = new Set([
  'next',
  'needs-you',
  'failed',
  'over-budget',
  'gated',
])

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
          return s.unit === 'tokens'
            ? `${s.ticket} hit its ${budgetK(s.budget)} budget`
            : `Over budget · ${ofBudgetText(s.usd, s.budget)}`
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
      ...(ACTIONABLE.has(s.kind) && { buttons: phaseButtons(view, flow) }),
    }
  })
}

export function enterPhaseOf(issue: Pick<Issue, 'isBug'>, enterAt: EnterAt): PhaseId {
  if (enterAt === 'tickets') return 'tickets'
  return enterAt === 'bugs-build-else-align' && issue.isBug ? 'build' : 'align'
}

export type InboxAction =
  | { kind: 'triage'; ref: IssueRef; arg: string }
  | { kind: 'start'; ref: IssueRef; arg: string; phase: PhaseId }

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
  /** What `/implement` is given for this ticket. */
  arg: string
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
      action: { kind: 'start', ref: issue.ref, arg: argFor([issue], issue.ref), phase: 'tickets' },
      label: 'Start feature',
    }
  }
  if (role === 'needs-triage')
    return {
      ref: issue.ref,
      title: issue.title,
      role,
      note: `Not triaged yet${bug}`,
      action: { kind: 'triage', ref: issue.ref, arg: argFor([issue], issue.ref) },
      label: `/triage ${argFor([issue], issue.ref)}`,
    }
  if (role === 'ready-for-agent') {
    const phase = enterPhaseOf(issue, enterAt)
    return {
      ref: issue.ref,
      title: issue.title,
      role,
      note: `Enters at ${PHASES[phase].label}${bug}`,
      action: { kind: 'start', ref: issue.ref, arg: argFor([issue], issue.ref), phase },
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
    arg: argFor([r.issue], r.issue.ref),
    command: r.status === 'ready' ? `/implement ${argFor([r.issue], r.issue.ref)}` : null,
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
    runAll:
      spec !== null && unmerged
        ? `/implement-spec ${argFor(tracker.issues, spec)} · run all in parallel`
        : null,
    links: null,
    count: inbox.length + tickets.length,
  }
}

/** The filter chip that shows every context. */
export const ALL_CONTEXTS = '*'

export type GlossaryGroup = {
  /** The context's name; null in a repo without a map, where the one glossary has no heading. */
  name: string | null
  /** Why the group has no terms to list: no file yet, or one that could not be read. */
  note: string | null
  terms: (Term & { isNew: boolean })[]
}

export type GlossaryView = {
  groups: GlossaryGroup[]
  total: number
  summary: string
  used: Term[]
  hasFile: boolean
  /** Context names for the filter chips; empty in a repo without a map. */
  chips: string[]
  /** The selected chip: a context name, or ALL_CONTEXTS. */
  filter: string
  /** Map lines Craftory could not use. */
  problems: string[]
}

const matches = (t: Term, needle: string) =>
  needle === '' ||
  [t.name, t.definition, ...t.avoid].some(text => text.toLowerCase().includes(needle))

export function glossaryView(args: {
  contexts: readonly ContextSnapshot[] | undefined
  map: GlossaryMap | null
  mapPath: string
  /** The glossary path of a repo without a map. */
  path: string
  query: string
  filter: string | null
  used: readonly string[]
  atStart: readonly string[] | null
}): GlossaryView {
  const { contexts = [], map, mapPath, path, query, used, atStart } = args
  const all = contexts.flatMap(contextTerms)
  const known = new Set(atStart ?? contextTermKeys(contexts))
  const added = contextTermKeys(contexts).filter(k => !known.has(k)).length
  const needle = query.trim().toLowerCase()
  const withNew = (c: ContextSnapshot, terms: Term[]) =>
    terms
      .filter(t => matches(t, needle))
      .map(t => ({ ...t, isNew: !known.has(contextTermKey(c.name, t.name)) }))
  const usedTerms = mergedTerms(contexts)
    .filter(t => used.includes(termKey(t.name)))
    .map(t => (map === null ? { name: t.name, definition: t.definition, avoid: t.avoid } : t))
  if (map === null) {
    const only = contexts[0]
    const doc = only?.glossary
    if (only === undefined || doc?.state !== 'ok')
      return {
        groups: [],
        total: 0,
        summary: doc?.state === 'invalid' ? `${path} could not be read` : `No ${path} yet`,
        used: [],
        hasFile: false,
        chips: [],
        filter: ALL_CONTEXTS,
        problems: [],
      }
    return {
      groups: [{ name: null, note: null, terms: withNew(only, termsOf(doc.value)) }],
      total: all.length,
      summary: `${path} · ${added} added this session`,
      used: usedTerms,
      hasFile: true,
      chips: [],
      filter: ALL_CONTEXTS,
      problems: [],
    }
  }
  const filter =
    args.filter !== null && contexts.some(c => c.name === args.filter) ? args.filter : ALL_CONTEXTS
  const groups = contexts
    .filter(c => filter === ALL_CONTEXTS || c.name === filter)
    .map((c): GlossaryGroup => {
      const note =
        c.glossary.state === 'ok'
          ? null
          : c.glossary.state === 'invalid'
            ? `${c.path} could not be read`
            : 'No glossary yet'
      const terms = withNew(c, contextTerms(c))
      return { name: c.name, note: needle === '' ? note : null, terms }
    })
    .filter(g => g.note !== null || g.terms.length > 0)
  return {
    groups,
    total: all.length,
    summary: `${mapPath} · ${contexts.length} ${contexts.length === 1 ? 'context' : 'contexts'} · ${added} added this session`,
    used: usedTerms,
    hasFile: true,
    chips: contexts.map(c => c.name),
    filter,
    problems: map.problems,
  }
}

export type PaneHeaderView = { kicker: string; title: string; progress: string }

const STANDING: Partial<Record<Flow['phases'][number]['state']['kind'], string>> = {
  running: 'running',
  'needs-you': 'needs you',
}

/** What the pane says on top: which Feature, and where it stands; `agents` counts running agents. */
export function paneHeader(flow: Flow | null, agents: number): PaneHeaderView {
  if (flow === null)
    return {
      kicker: 'Craftory',
      title: 'No feature in flight',
      progress: 'Talk the plan through first with /grill-with-docs.',
    }
  const spec = flow.feature.kind === 'specced' ? flow.feature.record.spec : ''
  const current = flow.phases.find(p => p.phase === flow.current)
  const standing = current === undefined ? undefined : STANDING[current.state.kind]
  const crew = agents > 0 ? `, ${agents} ${agents === 1 ? 'agent' : 'agents'}` : ''
  return {
    kicker: spec === '' ? 'Craftory' : `Craftory · spec ${spec}`,
    title: flow.title,
    progress: [
      `${flow.doneCount} of ${flow.enabledCount} phases done`,
      ...(current !== undefined && standing !== undefined
        ? [`${PHASES[current.phase].label} ${standing}${crew}`]
        : []),
    ].join(' · '),
  }
}
