/**
 * The opt-in automation notice, shared by every automation (handoff at 80%, retro on PR, the
 * weekly architecture check, the unmet Done-when nudge):
 *
 * - off until its switch is on, and visible before it acts: a band notice, never a toast;
 * - drawn only while no turn runs ({@link whileIdle});
 * - one action at most, a skill submitted on the click; Craftory edits no files for it;
 * - once per scope ({@link isArmed}): a press or a dismiss both leave the scope fired.
 */
import type {
  AutomationNotice,
  EventNotice,
  FeatureKey,
  FeatureRecord,
  PhaseId,
  PullRequest,
  TrackerKind,
} from '../types'
import { namespaced, PHASES, SKILLS } from './phases'

/** A scope fired with this prefix re-arms when a new session starts. */
export const SESSION_SCOPE = 'session:'

export const isArmed = (fired: readonly string[], scope: string) => !fired.includes(scope)

/** Fired scopes a new session keeps: every one but the session's own. */
export const rearmSession = (fired: readonly string[]) =>
  fired.filter(scope => !scope.startsWith(SESSION_SCOPE))

/** Held notices the band may draw now: automations wait while a turn runs. */
export const whileIdle = <N extends EventNotice>(notices: readonly N[], isWorking: boolean) =>
  isWorking ? notices.filter(n => n.kind !== 'automation') : [...notices]

/** The share of the main session's context window that raises the handoff notice. */
export const HANDOFF_AT = 0.8

export const HANDOFF_SCOPE = `${SESSION_SCOPE}handoff`

/** Tokens a response was answered over: the status line's input side, cached or not. */
export const contextTokens = (usage: {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}) => usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens

export const isHandoffDue = (tokens: number, window: number) =>
  window > 0 && tokens >= HANDOFF_AT * window

export const handoffNotice = (): AutomationNotice => ({
  kind: 'automation',
  id: 'handoff',
  scope: HANDOFF_SCOPE,
  text: 'Context is 80% full · write a handoff so a fresh session can pick up',
  run: { label: 'Write handoff', skill: SKILLS.handoff, args: '' },
})

/**
 * Retro on PR is offered once a session until the user answers it; the answer (run or dismiss)
 * is stored on the Feature, so it is final for that Feature across sessions.
 */
const RETRO_SCOPE = `${SESSION_SCOPE}retro:`

export const retroScope = (key: FeatureKey) => `${RETRO_SCOPE}${key}`

/** The Feature a retro notice's scope names, or null for any other scope. */
export const retroFeatureOf = (scope: string): FeatureKey | null =>
  scope.startsWith(RETRO_SCOPE) ? (scope.slice(RETRO_SCOPE.length) as FeatureKey) : null

/** The Feature's own PR has merged, the retro has not run, and the user has not answered yet. */
export const isRetroDue = (record: FeatureRecord, pr: PullRequest | null) =>
  pr !== null &&
  pr.state === 'merged' &&
  record.integrationBranch !== '' &&
  pr.branch === record.integrationBranch &&
  record.retroOffered !== true &&
  record.marks.retro?.ranAt === undefined

export const retroNotice = (key: FeatureKey): AutomationNotice => ({
  kind: 'automation',
  id: 'retro',
  scope: retroScope(key),
  text: 'The pull request merged · run a retro while it is fresh',
  run: { label: 'Run retro', skill: SKILLS.retro, args: '' },
})

/** How old the last architecture check may be before the weekly check is offered again. */
export const ARCHITECTURE_EVERY_MS = 7 * 24 * 60 * 60 * 1000

/** Session-scoped: a dismiss silences it for the session; the 7-day rule decides the next one. */
export const ARCHITECTURE_SCOPE = `${SESSION_SCOPE}architecture`

export const ARCHITECTURE_ARGS =
  'File each finding as an issue in the tracker with the needs-triage label.'

/** The repo's `.craftory/state.json`, read leniently: anything unreadable is an empty state. */
export function parseRepoState(text: string | null): Record<string, unknown> {
  if (text === null) return {}
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function architectureLastRunOf(text: string | null): string | null {
  const last = parseRepoState(text).architectureLastRun
  return typeof last === 'string' && !Number.isNaN(Date.parse(last)) ? last : null
}

/** The state file with `architectureLastRun` set, every other key kept. */
export const withArchitectureRun = (text: string | null, at: string) =>
  `${JSON.stringify({ ...parseRepoState(text), architectureLastRun: at }, null, 2)}\n`

/** Due when it never ran, or ran more than 7 days before `now`. */
export const isArchitectureDue = (lastRun: string | null, now: number) =>
  lastRun === null || now - Date.parse(lastRun) > ARCHITECTURE_EVERY_MS

/**
 * A Feature is mid-Build from the record alone, since no agent survives a restart: Build ran,
 * nobody marked it done, and no later phase has started.
 */
export const isMidBuild = (record: Pick<FeatureRecord, 'marks'>) => {
  const { build, review, ship, retro } = record.marks
  return (
    build?.ranAt !== undefined &&
    build.markedDoneAt === undefined &&
    [review, ship, retro].every(m => m?.ranAt === undefined)
  )
}

export const isArchitectureSkill = (skill: string) =>
  skill.replace(/^\//, '').replace(/^[^:]*:/, '') === SKILLS.improveArchitecture

export const architectureNotice = (): AutomationNotice => ({
  kind: 'automation',
  id: 'architecture',
  scope: ARCHITECTURE_SCOPE,
  text: 'Weekly architecture check is due · look for deepening opportunities',
  run: { label: 'Check architecture', skill: SKILLS.improveArchitecture, args: ARCHITECTURE_ARGS },
})

/** The handoff skill, by the name a skill prompt carries. */
export const isHandoffSkill = (name: string) =>
  name.replace(/^\//, '') === namespaced(SKILLS.handoff)

/** A file the handoff run wrote that can be its document: anything but Craftory's own state. */
export const isHandoffDocument = (path: string) => !/(^|\/)\.craftory\//.test(path)

/** What a finished handoff run links: its last document, unless the run was cancelled. */
export const handoffLink = (run: { path: string | null }, isAborted: boolean) =>
  isAborted ? null : run.path

/**
 * What each phase still lacks while its Done-when is unmet, after the Phase evidence table in
 * docs/design/craftory/plan.md: the Local column, then the one every remote tracker shares.
 */
const UNMET: Record<PhaseId, { local: string; remote: string }> = {
  align: { local: 'no spec has been created yet', remote: 'no spec has been created yet' },
  spec: {
    local: 'no .scratch/<feature>/spec.md has been created in this feature yet',
    remote: 'no issue with the spec label has been created yet',
  },
  tickets: {
    local: 'no .scratch/<feature>/issues/NN-*.md files with Blocked by: edges exist yet',
    remote: 'no sub-issues of the spec exist yet',
  },
  build: {
    local: 'not every ready-for-agent ticket is done and merged into the integration branch',
    remote: 'not every ready-for-agent ticket is closed by a merge into the integration branch',
  },
  review: {
    local: 'code-review has not run on the integration branch since the last ticket merged',
    remote: 'code-review has not run on the integration branch since the last ticket merged',
  },
  ship: {
    local: 'the PR from the integration branch is not ready for review yet',
    remote: 'the PR from the integration branch is not ready for review yet',
  },
  retro: { local: 'retro has not run since Ship', remote: 'retro has not run since Ship' },
}

export const nudgeText = (phase: PhaseId, tracker: TrackerKind) => {
  const { label } = PHASES[phase]
  const unmet = UNMET[phase][tracker === 'local' ? 'local' : 'remote']
  return `${label} is still running: ${unmet}. Ask for it, or mark ${label} done.`
}

export const NUDGE_PREFIX = 'nudge-'

/** The unmet Done-when nudge: informs only, so it has no run action, just Dismiss. */
export const nudgeNotice = (
  feature: FeatureKey,
  phase: PhaseId,
  tracker: TrackerKind,
): AutomationNotice => ({
  kind: 'automation',
  id: `${NUDGE_PREFIX}${phase}`,
  scope: `feature:${feature}:nudge:${phase}`,
  text: nudgeText(phase, tracker),
})
