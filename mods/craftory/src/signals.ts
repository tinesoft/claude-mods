/**
 * A toast carries no action in 2.1.302: the action (Open, Run anyway) lives on the band notice.
 */
import type {
  BudgetSignalBasis,
  ConflictSignalBasis,
  DraftFeature,
  DriftSignalBasis,
  EventNotice,
  FeatureRecord,
  GateSignalBasis,
  IssueRef,
  RetroSignalBasis,
  SignalBasis,
  TrackerSnapshot,
} from '../types'
import { budgetK } from './build'
import { driftText, retroText } from './drift'
import { bindSpec } from './features'
import { PHASES } from './phases'

export type Signal =
  | { kind: 'spec-published'; spec: IssueRef; stories: number | null }
  | ({ kind: 'gate' } & GateSignalBasis)
  | ({ kind: 'budget' } & BudgetSignalBasis)
  | ({ kind: 'rebase-conflict' } & ConflictSignalBasis)
  | ({ kind: 'drift' } & DriftSignalBasis)
  | ({ kind: 'retro-ready' } & RetroSignalBasis)

export const TOAST_MS = 4000

export const TOASTS: { [K in Signal['kind']]: (signal: Extract<Signal, { kind: K }>) => string } = {
  'spec-published': s =>
    `Spec ${s.spec} published${s.stories ? ` · ${s.stories} user stories` : ''}`,
  gate: s => `${PHASES[s.phase].label} is gated · ${s.reason}`,
  budget: s => `Agent ${s.ticket} hit its ${budgetK(s.budget)} budget · worktree kept`,
  'rebase-conflict': s => `Rebase conflict in ${s.worktree} · agent stopped`,
  drift: s => driftText(s),
  'retro-ready': s => retroText(s.suggestions),
}

export function toastText(signal: Signal): string {
  switch (signal.kind) {
    case 'spec-published':
      return TOASTS['spec-published'](signal)
    case 'gate':
      return TOASTS.gate(signal)
    case 'budget':
      return TOASTS.budget(signal)
    case 'rebase-conflict':
      return TOASTS['rebase-conflict'](signal)
    case 'drift':
      return TOASTS.drift(signal)
    case 'retro-ready':
      return TOASTS['retro-ready'](signal)
    default: {
      const _exhaustive: never = signal
      return _exhaustive
    }
  }
}

export function signalBasis(args: {
  features: Readonly<Record<string, FeatureRecord>>
  drafts: Readonly<Record<string, DraftFeature>>
  tracker: TrackerSnapshot | null
  notices: readonly EventNotice[]
}): SignalBasis {
  const { features, drafts, tracker, notices } = args
  const issues = tracker?.rich ? tracker.issues : []
  const bound = new Set(Object.keys(features))
  const refs = [...(bound as Set<IssueRef>)]
  if (tracker?.rich) {
    for (const draft of Object.values(drafts)) {
      const spec = bindSpec(draft, tracker, bound)
      if (spec) refs.push(spec.ref)
    }
  }
  return {
    specs: refs.map(ref => ({ ref, stories: issues.find(i => i.ref === ref)?.stories ?? null })),
    gates: notices.flatMap((n): GateSignalBasis[] =>
      n.kind === 'gate' ? [{ id: n.id, phase: n.phase, by: n.by, reason: n.reason }] : [],
    ),
    budgets: notices.flatMap((n): BudgetSignalBasis[] =>
      n.kind === 'budget' ? [{ id: n.id, ticket: n.ticket, budget: n.budget }] : [],
    ),
    conflicts: notices.flatMap((n): ConflictSignalBasis[] =>
      n.kind === 'rebase-conflict' ? [{ id: n.id, ticket: n.ticket, worktree: n.worktree }] : [],
    ),
    drifts: notices.flatMap((n): DriftSignalBasis[] =>
      n.kind === 'drift' ? [{ id: n.id, avoided: n.avoided, term: n.term, count: n.count }] : [],
    ),
    retros: notices.flatMap((n): RetroSignalBasis[] =>
      n.kind === 'retro-ready' ? [{ id: n.id, suggestions: n.suggestions }] : [],
    ),
  }
}

export function diffSignals(prev: SignalBasis | null, next: SignalBasis): Signal[] {
  if (prev === null) return []
  return [
    ...next.specs
      .filter(s => !prev.specs.some(p => p.ref === s.ref))
      .map((s): Signal => ({ kind: 'spec-published', spec: s.ref, stories: s.stories })),
    ...next.gates
      .filter(g => !prev.gates.some(p => p.id === g.id))
      .map((g): Signal => ({ kind: 'gate', ...g })),
    ...next.budgets
      .filter(b => !prev.budgets.some(p => p.id === b.id))
      .map((b): Signal => ({ kind: 'budget', ...b })),
    ...next.conflicts
      .filter(c => !prev.conflicts.some(p => p.id === c.id))
      .map((c): Signal => ({ kind: 'rebase-conflict', ...c })),
    ...next.drifts
      .filter(d => !prev.drifts.some(p => p.id === d.id))
      .map((d): Signal => ({ kind: 'drift', ...d })),
    ...next.retros
      .filter(r => !prev.retros.some(p => p.id === r.id))
      .map((r): Signal => ({ kind: 'retro-ready', ...r })),
  ]
}
