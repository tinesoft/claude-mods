/**
 * Feature records: (de)serialise `.craftory/features/<n>.json`, merge concurrent writers,
 * draft to specced promotion, and the pure transitions every hook uses to change a feature.
 *
 * A record stores only facts that cannot be re-derived from the tracker or git. Each fact is
 * monotone (set once, or only grows), so `mergeFeature` is a join: commutative, idempotent, and
 * a crash between read and write loses nothing a re-run cannot restore. The one exception is
 * `unskip`, which is applied after the merge; a stale writer can bring the skip back.
 */
import type {
  AgentOutcome,
  AgentRecord,
  DraftFeature,
  Feature,
  FeatureKey,
  FeatureRecord,
  GitSnapshot,
  IsoTime,
  Issue,
  IssueRef,
  Loaded,
  PhaseId,
  PhaseMark,
  TrackerSnapshot,
} from '../types'
import { PHASE_ORDER } from './phases'
import { parseIssueRef } from './tracker/refs'

export const FEATURES_DIR = '.craftory/features/'
export const STORE_DRAFTS = 'drafts'
export const STORE_LAST_ACTIVE = 'lastActive'

export const featurePath = (spec: IssueRef) => `${FEATURES_DIR}${spec.replace(/^#/, '')}.json`

export const specKey = (spec: IssueRef): FeatureKey => `spec:${spec}`
export const isFeatureKey = (v: unknown): v is FeatureKey =>
  typeof v === 'string' && /^(spec|draft):.+/.test(v)
export const draftKey = (draftId: string): FeatureKey => `draft:${draftId}`

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown) => (typeof v === 'string' ? v : undefined)

const OUTCOMES: readonly AgentOutcome[] = ['running', 'stopped', 'failed', 'over-budget', 'done']
const isPhase = (v: unknown): v is PhaseId => PHASE_ORDER.some(p => p === v)

const min = (a: string | undefined, b: string | undefined) =>
  a === undefined ? b : b === undefined ? a : a <= b ? a : b
const max = (a: string | undefined, b: string | undefined) =>
  a === undefined ? b : b === undefined ? a : a >= b ? a : b
const maxRef = (a: IssueRef | null, b: IssueRef | null) =>
  a === null ? b : b === null ? a : a >= b ? a : b
/** Sorted, so a join does not depend on which writer came first. */
const union = (a: readonly string[] = [], b: readonly string[] = []) =>
  [...new Set([...a, ...b])].sort()
const inPhaseOrder = (phases: Iterable<PhaseId>) => PHASE_ORDER.filter(p => new Set(phases).has(p))

function parseMark(value: unknown): PhaseMark {
  if (!isRecord(value)) return {}
  const artifacts = Array.isArray(value.artifacts)
    ? value.artifacts.filter((a): a is string => typeof a === 'string')
    : undefined
  return {
    ...(text(value.ranAt) && { ranAt: text(value.ranAt)! }),
    ...(text(value.endedAt) && { endedAt: text(value.endedAt)! }),
    ...(text(value.markedDoneAt) && { markedDoneAt: text(value.markedDoneAt)! }),
    ...(artifacts && artifacts.length > 0 && { artifacts }),
  }
}

function parseMarks(value: unknown): Partial<Record<PhaseId, PhaseMark>> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    PHASE_ORDER.flatMap(p => (p in value ? [[p, parseMark(value[p])]] : [])),
  )
}

function parseAgent(key: string, value: unknown): AgentRecord | undefined {
  if (!isRecord(value)) return undefined
  const ticket = parseIssueRef(text(value.ticket) ?? key)
  const outcome = OUTCOMES.find(o => o === value.outcome)
  if (
    !ticket ||
    !outcome ||
    typeof value.tokens !== 'number' ||
    typeof value.budget !== 'number' ||
    !text(value.startedAt)
  ) {
    return undefined
  }
  return {
    ticket,
    name: text(value.name) ?? '',
    branch: text(value.branch) ?? '',
    worktree: text(value.worktree) ?? '',
    tokens: value.tokens,
    budget: value.budget,
    outcome,
    startedAt: text(value.startedAt)!,
    ...(text(value.endedAt) && { endedAt: text(value.endedAt)! }),
  }
}

/** Bad entries are dropped and named in `problem`; only a missing spec or non-JSON is invalid. */
export function parseFeature(raw: string): Loaded<FeatureRecord> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    return { state: 'invalid', raw, problem: error instanceof Error ? error.message : 'not JSON' }
  }
  if (!isRecord(json) || json.version !== 1) {
    return { state: 'invalid', raw, problem: 'expected a version 1 object' }
  }
  const spec = parseIssueRef(text(json.spec) ?? '')
  if (!spec) return { state: 'invalid', raw, problem: 'spec: not an issue reference' }
  const problems: string[] = []
  const agents: Record<string, AgentRecord> = {}
  if (isRecord(json.agents)) {
    for (const [key, value] of Object.entries(json.agents)) {
      const agent = parseAgent(key, value)
      if (agent) agents[agent.ticket] = agent
      else problems.push(`agents.${key}: dropped`)
    }
  }
  const value: FeatureRecord = {
    version: 1,
    spec,
    title: text(json.title) ?? '',
    entry: isPhase(json.entry) ? json.entry : 'align',
    enteredFrom: parseIssueRef(text(json.enteredFrom) ?? '') ?? null,
    skipped: inPhaseOrder(Array.isArray(json.skipped) ? json.skipped.filter(isPhase) : []),
    integrationBranch: text(json.integrationBranch) ?? '',
    pr: parseIssueRef(text(json.pr) ?? '') ?? null,
    marks: parseMarks(json.marks),
    agents,
  }
  return { state: 'ok', value, raw, ...(problems.length > 0 && { problem: problems.join('; ') }) }
}

/** Stable key order and two-space indent so diffs in PRs stay small. Trailing newline. */
export function serialiseFeature(record: FeatureRecord): string {
  const marks = Object.fromEntries(
    PHASE_ORDER.flatMap(p => {
      const m = record.marks[p]
      return m
        ? [
            [
              p,
              {
                ...(m.ranAt && { ranAt: m.ranAt }),
                ...(m.endedAt && { endedAt: m.endedAt }),
                ...(m.markedDoneAt && { markedDoneAt: m.markedDoneAt }),
                ...(m.artifacts && { artifacts: m.artifacts }),
              },
            ],
          ]
        : []
    }),
  )
  const agents = Object.fromEntries(
    Object.keys(record.agents)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map(k => {
        const a = record.agents[k]!
        return [
          k,
          {
            ticket: a.ticket,
            name: a.name,
            branch: a.branch,
            worktree: a.worktree,
            tokens: a.tokens,
            budget: a.budget,
            outcome: a.outcome,
            startedAt: a.startedAt,
            ...(a.endedAt && { endedAt: a.endedAt }),
          },
        ]
      }),
  )
  return `${JSON.stringify(
    {
      version: 1,
      spec: record.spec,
      title: record.title,
      entry: record.entry,
      enteredFrom: record.enteredFrom,
      skipped: inPhaseOrder(record.skipped),
      integrationBranch: record.integrationBranch,
      pr: record.pr,
      marks,
      agents,
    },
    null,
    2,
  )}\n`
}

const mergeMark = (a: PhaseMark = {}, b: PhaseMark = {}): PhaseMark => {
  const ranAt = min(a.ranAt, b.ranAt)
  const endedAt = max(a.endedAt, b.endedAt)
  const markedDoneAt = min(a.markedDoneAt, b.markedDoneAt)
  const artifacts = union(a.artifacts, b.artifacts)
  return {
    ...(ranAt && { ranAt }),
    ...(endedAt && { endedAt }),
    ...(markedDoneAt && { markedDoneAt }),
    ...(artifacts.length > 0 && { artifacts }),
  }
}

/** Newer attempt wins; the same attempt keeps the larger count and the later outcome. */
function mergeAgent(a: AgentRecord, b: AgentRecord): AgentRecord {
  if (a.startedAt !== b.startedAt) return a.startedAt > b.startedAt ? a : b
  const [first, second] =
    OUTCOMES.indexOf(a.outcome) >= OUTCOMES.indexOf(b.outcome) ? [a, b] : [b, a]
  const endedAt = max(first.endedAt, second.endedAt)
  return {
    ...first,
    tokens: Math.max(a.tokens, b.tokens),
    budget: Math.max(a.budget, b.budget),
    ...(endedAt && { endedAt }),
  }
}

const earlierPhase = (a: PhaseId, b: PhaseId) =>
  PHASE_ORDER.indexOf(a) <= PHASE_ORDER.indexOf(b) ? a : b

/**
 * Join of two records for the same spec. Per field: marks keep the earliest `ranAt` and
 * `markedDoneAt`, the latest `endedAt` and the union of artifacts; agents keep the newer attempt
 * per ticket; skipped is a union. Fields set once at creation (title, branch, entry, pr) take the
 * greater value, so the join stays commutative.
 */
export function mergeFeature(disk: FeatureRecord | null, mine: FeatureRecord): FeatureRecord {
  if (disk === null) return mine
  const marks: Partial<Record<PhaseId, PhaseMark>> = {}
  for (const p of PHASE_ORDER) {
    if (disk.marks[p] || mine.marks[p]) marks[p] = mergeMark(disk.marks[p], mine.marks[p])
  }
  const agents: Record<string, AgentRecord> = { ...disk.agents }
  for (const [k, a] of Object.entries(mine.agents)) {
    const old = agents[k]
    agents[k] = old ? mergeAgent(old, a) : a
  }
  return {
    version: 1,
    spec: mine.spec,
    title: max(disk.title, mine.title) ?? '',
    entry: earlierPhase(disk.entry, mine.entry),
    enteredFrom: maxRef(disk.enteredFrom, mine.enteredFrom),
    skipped: inPhaseOrder([...disk.skipped, ...mine.skipped]),
    integrationBranch: max(disk.integrationBranch, mine.integrationBranch) ?? '',
    pr: maxRef(disk.pr, mine.pr),
    marks,
    agents,
  }
}

// ─── Transitions ────────────────────────────────────────────────────────────────────────

export type FeatureChange =
  | { kind: 'ran'; phase: PhaseId; at: IsoTime }
  | { kind: 'ended'; phase: PhaseId; at: IsoTime; artifacts?: string[] }
  | { kind: 'mark-done'; phase: PhaseId; at: IsoTime }
  | { kind: 'skip'; phase: PhaseId }
  | { kind: 'unskip'; phase: PhaseId }
  | { kind: 'agent'; record: AgentRecord }
  | { kind: 'pr'; pr: IssueRef }

type Marks = Partial<Record<PhaseId, PhaseMark>>

function changeMarks(marks: Marks, change: FeatureChange): Marks {
  switch (change.kind) {
    case 'ran':
      return { ...marks, [change.phase]: mergeMark(marks[change.phase], { ranAt: change.at }) }
    case 'ended':
      return {
        ...marks,
        [change.phase]: mergeMark(marks[change.phase], {
          endedAt: change.at,
          ...(change.artifacts && { artifacts: change.artifacts }),
        }),
      }
    case 'mark-done':
      return {
        ...marks,
        [change.phase]: mergeMark(marks[change.phase], { markedDoneAt: change.at }),
      }
    default:
      return marks
  }
}

/** Applies one change. Running it twice yields the same record. */
export function applyChange(record: FeatureRecord, change: FeatureChange): FeatureRecord {
  switch (change.kind) {
    case 'ran':
    case 'ended':
    case 'mark-done':
      return { ...record, marks: changeMarks(record.marks, change) }
    case 'skip':
      return { ...record, skipped: inPhaseOrder([...record.skipped, change.phase]) }
    case 'unskip':
      return { ...record, skipped: record.skipped.filter(p => p !== change.phase) }
    case 'agent': {
      const old = record.agents[change.record.ticket]
      return {
        ...record,
        agents: {
          ...record.agents,
          [change.record.ticket]: old ? mergeAgent(old, change.record) : change.record,
        },
      }
    }
    case 'pr':
      return { ...record, pr: change.pr }
    default: {
      const _exhaustive: never = change
      return _exhaustive
    }
  }
}

/** The same marks on a draft; skips, agents and the PR cannot happen before a spec. */
export function applyDraftChange(draft: DraftFeature, change: FeatureChange): DraftFeature {
  return { ...draft, marks: changeMarks(draft.marks, change) }
}

export function newDraft(args: {
  draftId: string
  title: string
  entry: PhaseId
  enteredFrom: IssueRef | null
  at: IsoTime
}): DraftFeature {
  return {
    draftId: args.draftId,
    title: args.title,
    entry: args.entry,
    enteredFrom: args.enteredFrom,
    marks: {},
    startedAt: args.at,
  }
}

/**
 * The spec a draft produced: the earliest spec issue created at or after the draft's Spec
 * `ranAt` and not already bound to another feature. Undefined until it exists.
 */
export function bindSpec(
  draft: DraftFeature,
  tracker: TrackerSnapshot,
  bound: ReadonlySet<string>,
): Issue | undefined {
  const ranAt = draft.marks.spec?.ranAt
  if (!tracker.rich || ranAt === undefined) return undefined
  const since = Date.parse(ranAt)
  return tracker.issues
    .filter(
      i => i.kind === 'spec' && !bound.has(i.ref) && i.createdAt !== null && i.createdAt >= since,
    )
    .sort(
      (a, b) => a.createdAt! - b.createdAt! || a.ref.localeCompare(b.ref, 'en', { numeric: true }),
    )[0]
}

/** Draft and its spec: the first record written to disk. Marks carry over. */
export function promote(
  draft: DraftFeature,
  spec: Issue,
  integrationBranch: string,
): FeatureRecord {
  return {
    version: 1,
    spec: spec.ref,
    title: spec.title || draft.title,
    entry: draft.entry,
    enteredFrom: draft.enteredFrom,
    skipped: [],
    integrationBranch,
    pr: null,
    marks: draft.marks,
    agents: {},
  }
}

const touchedAt = (record: FeatureRecord) =>
  Math.max(
    0,
    ...Object.values(record.marks)
      .flatMap(m => [m.ranAt, m.endedAt, m.markedDoneAt])
      .flatMap(t => (t ? [Date.parse(t)] : [])),
    ...Object.values(record.agents).flatMap(a => [Date.parse(a.startedAt)]),
  )

/**
 * Which feature this session works on at start: the record whose integration branch is the
 * checked-out branch, else the stored last active key when it still exists, else the most
 * recently touched record, else the newest draft, else null (the "Start a feature" notice).
 */
export function pickActive(args: {
  features: Readonly<Record<string, FeatureRecord>>
  drafts: Readonly<Record<string, DraftFeature>>
  git: GitSnapshot | null
  lastActive: FeatureKey | null
}): FeatureKey | null {
  const records = Object.values(args.features)
  const onBranch = records.find(
    r => r.integrationBranch !== '' && r.integrationBranch === args.git?.branch,
  )
  if (onBranch) return specKey(onBranch.spec)
  if (args.lastActive && featureOf(args.lastActive, args.features, args.drafts))
    return args.lastActive
  const newest = records.sort((a, b) => touchedAt(b) - touchedAt(a))[0]
  if (newest) return specKey(newest.spec)
  const draft = Object.values(args.drafts).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  return draft ? draftKey(draft.draftId) : null
}

export function featureOf(
  key: FeatureKey | null,
  features: Readonly<Record<string, FeatureRecord>>,
  drafts: Readonly<Record<string, DraftFeature>>,
): Feature | null {
  if (key === null) return null
  const id = key.slice(key.indexOf(':') + 1)
  if (key.startsWith('draft:')) {
    const draft = drafts[id]
    return draft ? { kind: 'draft', key, draft } : null
  }
  const record = features[id]
  return record ? { kind: 'specced', key, record } : null
}

export const markOf = (feature: Feature, phase: PhaseId): PhaseMark =>
  (feature.kind === 'draft' ? feature.draft.marks : feature.record.marks)[phase] ?? {}

/** `$.store.get(STORE_DRAFTS)` is unknown data: keep the drafts that parse, by draft id. */
export function parseDrafts(stored: unknown): Record<string, DraftFeature> {
  if (!isRecord(stored)) return {}
  return Object.fromEntries(
    Object.entries(stored).flatMap(([id, value]) => {
      if (!isRecord(value) || !text(value.title) || !text(value.startedAt)) return []
      const draft: DraftFeature = {
        draftId: id,
        title: text(value.title)!,
        entry: isPhase(value.entry) ? value.entry : 'align',
        enteredFrom: parseIssueRef(text(value.enteredFrom) ?? '') ?? null,
        marks: parseMarks(value.marks),
        startedAt: text(value.startedAt)!,
      }
      return [[id, draft]]
    }),
  )
}
