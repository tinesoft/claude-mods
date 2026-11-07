import type { IssueRef, NoticeKey, PhaseId, SkillName } from '../types'

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
  | { kind: 'raise-budget'; ticket: IssueRef }
  | { kind: 'resolve'; noticeId: string }
  | { kind: 'rename'; noticeId: string; term: string }
  | { kind: 'review-retro'; noticeId: string }
  | { kind: 'dismiss'; noticeId: string }
  | { kind: 'wayfinder'; noticeId: string; args: string; map?: IssueRef }
  | { kind: 'dismiss-wayfinder'; noticeId: string }
  | { kind: 'mark-done'; phase: PhaseId }
  | { kind: 'write-pr' }
  | { kind: 'open-tickets' }
  | { kind: 'open-panel' }
  | { kind: 'pause-all' }

/** What a view needs to hand a button's action back to the shell. */
export type Acts = { act: (action: Action) => void }
