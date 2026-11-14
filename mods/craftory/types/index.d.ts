export type PhaseId = 'align' | 'spec' | 'tickets' | 'build' | 'review' | 'ship' | 'retro'

export type EntryId = 'triage' | 'wayfinder'

export type IssueRef = string & { readonly __brand: 'IssueRef' }

export type AgentId = string & { readonly __brand: 'AgentId' }

export type SkillName = string & { readonly __brand: 'SkillName' }

export type Millis = number
export type IsoTime = string

export type Loaded<T> =
  | { state: 'absent' }
  | { state: 'ok'; value: T; raw: string; problem?: string }
  | { state: 'invalid'; raw: string; problem: string }

export type EnterAt = 'align' | 'bugs-build-else-align' | 'tickets'

export type PhaseConfig = {
  enabled: boolean
  /** One of PHASES[id].commands; absent for Review and Ship (no command). */
  command?: SkillName
  /** Gate *after* this phase: starting the next enabled phase while this one is not done asks. */
  gate: boolean
}

export type WorktreeConfig = {
  folder: string
  /** `{spec-slug}` placeholder. */
  integrationBranch: string
  /** `{ticket}` and `{slug}` placeholders. */
  ticketBranch: string
  maxParallel: number
  /** Tokens per agent. */
  tokenBudget: number
  setup: string
  copy: string[]
  removeAfterMerge: boolean
  rebaseOnMove: boolean
  keepFailed: boolean
  pruneStale: boolean
  /** The project's test command, run in a ticket's worktree after its implementer's turn; '' is unset. */
  test: string
  testTimeoutSec: number
}

export type AutomationConfig = {
  suggestNext: boolean
  liveAgents: boolean
  underlineTerms: boolean
  retroOnPr: boolean
  handoffAt80: boolean
  weeklyArchitecture: boolean
  nudgeUnmetDone: boolean
}

/** Opt-in guardrails that deny a tool call. Both default off. */
export type DenyConfig = {
  /** Deny a gated phase's skill until the phase before it is done. */
  skipGate: boolean
  /** Deny Edit and Write in the main checkout while it is on an integration branch. */
  editOnIntegrationBranch: boolean
}

/** Craftory-only tracker extras. The tracker *kind* lives in docs/agents/issue-tracker.md. */
export type TrackerExtras = {
  github: { specLabel: string; ticketLabel: string }
  gitlab: { instance: string; project: string }
}

export type CraftoryConfig = {
  version: 1
  entry: {
    triage: { enabled: boolean; enterAt: EnterAt }
    wayfinder: { suggest: 'long-grill' | 'off'; afterQuestions: number }
  }
  phases: Record<PhaseId, PhaseConfig>
  tracker: TrackerExtras
  docs: { research: string }
  worktrees: WorktreeConfig
  automation: AutomationConfig
  deny: DenyConfig
}

export type ConfigPatch = {
  [K in keyof CraftoryConfig]?: CraftoryConfig[K] extends object
    ? { [J in keyof CraftoryConfig[K]]?: Partial<CraftoryConfig[K][J]> | CraftoryConfig[K][J] }
    : CraftoryConfig[K]
}

export type RailLayout = 'row' | 'summary'
export type ThemeChoice = 'auto' | 'light' | 'dark'
export type Tone = 'light' | 'dark'

export type Prefs = {
  rail: boolean
  railLayout: RailLayout
  theme: ThemeChoice
  ascii: boolean
  /** Ask "Anything to add for /<command>?" before a button runs a skill. */
  askContext: boolean
}
export type PrefOverrides = Partial<Prefs>

export type TrackerKind = 'local' | 'github' | 'gitlab' | 'other'

export type TrackerSetup =
  | { kind: 'local' }
  | { kind: 'github'; prsAsRequests: boolean }
  | { kind: 'gitlab'; prsAsRequests: boolean }
  | { kind: 'other'; description: string }

export type TriageRole =
  'needs-triage' | 'needs-info' | 'ready-for-agent' | 'ready-for-human' | 'wontfix'

export type TriageLabels = Record<TriageRole, string>

export type SteeringFile = 'AGENTS.md' | 'CLAUDE.md'

export type DocsLayout = { glossary: string; adr: string }

/**
 * What /setup-matt-pocock-skills would have asked. `triage: null` means the triage skill is
 * not installed, so no triage-labels.md and no `### Triage labels` sub-block, as upstream.
 */
export type AgentSetup = {
  tracker: TrackerSetup
  triage: TriageLabels | null
  docs: DocsLayout
  steering: SteeringFile
}

export type GlossaryDoc = { slices: GlossarySlice[] }

export type GlossarySlice =
  | { kind: 'text'; raw: string }
  | { kind: 'term'; raw: string; term: Term }
  | { kind: 'relationship'; raw: string; text: string }
  | { kind: 'ambiguity'; raw: string; text: string }

export type Term = {
  name: string
  definition: string
  avoid: string[]
}

export type IssueKind = 'spec' | 'ticket' | 'issue'
export type IssueStatus = 'open' | 'in-progress' | 'done' | 'closed'

export type Issue = {
  ref: IssueRef
  title: string
  kind: IssueKind
  status: IssueStatus
  role: TriageRole | null
  parent: IssueRef | null
  blockedBy: IssueRef[]
  isBug: boolean
  stories?: number
  createdAt: Millis | null
  location: string
}

export type PullRequest = {
  ref: IssueRef
  url: string
  branch: string
  base: string
  isDraft: boolean
  state: 'open' | 'merged' | 'closed'
}

export type TrackerLink = { label: string; url: string }

export type WayState = 'open' | 'claimed' | 'resolved'

/** A child of a wayfinder map, as any tracker reader reports it. */
export type WayTicket = {
  ref: IssueRef
  title: string
  type: 'research' | 'prototype' | 'grilling' | 'task' | null
  state: WayState
  assignee: string | null
  blockedBy: IssueRef[]
  /** The native-dependency lookup failed: whether anything blocks it is not known. */
  blockersUnknown?: boolean
  location: string
}

/** A wayfinder map: the one model every tracker's map reader returns. */
export type WayMap = {
  ref: IssueRef
  source: 'local' | 'github' | 'gitlab'
  title: string
  /** Where it lives, as the card kicker names it: `.scratch/<effort>` or `#12`. */
  origin: string
  location: string
  isClosed: boolean
  destination: string
  /** True when Not yet specified holds anything. */
  hasFog: boolean
  tickets: WayTicket[]
  updatedAt: Millis
}

export type TrackerSnapshot =
  | {
      kind: 'local' | 'github' | 'gitlab'
      rich: true
      issues: Issue[]
      maps?: WayMap[]
      pr: PullRequest | null
      at: Millis
      problem: string | null
    }
  | {
      kind: 'gitlab' | 'other'
      rich: false
      links: TrackerLink[]
      note: string | null
      /** Only a Local map read beside a GitLab tracker whose own issues could not be read. */
      maps?: WayMap[]
      at: Millis
    }

export type WorktreeRole = 'checkout' | 'integration' | 'agent' | 'stale' | 'other'

export type Worktree = {
  path: string
  branch: string | null
  role: WorktreeRole
  ticket: IssueRef | null
  ahead: number
  behind: number
  added: number
  deleted: number
  commits: number
  lastCommitAt: Millis | null
  isRebasing: boolean
}

export type GitSnapshot = {
  root: string
  branch: string | null
  remote: Remote | null
  worktrees: Worktree[]
  merged: Record<string, string[]>
  tips: Record<string, string>
  at: Millis
}

export type Remote = { host: 'github' | 'gitlab' | 'other'; webUrl: string; slug: string | null }

/**
 * Non-derivable facts about one phase. Every field is monotone (set once, or only grows), so
 * `mergeFeature(disk, mine)` converges when two sessions write the same file.
 */
export type PhaseMark = {
  ranAt?: IsoTime
  endedAt?: IsoTime
  markedDoneAt?: IsoTime
  artifacts?: string[]
  /**
   * The phase ended with an answer Craftory could not read its evidence from (a retro with no
   * ranked suggestions to count). A mark ended before this was kept has neither it nor artifacts.
   */
  unparsedAt?: IsoTime
  /** The unmet Done-when nudge was raised for this phase; it is not raised again for this Feature. */
  nudgedAt?: IsoTime
}

/**
 * Whether a phase is left out for one feature. Both stamps only grow, so two writers join to
 * the same record; the phase is skipped while `skippedAt` is later than `unskippedAt`.
 */
export type SkipMark = { skippedAt?: IsoTime; unskippedAt?: IsoTime }

export type AgentOutcome = 'running' | 'done' | 'failed' | 'over-budget' | 'stopped'

export type AgentRecord = {
  ticket: IssueRef
  name: string
  branch: string
  worktree: string
  tokens: number
  budget: number
  outcome: AgentOutcome
  startedAt: IsoTime
  endedAt?: IsoTime
  /** The latest `worktrees.test` run in this attempt's worktree. */
  test?: TestRun
}

/** One run of `worktrees.test`. A failed run makes a done attempt Failed until a later run passes. */
export type TestRun = {
  at: IsoTime
  passed: boolean
  /** Why it failed: `exit 1`, `timed out`, or what kept it from running. */
  reason?: string
  /** The last lines of its output, for the ticket card. */
  tail?: string
}

/**
 * What `FeatureRecord.spec` points at: a spec issue, or, for a bug or request that entered at
 * Build, the issue itself, which is then its own single ticket.
 */
export type FeatureOrigin = 'spec' | 'issue'

export type FeatureRecord = {
  version: 1
  spec: IssueRef
  origin: FeatureOrigin
  title: string
  entry: PhaseId
  enteredFrom: IssueRef | null
  skips: Partial<Record<PhaseId, SkipMark>>
  integrationBranch: string
  pr: IssueRef | null
  /** The wayfinder map this Feature belongs to; the mod reads it and never rewrites it. */
  map?: IssueRef
  /** The user dismissed the Chart-a-map suggestion for this Feature. */
  wayfinderSuggestDismissed?: true
  /** The retro-on-PR notice was raised for this Feature: it is not offered again. */
  retroOffered?: true
  /** The latest handoff document the handoff skill wrote, as the skill named it. */
  handoff?: string
  marks: Partial<Record<PhaseId, PhaseMark>>
  /** Keyed by ticket ref string. The latest attempt per ticket wins. */
  agents: Record<string, AgentRecord>
}

export type DraftFeature = {
  draftId: string
  title: string
  entry: PhaseId
  enteredFrom: IssueRef | null
  marks: Partial<Record<PhaseId, PhaseMark>>
  startedAt: IsoTime
  /** The wayfinder map this draft belongs to; it carries over to the Feature the draft becomes. */
  map?: IssueRef
  wayfinderSuggestDismissed?: true
  handoff?: string
}

export type FeatureKey = `spec:${string}` | `draft:${string}`

export type Feature =
  | { kind: 'draft'; key: FeatureKey; draft: DraftFeature }
  | { kind: 'specced'; key: FeatureKey; record: FeatureRecord }

export type Running = {
  phase: PhaseId | null
  entry: EntryId | null
  skill: SkillName
  args: string
  feature: FeatureKey | null
  startedAt: Millis
  isAwaitingUser: boolean
  progress: string | null
  /** Questions the grill has asked so far, counted from its turns that end waiting on the user. */
  questions?: number
  /** The wayfinder suggestion has already fired in this grill. */
  isSuggested?: boolean
}

export type BudgetState = 'ok' | 'near' | 'over'

export type StopCause = 'budget' | 'conflict'

export type SeatPlan = {
  ticket: IssueRef
  name: string
  branch: string
  path: string
  base: string
  setup: string[] | null
  /** Files to copy into the worktree: relative paths inside the repo, never under `.git`. */
  copy: string[]
  /** The configured `copy` entries Craftory refused, as written. */
  rejectedCopy: string[]
}

export type PendingSeat = { toolUseId: string; plan: SeatPlan; at: Millis }

export type AgentRun = {
  agentId: AgentId
  ticket: IssueRef
  name: string
  worktree: string
  branch: string
  tokens: number
  budget: number
  budgetState: BudgetState
  /** Set when Craftory ends the agent at its next step; `isDelivered` once that step was answered. */
  stop: { cause: StopCause; isDelivered: boolean } | null
  status: 'running' | 'done' | 'failed' | 'stopped'
  tddStep: string | null
  startedAt: Millis
  lastAt: Millis
}

export type BuildLedger = {
  pending: Record<string, PendingSeat>
  runs: Record<string, AgentRun>
  queued: IssueRef[]
  isPaused: boolean
}

export type GatePass = { key: string; until: Millis }

export type PluginStatus =
  | { kind: 'checking' }
  | { kind: 'missing' }
  | {
      kind: 'present'
      version: string | null
      inRange: boolean | null
      hasDuplicates: boolean
      skills: SkillName[]
      /** Skills Craftory recognises whose bare name another source also owns (built-in, project, other plugin). */
      shadowed: SkillName[]
    }

export type InstallState =
  | { kind: 'idle' }
  | { kind: 'installing'; startedAt: Millis }
  | { kind: 'restart' }
  | { kind: 'failed'; message: string }

export type EventNotice =
  | {
      kind: 'gate'
      id: string
      phase: PhaseId
      by: PhaseId
      reason: string
      skill: SkillName
      args: string
    }
  | { kind: 'budget'; id: string; ticket: IssueRef; budget: number }
  | { kind: 'rebase-conflict'; id: string; ticket: IssueRef; worktree: string }
  | { kind: 'drift'; id: string; avoided: string; term: string; count: number }
  | { kind: 'spec-published'; id: string; spec: IssueRef; stories: number | null }
  | { kind: 'retro-ready'; id: string; suggestions: number | null }
  | { kind: 'suggest-wayfinder'; id: string }
  | AutomationNotice

/**
 * An opt-in automation's band notice. It shows only while no turn runs, offers at most one
 * action (`run`, a skill submitted on the click; none for a nudge), and fires once per `scope`.
 * `scope` is the key Craftory records as fired: `session:<what>` re-arms in a new session,
 * other scopes (`feature:<key>:<what>`, `repo:<what>`) are kept by the automation that raises them.
 */
export type AutomationNotice = {
  kind: 'automation'
  id: string
  scope: string
  text: string
  run?: { label: string; skill: SkillName; args: string }
}

export type GateSignalBasis = { id: string; phase: PhaseId; by: PhaseId; reason: string }

export type BudgetSignalBasis = { id: string; ticket: IssueRef; budget: number }

export type ConflictSignalBasis = { id: string; ticket: IssueRef; worktree: string }

export type DriftSignalBasis = { id: string; avoided: string; term: string; count: number }

export type RetroSignalBasis = { id: string; suggestions: number | null }

export type SignalBasis = {
  /** The repo the basis was read from: a move to another checkout (a worktree) starts a new one. */
  root: string | null
  specs: { ref: IssueRef; stories: number | null }[]
  gates: GateSignalBasis[]
  budgets: BudgetSignalBasis[]
  conflicts: ConflictSignalBasis[]
  drifts: DriftSignalBasis[]
  retros: RetroSignalBasis[]
}

export type NoticeKey = EventNotice['kind'] | 'plugin' | 'first-run' | 'no-feature' | 'duplicates'

export type PaneTab = 'flow' | 'tickets' | 'worktrees' | 'glossary' | 'settings'

export type SettingsSection =
  'entry' | 'tracker' | 'docs' | 'glossary' | 'pipeline' | 'worktrees' | 'automation' | 'personal'

export type TermDraft = { name: string; definition: string; avoid: string; editing: string | null }

export type RepoSnapshot = {
  config: Loaded<CraftoryConfig>
  setup: Loaded<AgentSetup>
  glossary: Loaded<GlossaryDoc>
  steering: { file: SteeringFile | null; hasBlock: boolean }
  remoteHost: 'github' | 'gitlab' | 'other' | null
  hasContextMd: boolean
  hasScratch: boolean
  hasGitignoreEntry: boolean
  at: Millis
}

declare module 'claude-code' {
  interface PluginState {
    craftory: {
      repo: RepoSnapshot | null
      tracker: TrackerSnapshot | null
      git: GitSnapshot | null
      features: Record<string, FeatureRecord>
      drafts: Record<string, DraftFeature>
      plugin: PluginStatus
      install: InstallState
      prefs: PrefOverrides | null
      appearance: { system: Tone | null; colorFgBg: Tone | null }

      active: FeatureKey | null
      running: Running | null
      build: BuildLedger
      steeringNote: string | null
      passes: GatePass[]
      notices: EventNotice[]
      dismissed: NoticeKey[]
      /** Automation scopes that already raised their notice (AutomationNotice `scope`). */
      automationsFired: string[]
      /** The architecture check started in the main session and has not reported yet. */
      architectureRun: boolean
      /** The phase the last main turn ended in, until the refresh after it checks its Done-when. */
      nudgeEnded: { feature: FeatureKey; phase: PhaseId } | null
      /** A handoff skill run in flight: the Feature it belongs to and the last file it wrote. */
      handoffRun: { feature: FeatureKey | null; path: string | null } | null
      lastReplyTerms: string[]
      glossaryAtStart: string[] | null

      signals: SignalBasis | null

      openPhase: PhaseId | 'triage' | null
      isMapOpen: boolean
      isDecidedOpen: boolean
      pickedMap: IssueRef | null
      isPickingFeature: boolean
      paneTab: PaneTab
      diffs: Record<string, string>
      settingsSection: SettingsSection
      termDraft: TermDraft
      termError: string | null
      setupDraft: AgentSetup | null
      askedFiles: string[]
      glossaryQuery: string
      setupNote: string | null
      /** Text typed into each settings field since it was drawn, by field key. */
      typed: Record<string, string>
    }
  }
}
