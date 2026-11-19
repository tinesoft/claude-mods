import type {
  AgentOutcome,
  AgentRecord,
  BudgetScope,
  DraftFeature,
  Feature,
  FeatureBudgets,
  FeatureForecast,
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
  TestRun,
  TrackerSnapshot,
} from '../types'
import { BUDGET_MAX_USD } from './config'
import { parseForecast } from './forecast'
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

/**
 * What a record and a draft both hold besides their marks: the wayfinder facts and the latest
 * handoff, each set only when there is something to say.
 */
type SharedFields = Pick<FeatureRecord, 'map' | 'wayfinderSuggestDismissed' | 'handoff'>

const sharedFields = (from: {
  map?: IssueRef | undefined
  wayfinderSuggestDismissed?: boolean | undefined
  handoff?: string | undefined
}): SharedFields => ({
  ...(from.map && { map: from.map }),
  ...(from.wayfinderSuggestDismissed && { wayfinderSuggestDismissed: true as const }),
  ...(from.handoff && { handoff: from.handoff }),
})

/** The shared fields as a stored object spells them, bad values dropped. */
const parseSharedFields = (json: Json): SharedFields =>
  sharedFields({
    map: parseRef(text(json.map) ?? ''),
    wayfinderSuggestDismissed: json.wayfinderSuggestDismissed === true,
    handoff: text(json.handoff),
  })

/** One own budget: whole dollars, `null` for "use the default", undefined when unset or unreadable. */
type OwnBudget = number | null | undefined

const budgetOf = (v: unknown): OwnBudget => {
  if (v === null) return null
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
    ? Math.min(BUDGET_MAX_USD, Math.round(v))
    : undefined
}

/** Budgets with only what is set, phases in phase order; undefined when none is. */
function budgetsOf(usd: OwnBudget, phases: (p: PhaseId) => OwnBudget) {
  const own = Object.fromEntries(
    PHASE_ORDER.flatMap(p => (phases(p) === undefined ? [] : [[p, phases(p)!]])),
  ) as Partial<Record<PhaseId, number | null>>
  const budgets: FeatureBudgets = {
    ...(usd !== undefined && { usd }),
    ...(Object.keys(own).length > 0 && { phases: own }),
  }
  return Object.keys(budgets).length === 0 ? undefined : budgets
}

const parseBudgets = (v: unknown): FeatureBudgets | undefined =>
  isRecord(v)
    ? budgetsOf(budgetOf(v.usd), p => (isRecord(v.phases) ? budgetOf(v.phases[p]) : undefined))
    : undefined

/** The writer's budget when it set one, a `null` "use the default" included; else the disk's. */
const mineOr = (disk: OwnBudget, mine: OwnBudget) => (mine === undefined ? disk : mine)

/** Each budget the writer set wins, a cleared one too; one only the disk has is kept. */
const mergeBudgets = (disk: FeatureBudgets | undefined, mine: FeatureBudgets | undefined) =>
  budgetsOf(mineOr(disk?.usd, mine?.usd), p => mineOr(disk?.phases?.[p], mine?.phases?.[p]))

const withBudgets = (budgets: FeatureBudgets | undefined) => (budgets ? { budgets } : {})

const withForecast = (forecast: FeatureForecast | undefined) => (forecast ? { forecast } : {})

/** The forecast saved first wins: one is written once and never overwritten. */
const firstForecast = (a: FeatureForecast | undefined, b: FeatureForecast | undefined) =>
  a === undefined || (b !== undefined && Date.parse(b.at) < Date.parse(a.at)) ? b : a

export function isSkipped(record: Pick<FeatureRecord, 'skips'>, phase: PhaseId): boolean {
  const mark = record.skips[phase]
  if (mark?.skippedAt === undefined) return false
  return Date.parse(mark.skippedAt) > Date.parse(mark.unskippedAt ?? '1970-01-01T00:00:00.000Z')
}

/** Archived while the last archive is later than the last unarchive. */
export const isArchived = (record: Pick<FeatureRecord, 'archivedAt' | 'unarchivedAt'>): boolean =>
  record.archivedAt !== undefined &&
  Date.parse(record.archivedAt) > Date.parse(record.unarchivedAt ?? '1970-01-01T00:00:00.000Z')

/**
 * A Feature is finished once Ship is done or it is archived. From its record alone Ship counts as
 * done when it was marked done, or when Retro ran, which only runs after Ship.
 */
export const isFinished = (
  record: Pick<FeatureRecord, 'marks' | 'archivedAt' | 'unarchivedAt'>,
): boolean =>
  isArchived(record) ||
  record.marks.ship?.markedDoneAt !== undefined ||
  record.marks.retro?.ranAt !== undefined

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
    ...(text(value.unparsedAt) && { unparsedAt: text(value.unparsedAt)! }),
    ...(text(value.nudgedAt) && { nudgedAt: text(value.nudgedAt)! }),
  }
}

function parseMarks(value: unknown): Partial<Record<PhaseId, PhaseMark>> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    PHASE_ORDER.flatMap(p => (p in value ? [[p, parseMark(value[p])]] : [])),
  )
}

function parseTest(value: unknown): TestRun | undefined {
  if (!isRecord(value) || !text(value.at) || typeof value.passed !== 'boolean') return undefined
  return {
    at: text(value.at)!,
    passed: value.passed,
    ...(text(value.reason) && { reason: text(value.reason)! }),
    ...(text(value.tail) && { tail: text(value.tail)! }),
  }
}

function parseAgent(key: string, value: unknown): AgentRecord | undefined {
  if (!isRecord(value)) return undefined
  const ticket = parseRef(text(value.ticket) ?? key)
  const outcome = OUTCOMES.find(o => o === value.outcome)
  const test = parseTest(value.test)
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
    ...(test && { test }),
    ...(text(value.model) && { model: text(value.model)! }),
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
    ...(json.retroOffered === true && { retroOffered: true as const }),
    ...(stampOf(json.archivedAt) && { archivedAt: stampOf(json.archivedAt)! }),
    ...(stampOf(json.unarchivedAt) && { unarchivedAt: stampOf(json.unarchivedAt)! }),
    ...parseSharedFields(json),
    ...withBudgets(parseBudgets(json.budgets)),
    ...withForecast(parseForecast(json.forecast)),
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
                ...(m.unparsedAt && { unparsedAt: m.unparsedAt }),
                ...(m.nudgedAt && { nudgedAt: m.nudgedAt }),
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
            ...(a.test && { test: a.test }),
            ...(a.model && { model: a.model }),
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
      ...(record.retroOffered && { retroOffered: true }),
      ...(record.archivedAt && { archivedAt: record.archivedAt }),
      ...(record.unarchivedAt && { unarchivedAt: record.unarchivedAt }),
      ...sharedFields(record),
      ...withBudgets(budgetsOf(record.budgets?.usd, p => record.budgets?.phases?.[p])),
      ...withForecast(record.forecast),
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
  const unparsedAt = max(a.unparsedAt, b.unparsedAt)
  const nudgedAt = min(a.nudgedAt, b.nudgedAt)
  return {
    ...(ranAt && { ranAt }),
    ...(endedAt && { endedAt }),
    ...(markedDoneAt && { markedDoneAt }),
    ...(artifacts.length > 0 && { artifacts }),
    ...(unparsedAt && { unparsedAt }),
    ...(nudgedAt && { nudgedAt }),
  }
}

function mergeAgent(a: AgentRecord, b: AgentRecord): AgentRecord {
  if (a.startedAt !== b.startedAt) return a.startedAt > b.startedAt ? a : b
  const [first, second] =
    OUTCOMES.indexOf(a.outcome) >= OUTCOMES.indexOf(b.outcome) ? [a, b] : [b, a]
  const endedAt = max(first.endedAt, second.endedAt)
  // the latest test run of the attempt wins, so a passing re-run clears a failed one
  const tests = [a.test, b.test].filter(t => t !== undefined)
  const test = tests.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))[0]
  const model = first.model ?? second.model
  return {
    ...first,
    tokens: Math.max(a.tokens, b.tokens),
    budget: Math.max(a.budget, b.budget),
    ...(endedAt && { endedAt }),
    ...(test && { test }),
    ...(model && { model }),
  }
}

const mergeSkips = (a: FeatureRecord['skips'], b: FeatureRecord['skips']): FeatureRecord['skips'] =>
  Object.fromEntries(PHASE_ORDER.flatMap(p => (a[p] || b[p] ? [[p, mergeSkip(a[p], b[p])]] : [])))

const earlierPhase = (a: PhaseId, b: PhaseId) =>
  PHASE_ORDER.indexOf(a) <= PHASE_ORDER.indexOf(b) ? a : b

const stamps = (archivedAt: IsoTime | undefined, unarchivedAt: IsoTime | undefined) => ({
  ...(archivedAt && { archivedAt }),
  ...(unarchivedAt && { unarchivedAt }),
})

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
    ...sharedFields({
      map: mine.map ?? disk.map,
      wayfinderSuggestDismissed: mine.wayfinderSuggestDismissed ?? disk.wayfinderSuggestDismissed,
      handoff: mine.handoff ?? disk.handoff,
    }),
    ...((mine.retroOffered || disk.retroOffered) && { retroOffered: true as const }),
    ...stamps(max(disk.archivedAt, mine.archivedAt), max(disk.unarchivedAt, mine.unarchivedAt)),
    ...withBudgets(mergeBudgets(disk.budgets, mine.budgets)),
    ...withForecast(firstForecast(disk.forecast, mine.forecast)),
    marks,
    agents,
  }
}

export type FeatureChange =
  | { kind: 'ran'; phase: PhaseId; at: IsoTime }
  | { kind: 'ended'; phase: PhaseId; at: IsoTime; artifacts?: string[]; isUnparsed?: true }
  | { kind: 'mark-done'; phase: PhaseId; at: IsoTime }
  | { kind: 'nudged'; phase: PhaseId; at: IsoTime }
  | { kind: 'skip'; phase: PhaseId; at: IsoTime }
  | { kind: 'unskip'; phase: PhaseId; at: IsoTime }
  | { kind: 'agent'; record: AgentRecord }
  | { kind: 'pr'; pr: IssueRef }
  | { kind: 'dismiss-wayfinder' }
  | { kind: 'link-map'; map: IssueRef }
  | { kind: 'retro-offered' }
  | { kind: 'archive'; at: IsoTime }
  | { kind: 'unarchive'; at: IsoTime }
  /** The latest handoff document wins: the card links the one written last. */
  | { kind: 'handoff'; path: string }
  /** The Feature's own budget for itself or one phase, whole dollars; `0` is none, `null` the default. */
  | { kind: 'budget'; target: BudgetScope; usd: number | null }
  /** Build's forecast as Build starts; kept once saved. */
  | { kind: 'forecast'; forecast: FeatureForecast }

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
          ...(change.isUnparsed && { unparsedAt: change.at }),
        }),
      }
    case 'mark-done':
      return {
        ...marks,
        [change.phase]: mergeMark(marks[change.phase], { markedDoneAt: change.at }),
      }
    case 'nudged':
      return { ...marks, [change.phase]: mergeMark(marks[change.phase], { nudgedAt: change.at }) }
    default:
      return marks
  }
}

/**
 * Applies a change to the fields a draft and a record share. A map link is set once and then
 * kept: the mod never rewrites one, stale or not.
 */
function sharedChange<T extends SharedFields>(held: T, change: FeatureChange): T {
  if (change.kind === 'dismiss-wayfinder') return { ...held, wayfinderSuggestDismissed: true }
  if (change.kind === 'link-map') return { ...held, map: held.map ?? change.map }
  if (change.kind === 'handoff') return { ...held, handoff: change.path }
  return held
}

/**
 * New work on an archived Feature brings it back: a phase that runs or ends, or an agent that
 * starts, after the archive. A retro is the exception, since it normally runs after Ship.
 */
function revived(record: FeatureRecord, at: IsoTime): FeatureRecord {
  if (!isArchived(record) || Date.parse(at) <= Date.parse(record.archivedAt!)) return record
  return { ...record, unarchivedAt: at }
}

export function applyChange(record: FeatureRecord, change: FeatureChange): FeatureRecord {
  switch (change.kind) {
    case 'ran':
    case 'ended': {
      const next = { ...record, marks: changeMarks(record.marks, change) }
      return change.phase === 'retro' ? next : revived(next, change.at)
    }
    case 'mark-done':
    case 'nudged':
      return { ...record, marks: changeMarks(record.marks, change) }
    case 'archive':
      return { ...record, archivedAt: max(record.archivedAt, change.at)! }
    case 'unarchive':
      return { ...record, unarchivedAt: max(record.unarchivedAt, change.at)! }
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
      return revived(
        {
          ...record,
          agents: {
            ...record.agents,
            [change.record.ticket]: old ? mergeAgent(old, change.record) : change.record,
          },
        },
        change.record.startedAt,
      )
    }
    case 'pr':
      return { ...record, pr: change.pr }
    case 'forecast':
      return record.forecast === undefined ? { ...record, forecast: change.forecast } : record
    case 'retro-offered':
      return { ...record, retroOffered: true }
    case 'budget':
      return {
        ...record,
        budgets:
          change.target === 'feature'
            ? { ...record.budgets, usd: change.usd }
            : {
                ...record.budgets,
                phases: { ...record.budgets?.phases, [change.target]: change.usd },
              },
      }
    case 'dismiss-wayfinder':
    case 'link-map':
    case 'handoff':
      return sharedChange(record, change)
    default: {
      const _exhaustive: never = change
      return _exhaustive
    }
  }
}

export function applyDraftChange(draft: DraftFeature, change: FeatureChange): DraftFeature {
  // A draft has no record to keep a budget on: it gets the defaults only
  // nor a forecast: Build starts only once there is a spec
  if (
    change.kind === 'archive' ||
    change.kind === 'unarchive' ||
    change.kind === 'budget' ||
    change.kind === 'forecast'
  )
    return draft
  if (
    change.kind === 'dismiss-wayfinder' ||
    change.kind === 'link-map' ||
    change.kind === 'handoff'
  )
    return sharedChange(draft, change)
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
    ...sharedFields(draft),
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
  const live = args.lastActive && featureOf(args.lastActive, args.features, args.drafts)
  if (live && !(live.kind === 'specced' && isArchived(live.record))) return args.lastActive
  const newest = records.filter(r => !isArchived(r)).sort((a, b) => touchedAt(b) - touchedAt(a))[0]
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

/** The handoff document linked from the feature's card, or null when none was written. */
export const handoffOf = (feature: Feature): string | null =>
  (feature.kind === 'draft' ? feature.draft.handoff : feature.record.handoff) ?? null

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
        ...parseSharedFields(value),
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
    ...Object.values(features)
      // an archived one is listed only while it is the active one, as when its branch is checked out
      .filter(f => !isArchived(f) || specKey(f.spec) === active)
      .map(f => ({
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
