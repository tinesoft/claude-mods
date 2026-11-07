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
  SkipMark,
  TrackerSnapshot,
} from '../types'
import { isSafeRef } from './git'
import { PHASE_ORDER } from './phases'
import { parseIssueRef, parseRef, refSlug } from './tracker/refs'

export const FEATURES_DIR = '.craftory/features/'
export const STORE_DRAFTS = 'drafts'
export const STORE_LAST_ACTIVE = 'lastActive'

export const featurePath = (spec: IssueRef) => `${FEATURES_DIR}${refSlug(spec)}.json`

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
const union = (a: readonly string[] = [], b: readonly string[] = []) =>
  [...new Set([...a, ...b])].sort()

/** Files written before skips carried times list the phases; they count as skipped since the epoch. */
const LEGACY_SKIPPED_AT: IsoTime = '1970-01-01T00:00:00.001Z'

const isStamp = (v: unknown): v is IsoTime => typeof v === 'string' && !Number.isNaN(Date.parse(v))

const stampOf = (v: unknown) => (isStamp(v) ? v : undefined)

/** The wayfinder facts a record and a draft both hold, set only when there is something to say. */
type WayFields = Pick<FeatureRecord, 'map' | 'wayfinderSuggestDismissed'>

const wayFields = (from: {
  map?: IssueRef | undefined
  wayfinderSuggestDismissed?: boolean | undefined
}): WayFields => ({
  ...(from.map && { map: from.map }),
  ...(from.wayfinderSuggestDismissed && { wayfinderSuggestDismissed: true as const }),
})

/** The wayfinder fields as a stored object spells them, bad values dropped. */
const parseWayFields = (json: Json): WayFields =>
  wayFields({
    map: parseRef(text(json.map) ?? ''),
    wayfinderSuggestDismissed: json.wayfinderSuggestDismissed === true,
  })

export function isSkipped(record: Pick<FeatureRecord, 'skips'>, phase: PhaseId): boolean {
  const mark = record.skips[phase]
  if (mark?.skippedAt === undefined) return false
  return Date.parse(mark.skippedAt) > Date.parse(mark.unskippedAt ?? '1970-01-01T00:00:00.000Z')
}

const mergeSkip = (a: SkipMark = {}, b: SkipMark = {}): SkipMark => {
  const skippedAt = max(a.skippedAt, b.skippedAt)
  const unskippedAt = max(a.unskippedAt, b.unskippedAt)
  return { ...(skippedAt && { skippedAt }), ...(unskippedAt && { unskippedAt }) }
}

function parseSkips(skips: unknown, legacy: unknown): FeatureRecord['skips'] {
  const found: FeatureRecord['skips'] = {}
  for (const phase of PHASE_ORDER) {
    const value = isRecord(skips) ? skips[phase] : undefined
    const mark = mergeSkip(
      isRecord(value)
        ? {
            ...(stampOf(value.skippedAt) && { skippedAt: stampOf(value.skippedAt)! }),
            ...(stampOf(value.unskippedAt) && { unskippedAt: stampOf(value.unskippedAt)! }),
          }
        : {},
      Array.isArray(legacy) && legacy.includes(phase) ? { skippedAt: LEGACY_SKIPPED_AT } : {},
    )
    if (mark.skippedAt !== undefined || mark.unskippedAt !== undefined) found[phase] = mark
  }
  return found
}

function serialiseSkips(skips: FeatureRecord['skips']) {
  return Object.fromEntries(
    PHASE_ORDER.flatMap(p => {
      const m = skips[p]
      return m && (m.skippedAt || m.unskippedAt)
        ? [
            [
              p,
              {
                ...(m.skippedAt && { skippedAt: m.skippedAt }),
                ...(m.unskippedAt && { unskippedAt: m.unskippedAt }),
              },
            ],
          ]
        : []
    }),
  )
}

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
  const ticket = parseRef(text(value.ticket) ?? key)
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
  const spec = parseRef(text(json.spec) ?? '')
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
  const rawBranch = text(json.integrationBranch) ?? ''
  const branch = isSafeRef(rawBranch) ? rawBranch : ''
  if (rawBranch !== '' && branch === '')
    problems.push(`integrationBranch: ${JSON.stringify(rawBranch)} is not a safe branch name`)
  const value: FeatureRecord = {
    version: 1,
    spec,
    origin: json.origin === 'issue' ? 'issue' : 'spec',
    title: text(json.title) ?? '',
    entry: isPhase(json.entry) ? json.entry : 'align',
    enteredFrom: parseRef(text(json.enteredFrom) ?? '') ?? null,
    skips: parseSkips(json.skips, json.skipped),
    integrationBranch: branch,
    pr: parseIssueRef(text(json.pr) ?? '') ?? null,
    ...parseWayFields(json),
    marks: parseMarks(json.marks),
    agents,
  }
  return { state: 'ok', value, raw, ...(problems.length > 0 && { problem: problems.join('; ') }) }
}

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
      origin: record.origin,
      title: record.title,
      entry: record.entry,
      enteredFrom: record.enteredFrom,
      skips: serialiseSkips(record.skips),
      integrationBranch: record.integrationBranch,
      pr: record.pr,
      ...wayFields(record),
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

const mergeSkips = (a: FeatureRecord['skips'], b: FeatureRecord['skips']): FeatureRecord['skips'] =>
  Object.fromEntries(PHASE_ORDER.flatMap(p => (a[p] || b[p] ? [[p, mergeSkip(a[p], b[p])]] : [])))

const earlierPhase = (a: PhaseId, b: PhaseId) =>
  PHASE_ORDER.indexOf(a) <= PHASE_ORDER.indexOf(b) ? a : b

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
    origin: disk.origin === 'issue' || mine.origin === 'issue' ? 'issue' : 'spec',
    title: max(disk.title, mine.title) ?? '',
    entry: earlierPhase(disk.entry, mine.entry),
    enteredFrom: maxRef(disk.enteredFrom, mine.enteredFrom),
    skips: mergeSkips(disk.skips, mine.skips),
    integrationBranch: max(disk.integrationBranch, mine.integrationBranch) ?? '',
    pr: maxRef(disk.pr, mine.pr),
    ...wayFields({
      map: mine.map ?? disk.map,
      wayfinderSuggestDismissed: mine.wayfinderSuggestDismissed ?? disk.wayfinderSuggestDismissed,
    }),
    marks,
    agents,
  }
}

export type FeatureChange =
  | { kind: 'ran'; phase: PhaseId; at: IsoTime }
  | { kind: 'ended'; phase: PhaseId; at: IsoTime; artifacts?: string[] }
  | { kind: 'mark-done'; phase: PhaseId; at: IsoTime }
  | { kind: 'skip'; phase: PhaseId; at: IsoTime }
  | { kind: 'unskip'; phase: PhaseId; at: IsoTime }
  | { kind: 'agent'; record: AgentRecord }
  | { kind: 'pr'; pr: IssueRef }
  | { kind: 'dismiss-wayfinder' }
  | { kind: 'link-map'; map: IssueRef }

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

/** A link is set once and then kept: the mod never rewrites one, stale or not. */
function wayChange<T extends WayFields>(held: T, change: FeatureChange): T {
  if (change.kind === 'dismiss-wayfinder') return { ...held, wayfinderSuggestDismissed: true }
  if (change.kind === 'link-map') return { ...held, map: held.map ?? change.map }
  return held
}

export function applyChange(record: FeatureRecord, change: FeatureChange): FeatureRecord {
  switch (change.kind) {
    case 'ran':
    case 'ended':
    case 'mark-done':
      return { ...record, marks: changeMarks(record.marks, change) }
    case 'skip':
      return {
        ...record,
        skips: {
          ...record.skips,
          [change.phase]: mergeSkip(record.skips[change.phase], { skippedAt: change.at }),
        },
      }
    case 'unskip':
      return {
        ...record,
        skips: {
          ...record.skips,
          [change.phase]: mergeSkip(record.skips[change.phase], { unskippedAt: change.at }),
        },
      }
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
    case 'dismiss-wayfinder':
    case 'link-map':
      return wayChange(record, change)
    default: {
      const _exhaustive: never = change
      return _exhaustive
    }
  }
}

export function applyDraftChange(draft: DraftFeature, change: FeatureChange): DraftFeature {
  if (change.kind === 'dismiss-wayfinder' || change.kind === 'link-map')
    return wayChange(draft, change)
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

export function promote(
  draft: DraftFeature,
  spec: Issue,
  integrationBranch: string,
): FeatureRecord {
  return {
    version: 1,
    spec: spec.ref,
    origin: 'spec',
    title: spec.title || draft.title,
    entry: draft.entry,
    enteredFrom: draft.enteredFrom,
    skips: {},
    integrationBranch,
    pr: null,
    ...wayFields(draft),
    marks: draft.marks,
    agents: {},
  }
}

export function enteredRecord(args: {
  issue: Pick<Issue, 'ref' | 'title' | 'kind'>
  phase: PhaseId
  integrationBranch: string
  at: IsoTime
}): FeatureRecord {
  const { issue, phase, integrationBranch, at } = args
  return {
    version: 1,
    spec: issue.ref,
    origin: issue.kind === 'spec' ? 'spec' : 'issue',
    title: issue.title,
    entry: phase,
    enteredFrom: issue.ref,
    skips: Object.fromEntries(
      PHASE_ORDER.slice(0, PHASE_ORDER.indexOf(phase)).map(p => [p, { skippedAt: at }]),
    ),
    integrationBranch,
    pr: null,
    marks: {},
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

export function parseDrafts(stored: unknown): Record<string, DraftFeature> {
  if (!isRecord(stored)) return {}
  return Object.fromEntries(
    Object.entries(stored).flatMap(([id, value]) => {
      if (!isRecord(value) || !text(value.title) || !text(value.startedAt)) return []
      const draft: DraftFeature = {
        draftId: id,
        title: text(value.title)!,
        entry: isPhase(value.entry) ? value.entry : 'align',
        enteredFrom: parseRef(text(value.enteredFrom) ?? '') ?? null,
        marks: parseMarks(value.marks),
        startedAt: text(value.startedAt)!,
        ...parseWayFields(value),
      }
      return [[id, draft]]
    }),
  )
}

export type FeatureChoice = { key: FeatureKey; title: string; isActive: boolean }

/** Every feature and draft the picker can switch to, the active one marked. */
export function featureChoices(
  features: Readonly<Record<string, FeatureRecord>>,
  drafts: Readonly<Record<string, DraftFeature>>,
  active: FeatureKey | null,
): FeatureChoice[] {
  return [
    ...Object.values(features).map(f => ({
      key: specKey(f.spec),
      title: f.title || f.spec,
      isActive: specKey(f.spec) === active,
    })),
    ...Object.values(drafts).map(d => ({
      key: draftKey(d.draftId),
      title: d.title,
      isActive: draftKey(d.draftId) === active,
    })),
  ]
}
