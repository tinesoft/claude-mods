/**
 * Toasts are derived, not fired from hooks (graft 1). `SignalBasis` is computed from the same
 * facts as the Flow; `diffSignals` says what changed between two of them. The first basis after
 * a session starts only seeds, so a restart does not announce what was already there.
 *
 * A toast carries no action in 2.1.302: the action (Open, Run anyway) lives on the band notice.
 */
import type {
  BudgetSignalBasis,
  ConflictSignalBasis,
  DraftFeature,
  EventNotice,
  FeatureRecord,
  GateSignalBasis,
  IssueRef,
  SignalBasis,
  TrackerSnapshot,
} from '../types'
import { budgetK } from './build'
import { bindSpec } from './features'
import { PHASES } from './phases'

export type Signal =
  | { kind: 'spec-published'; spec: IssueRef; stories: number | null }
  | ({ kind: 'gate' } & GateSignalBasis)
  | ({ kind: 'budget' } & BudgetSignalBasis)
  | ({ kind: 'rebase-conflict' } & ConflictSignalBasis)

export const TOAST_MS = 4000

/** One text per signal kind. A `Record` so a new kind without a toast fails the build. */
export const TOASTS: { [K in Signal['kind']]: (signal: Extract<Signal, { kind: K }>) => string } = {
  'spec-published': s =>
    `Spec ${s.spec} published${s.stories ? ` · ${s.stories} user stories` : ''}`,
  gate: s => `${PHASES[s.phase].label} is gated · ${s.reason}`,
  budget: s => `Agent ${s.ticket} hit its ${budgetK(s.budget)} budget · worktree kept`,
  'rebase-conflict': s => `Rebase conflict in ${s.worktree} · agent paused`,
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
  }
}

/** What is new in `next`. A null `prev` is the first look: it only seeds. */
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
  ]
}
