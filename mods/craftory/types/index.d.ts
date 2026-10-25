/**
 * craftory domain types and its PluginState.
 *
 * Shape in one sentence: repo files and tracker/git output are parsed at the boundary into
 * *facts* (RepoSnapshot, TrackerSnapshot, GitSnapshot, FeatureRecord, BuildLedger); every
 * phase status, notice and render model is *derived* from those facts by pure functions in
 * src/ and never stored. The only stored "status-like" values are facts that cannot be
 * re-derived (a skill ran at T, an agent was stopped at its budget).
 */

// ─── Identity ────────────────────────────────────────────────────────────────────────────

export type PhaseId = 'align' | 'spec' | 'tickets' | 'build' | 'review' | 'ship' | 'retro'

/** Outside the seven phases. Wayfinder is M6, kept so config and recognition stay total. */
export type EntryId = 'triage' | 'wayfinder'

/**
 * A tracker reference as the tracker prints it: `#42` (Local, GitHub, GitLab) or `BILL-42`
 * (Other). Made only by `parseIssueRef` in src/tracker/index.ts.
 */
export type IssueRef = string & { readonly __brand: 'IssueRef' }

/** The engine's agent id (`turn.step` `agentId`, `agent.spawn` result `agentId`). */
export type AgentId = string & { readonly __brand: 'AgentId' }

/**
 * A skill's short name as Matt's plugin names it (`to-spec`, `grill-with-docs`). Made only by
 * `recognise` / the PHASES registry, so a typo cannot reach `$.command.run`.
 */
export type SkillName = string & { readonly __brand: 'SkillName' }

/** Milliseconds since epoch, session-side. Files store ISO strings (`IsoTime`). */
export type Millis = number
export type IsoTime = string

// ─── Boundary wrapper ────────────────────────────────────────────────────────────────────

/**
 * One repo file after the boundary parse. `raw` is kept for byte-exact edits (glossary,
 * docs/agents, steering file) and for the first-write diff.
 */
export type Loaded<T> =
  | { state: 'absent' }
  | { state: 'ok'; value: T; raw: string; problem?: string }
  | { state: 'invalid'; raw: string; problem: string }

// ─── .craftory/config.json (committed, shared) ──────────────────────────────────────────

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
}

export type AutomationConfig = {
  suggestNext: boolean
  liveAgents: boolean
  underlineTerms: boolean
  retroOnPr: boolean
  handoffAt80: boolean
  weeklyArchitecture: boolean
}

/** Craftory-only tracker extras. The tracker *kind* lives in docs/agents/issue-tracker.md. */
export type TrackerExtras = {
  local: { folder: string }
  github: { specLabel: string; ticketLabel: string }
  gitlab: { instance: string; project: string }
}

export type CraftoryConfig = {
  version: 1
  entry: {
    triage: { enabled: boolean; enterAt: EnterAt }
    wayfinder: { suggest: 'long-grill' | 'on-ask' }
  }
  phases: Record<PhaseId, PhaseConfig>
  tracker: TrackerExtras
  docs: { research: string }
  worktrees: WorktreeConfig
  automation: AutomationConfig
}

/** A deep partial used by Settings writes; applied by `patchConfig` onto the raw JSON. */
export type ConfigPatch = {
  [K in keyof CraftoryConfig]?: CraftoryConfig[K] extends object
    ? { [J in keyof CraftoryConfig[K]]?: Partial<CraftoryConfig[K][J]> | CraftoryConfig[K][J] }
    : CraftoryConfig[K]
}

// ─── Personal prefs ($.store over userConfig) ───────────────────────────────────────────

export type RailLayout = 'row' | 'summary'
export type ThemeChoice = 'auto' | 'light' | 'dark'
export type Tone = 'light' | 'dark'

export type Prefs = { rail: boolean; railLayout: RailLayout; theme: ThemeChoice; ascii: boolean }
export type PrefOverrides = Partial<Prefs>

// ─── docs/agents/*.md + "## Agent skills" block (shared with setup-matt-pocock-skills) ──

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

/** Single-context only in v1. Defaults render the upstream domain.md byte for byte. */
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

// ─── GLOSSARY.md (lossless) ─────────────────────────────────────────────────────────────

/**
 * A GLOSSARY.md as an ordered list of raw slices. `serialiseGlossary` concatenates `raw`, so
 * an unedited document round-trips byte for byte by construction. Edits replace one slice.
 */
export type GlossaryDoc = { slices: GlossarySlice[] }

export type GlossarySlice =
  | { kind: 'text'; raw: string } // preamble, headings, blank runs, anything unrecognised
  | { kind: 'term'; raw: string; term: Term }
  | { kind: 'relationship'; raw: string; text: string } // read-only in v1
  | { kind: 'ambiguity'; raw: string; text: string } // read-only in v1

export type Term = {
  /** Display form, `Ledger line`. Key is `termKey(name)` (lower-case, collapsed spaces). */
  name: string
  definition: string
  avoid: string[]
}

// ─── Tracker ────────────────────────────────────────────────────────────────────────────

export type IssueKind = 'spec' | 'ticket' | 'issue'
export type IssueStatus = 'open' | 'in-progress' | 'done' | 'closed'

/** One tracker issue parsed into the domain; neither front matter nor gh JSON leaks past here. */
export type Issue = {
  ref: IssueRef
  title: string
  kind: IssueKind
  status: IssueStatus
  role: TriageRole | null
  parent: IssueRef | null
  blockedBy: IssueRef[]
  isBug: boolean
  /** Specs only: the numbered user stories in the body, for the spec-published toast. */
  stories?: number
  createdAt: Millis | null
  /** Local: repo-relative file path. GitHub: html url. */
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

/** Rich for Local and GitHub (decision 11); GitLab and Other show links only. */
export type TrackerSnapshot =
  | {
      kind: 'local' | 'github'
      rich: true
      issues: Issue[]
      pr: PullRequest | null
      at: Millis
      problem: string | null
    }
  | { kind: 'gitlab' | 'other'; rich: false; links: TrackerLink[]; at: Millis }

// ─── Git ────────────────────────────────────────────────────────────────────────────────

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
  /** Branches merged into each known integration branch. */
  merged: Record<string, string[]>
  /** Integration-branch tip per branch, to notice "the integration branch moved". */
  tips: Record<string, string>
  at: Millis
}

export type Remote = { host: 'github' | 'gitlab' | 'other'; webUrl: string; slug: string | null }

// ─── Feature state (.craftory/features/<n>.json, committed) ─────────────────────────────

/**
 * Non-derivable facts about one phase. Every field is monotone (set once, or only grows), so
 * `mergeFeature(disk, mine)` converges when two sessions write the same file.
 */
export type PhaseMark = {
  ranAt?: IsoTime
  endedAt?: IsoTime
  markedDoneAt?: IsoTime
  artifacts?: string[]
}

export type AgentOutcome = 'running' | 'done' | 'failed' | 'over-budget' | 'stopped'

/** Stored because "Failed (budget)" and the kept worktree cannot be re-derived later. */
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
}

export type FeatureRecord = {
  version: 1
  spec: IssueRef
  title: string
  entry: PhaseId
  enteredFrom: IssueRef | null
  skipped: PhaseId[]
  integrationBranch: string
  pr: IssueRef | null
  marks: Partial<Record<PhaseId, PhaseMark>>
  /** Keyed by ticket ref string. The latest attempt per ticket wins. */
  agents: Record<string, AgentRecord>
}

/**
 * A feature before its spec exists (Align, and Spec until `to-spec` publishes). Personal, so
 * it lives in `$.store`, not the repo: an un-specced idea is nobody else's yet. Promoted to a
 * FeatureRecord file by `bindSpec` once the spec issue shows up.
 */
export type DraftFeature = {
  draftId: string
  title: string
  entry: PhaseId
  enteredFrom: IssueRef | null
  marks: Partial<Record<PhaseId, PhaseMark>>
  startedAt: IsoTime
}

export type FeatureKey = `spec:${string}` | `draft:${string}`

export type Feature =
  | { kind: 'draft'; key: FeatureKey; draft: DraftFeature }
  | { kind: 'specced'; key: FeatureKey; record: FeatureRecord }

// ─── Session facts (atoms only) ─────────────────────────────────────────────────────────

/** A Matt skill observed running in the main thread for the active feature. */
export type Running = {
  phase: PhaseId | null
  entry: EntryId | null
  skill: SkillName
  args: string
  feature: FeatureKey | null
  startedAt: Millis
  /** The last main-thread turn ended while the skill was still active: waiting on the user. */
  isAwaitingUser: boolean
  /** Counted from grill questions answered, when observable (`Q6 of ~14`). */
  progress: string | null
}

export type BudgetState = 'ok' | 'near' | 'over'

/** Seat chosen for one Build implementer at `tool.call {tool:'Agent'}`. */
export type SeatPlan = {
  ticket: IssueRef
  name: string
  branch: string
  path: string
  base: string
  setup: string[] | null
  copy: string[]
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
  /** Set at 100%: the stop message was sent; the agent's next `turn.step` is answered locally. */
  isStopping: boolean
  status: 'running' | 'done' | 'failed' | 'stopped'
  tddStep: string | null
  startedAt: Millis
  lastAt: Millis
}

/** Session-side Build steering state. One owner: the agent hooks in register.tsx. */
export type BuildLedger = {
  pending: Record<string, PendingSeat> // by tool_use_id
  runs: Record<string, AgentRun> // by AgentId
  /** Tickets whose spawn was denied for a slot, oldest first: shown as Queued. */
  queued: IssueRef[]
  isPaused: boolean
}

/** A one-shot pass so **Run anyway** re-runs a dropped command without the gate firing again. */
export type GatePass = { key: string; until: Millis }

// ─── Plugin dependency ──────────────────────────────────────────────────────────────────

export type PluginStatus =
  | { kind: 'checking' }
  | { kind: 'missing' }
  | {
      kind: 'present'
      version: string | null
      inRange: boolean | null
      hasDuplicates: boolean
      skills: SkillName[]
    }

export type InstallState =
  | { kind: 'idle' }
  | { kind: 'installing'; startedAt: Millis }
  | { kind: 'restart' }
  | { kind: 'failed'; message: string }

// ─── Notices (actionable band rows; toasts carry no action in 2.1.302) ──────────────────

/**
 * Event notices are stored (they come from a moment). Derived notices (plugin missing, first
 * run, no feature) are computed by `derivedNotices` from facts and never stored.
 */
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

/** A held gate, as the toast basis sees it. */
export type GateSignalBasis = { id: string; phase: PhaseId; by: PhaseId; reason: string }

/** What a toast is derived from, taken from the same facts as the Flow (src/signals.ts). */
export type SignalBasis = {
  /** The specs that belong to a feature in flight, with their user stories when known. */
  specs: { ref: IssueRef; stories: number | null }[]
  /** The gates the band is holding. */
  gates: GateSignalBasis[]
}

export type NoticeKey = EventNotice['kind'] | 'plugin' | 'first-run' | 'no-feature' | 'duplicates'

// ─── Pane ───────────────────────────────────────────────────────────────────────────────

export type PaneTab = 'flow' | 'tickets' | 'worktrees' | 'glossary' | 'settings'

export type SettingsSection =
  'tracker' | 'docs' | 'glossary' | 'entry' | 'pipeline' | 'worktrees' | 'automation'

export type TermDraft = { name: string; definition: string; avoid: string; editing: string | null }

// ─── Repo snapshot ──────────────────────────────────────────────────────────────────────

export type RepoSnapshot = {
  config: Loaded<CraftoryConfig>
  setup: Loaded<AgentSetup>
  glossary: Loaded<GlossaryDoc>
  /** Which steering file exists, and whether its `## Agent skills` block is present. */
  steering: { file: SteeringFile | null; hasBlock: boolean }
  /** From `git remote get-url origin`; null when there is no remote or the surface runs no commands. */
  remoteHost: 'github' | 'gitlab' | 'other' | null
  hasContextMd: boolean
  hasScratch: boolean
  hasGitignoreEntry: boolean
  at: Millis
}

declare module 'claude-code' {
  interface PluginState {
    craftory: {
      // Facts loaded from the repo and tools (refreshed, never edited in place)
      repo: RepoSnapshot | null
      tracker: TrackerSnapshot | null
      git: GitSnapshot | null
      features: Record<string, FeatureRecord> // by spec ref
      drafts: Record<string, DraftFeature> // by draftId, mirrored to $.store
      plugin: PluginStatus
      install: InstallState
      prefs: PrefOverrides | null
      /** Probed off the render path every five seconds, as session-activity does. */
      appearance: { system: Tone | null; colorFgBg: Tone | null }

      // Session facts
      active: FeatureKey | null
      running: Running | null
      build: BuildLedger
      passes: GatePass[]
      notices: EventNotice[]
      dismissed: NoticeKey[]
      lastReplyTerms: string[]
      glossaryAtStart: string[]

      /** The toast basis last seen; null until the first look after the tracker was read. */
      signals: SignalBasis | null

      // View state
      openStep: PhaseId | 'triage' | null
      isPickingFeature: boolean
      paneTab: PaneTab
      settingsSection: SettingsSection
      termDraft: TermDraft
      glossaryQuery: string
      /** The last setup write's outcome, shown in Settings. */
      setupNote: string | null
    }
  }
}
