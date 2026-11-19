import type { BudgetScope, FeatureKey, IssueRef, NoticeKey, PhaseId, SkillName } from '../types'

/**
 * Everything a button can ask for. Each payload is complete, so the one `dispatch` that answers
 * it looks nothing up in the view that drew the button.
 */
export type Action =
  | { kind: 'install' }
  | { kind: 'update' }
  | { kind: 'not-now'; key: NoticeKey }
  | { kind: 'setup' }
  | { kind: 'run'; skill: SkillName; args: string }
  | { kind: 'run-phase'; phase: PhaseId | 'triage' }
  | { kind: 'run-anyway'; noticeId: string; phase: PhaseId; skill: SkillName; args: string }
  | { kind: 'diagnose'; about: string; noticeId?: string }
  /**
   * Raises one implementer's token budget, so its ticket can run again. Not `raise-spend-budget`,
   * which raises a Feature's or a phase's dollar budget.
   */
  | { kind: 'raise-budget'; ticket: IssueRef }
  /** Starts a Failed or Over budget ticket again on `model`, in its kept worktree and branch. */
  | { kind: 'retry'; ticket: IssueRef; model: string }
  /**
   * Sets the Feature's own dollar budget for the scope to 1.5× its budget in force, rounded up.
   * Not `raise-budget`, which raises one implementer's token budget.
   */
  | { kind: 'raise-spend-budget'; key: FeatureKey; scope: BudgetScope }
  /** Silences a budget notice until that scope's budget changes. */
  | {
      kind: 'continue-spend-budget'
      noticeId: string
      key: FeatureKey
      scope: BudgetScope
      budget: number
    }
  | { kind: 'resolve'; noticeId: string }
  | { kind: 'rename'; noticeId: string; term: string }
  | { kind: 'review-retro'; noticeId: string }
  | { kind: 'dismiss'; noticeId: string }
  | { kind: 'automation-run'; noticeId: string; skill: SkillName; args: string }
  | { kind: 'wayfinder'; noticeId: string; args: string; map?: IssueRef }
  | { kind: 'dismiss-wayfinder'; noticeId: string }
  | { kind: 'mark-done'; phase: PhaseId }
  | { kind: 'write-pr' }
  | { kind: 'open-tickets' }
  | { kind: 'open-panel' }
  | { kind: 'pause-all' }
  | { kind: 'archive'; key: FeatureKey }
  | { kind: 'unarchive'; key: FeatureKey }

/** What a view needs to hand a button's action back to the shell. */
export type Acts = { act: (action: Action) => void }
