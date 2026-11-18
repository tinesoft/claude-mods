/**
 * Spend: what each answered step cost, charged to a feature, phase, ticket and agent.
 *
 * Tokens come from the step itself. Dollars come from the session's `cost.usd`, which counts
 * every priced response: a reading that moved is shared out over the steps answered since the
 * last one. One step takes the whole delta. Several take it by weight, and when they belong to
 * different rows each row's share is an estimate (`≈`); their sum is still the exact delta.
 */
import type {
  AgentId,
  AgentRun,
  FeatureKey,
  IsoTime,
  IssueRef,
  LocalSpend,
  Loaded,
  Millis,
  PhaseId,
  Running,
  SpendFile,
  SpendLedger,
  SpendPhase,
  SpendRow,
  SpendStep,
  SpendTarget,
  TokenCounts,
} from '../types'
import { SPEND_DIR } from './files'
import { PHASE_ORDER } from './phases'
import { refSlug } from './tracker/refs'

export const EMPTY_SPEND: SpendLedger = { baseline: null, queue: [], rows: {} }

/**
 * Steps held for a reading that does not move. A host whose cost never grows would otherwise hold
 * them all; past this many they are rolled up unpriced, their tokens kept.
 */
export const QUEUE_MAX = 200

/** Cache reads bill at a tenth of input, so they weigh a tenth when a delta is shared out. */
const CACHE_READ_WEIGHT = 0.1

export const ZERO_TOKENS: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export const tokensOf = (usage: {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}): TokenCounts => ({
  input: usage.input_tokens,
  output: usage.output_tokens,
  cacheRead: usage.cache_read_input_tokens,
  cacheWrite: usage.cache_creation_input_tokens,
})

/** The count the agent budget uses: input, cache-creation and output. */
export const freshOf = (t: TokenCounts) => t.input + t.cacheWrite + t.output

const addTokens = (a: TokenCounts, b: TokenCounts): TokenCounts => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})

/** Of the input the model read, the part the prompt cache served; null with no input. */
export function cacheHit(t: TokenCounts): number | null {
  const read = t.input + t.cacheRead + t.cacheWrite
  return read === 0 ? null : t.cacheRead / read
}

/**
 * Who pays for a step. An implementer's step goes to its ticket under Build, and to the Feature
 * that ticket belongs to. Any other step, main or subagent, goes to the phase running in the
 * main session, or to the active Feature as `between` when none is; with no Feature at all it is
 * Outside features.
 */
export function attribute(args: {
  agentId: AgentId | null
  run: Pick<AgentRun, 'ticket'> | null
  /** The Feature the run's ticket belongs to, when it could be found. */
  runFeature: FeatureKey | null
  running: Pick<Running, 'phase' | 'feature'> | null
  active: FeatureKey | null
}): SpendTarget {
  const { agentId, run, runFeature, running, active } = args
  if (run !== null) {
    const feature = runFeature ?? active
    return { feature, phase: feature === null ? null : 'build', ticket: run.ticket, agentId }
  }
  const feature = running?.feature ?? active
  if (feature === null) return { feature: null, phase: null, ticket: null, agentId }
  const phase: PhaseId | 'between' = running?.phase ?? 'between'
  return { feature, phase, ticket: null, agentId }
}

export const rowKey = (t: SpendTarget, model: string) =>
  [t.feature ?? '', t.phase ?? '', t.ticket ?? '', t.agentId ?? '', model].join('|')

const weightOf = (s: SpendStep) => freshOf(s.tokens) + CACHE_READ_WEIGHT * s.tokens.cacheRead

/**
 * Shares `delta` over `steps` by weight, equally when every weight is zero. The shares sum to
 * `delta`: the last takes what rounding left.
 */
export function splitDelta(delta: number, steps: readonly SpendStep[]): number[] {
  if (steps.length === 0) return []
  if (steps.length === 1) return [delta]
  const weights = steps.map(weightOf)
  const total = weights.reduce((a, b) => a + b, 0)
  const shares = weights.map(w => (total === 0 ? delta / steps.length : (delta * w) / total))
  const head = shares.slice(0, -1).reduce((a, b) => a + b, 0)
  shares[shares.length - 1] = delta - head
  return shares
}

function addStep(
  rows: Record<string, SpendRow>,
  step: SpendStep,
  usd: number | null,
  isEstimated: boolean,
): Record<string, SpendRow> {
  const key = rowKey(step, step.model)
  const was = rows[key]
  const { tokens, model, ...target } = step
  const row: SpendRow =
    was === undefined
      ? { ...target, model, tokens, usd, isEstimated: usd !== null && isEstimated, steps: 1 }
      : {
          ...was,
          tokens: addTokens(was.tokens, tokens),
          usd: usd === null ? was.usd : (was.usd ?? 0) + usd,
          isEstimated: was.isEstimated || (usd !== null && isEstimated),
          steps: was.steps + 1,
        }
  return { ...rows, [key]: row }
}

const rollUp = (
  rows: Record<string, SpendRow>,
  steps: readonly SpendStep[],
  usd: readonly (number | null)[],
  isEstimated: boolean,
) => steps.reduce((acc, step, i) => addStep(acc, step, usd[i] ?? null, isEstimated), rows)

/**
 * A cost reading. The first only sets the baseline. A reading that moved shares its delta over
 * the queued steps and empties the queue; one that did not leaves them waiting. A delta with no
 * step to take it (a compaction, another mod's model call before any step) moves the baseline
 * and is not charged.
 */
export function reading(ledger: SpendLedger, usd: number): SpendLedger {
  if (ledger.baseline === null) return { ...ledger, baseline: usd }
  const delta = usd - ledger.baseline
  if (delta <= 0) return ledger
  if (ledger.queue.length === 0) return { ...ledger, baseline: usd }
  const isEstimated = new Set(ledger.queue.map(s => rowKey(s, s.model))).size > 1
  const rows = rollUp(ledger.rows, ledger.queue, splitDelta(delta, ledger.queue), isEstimated)
  return { baseline: usd, queue: [], rows }
}

/**
 * One answered step, with the session's cost read after it: `undefined` where the host keeps no
 * cost ledger, so the step is rolled up with tokens only. Before the first reading the step sets
 * the baseline and is not priced, so spend from before a resume is not charged to it.
 */
export function observe(
  ledger: SpendLedger,
  step: SpendStep,
  usd: number | undefined,
): SpendLedger {
  if (usd === undefined || ledger.baseline === null) {
    const rows = addStep(ledger.rows, step, null, false)
    return { ...ledger, rows, baseline: usd ?? ledger.baseline }
  }
  const queued = { ...ledger, queue: [...ledger.queue, step] }
  const next = reading(queued, usd)
  if (next.queue.length <= QUEUE_MAX) return next
  return { ...next, queue: [], rows: rollUp(next.rows, next.queue, [], false) }
}

export type SpendTotal = {
  fresh: number
  cacheRead: number
  tokens: TokenCounts
  /** Null when no step of the Feature was priced. */
  usd: number | null
  isEstimated: boolean
}

/** The total of some rows, and of steps still waiting for a price. */
export function totalOfRows(
  rows: readonly SpendRow[],
  queued: readonly SpendStep[] = [],
): SpendTotal {
  const tokens = [...rows.map(r => r.tokens), ...queued.map(s => s.tokens)].reduce(
    addTokens,
    ZERO_TOKENS,
  )
  const priced = rows.filter(r => r.usd !== null)
  return {
    fresh: freshOf(tokens),
    cacheRead: tokens.cacheRead,
    tokens,
    usd: priced.length === 0 ? null : priced.reduce((sum, r) => sum + r.usd!, 0),
    isEstimated: priced.some(r => r.isEstimated),
  }
}

/**
 * What the Feature has cost: this session's rows and waiting steps, plus `disk`, the rows other
 * sessions committed for it.
 */
export function totalOf(
  ledger: SpendLedger,
  feature: FeatureKey | null,
  disk: readonly SpendRow[] = [],
): SpendTotal {
  const rows = Object.values(ledger.rows).filter(r => r.feature === feature)
  const queued = ledger.queue.filter(s => s.feature === feature)
  return totalOfRows([...rows, ...disk], queued)
}

/** The spec a Feature key names; null for a draft, whose spend is not committed. */
export const specOfKey = (key: FeatureKey | null): IssueRef | null =>
  key !== null && key.startsWith('spec:') ? (key.slice('spec:'.length) as IssueRef) : null

/** The folder name a Feature's spend files live under. */
export const spendSlug = (spec: IssueRef) => refSlug(spec).replace(/[^A-Za-z0-9-]/g, '-')

/** A session id as a file name: only letters, digits and dashes, like every Craftory file. */
export const sessionSlug = (session: string) => session.replace(/[^A-Za-z0-9-]/g, '-')

export const spendPath = (spec: IssueRef, session: string) =>
  `${SPEND_DIR}${spendSlug(spec)}/${sessionSlug(session)}.json`

/**
 * This session's rows, with the steps still waiting for a price rolled up unpriced, so a file
 * written now keeps their tokens. The ledger itself is not changed: they are priced later.
 */
export function sessionRows(ledger: SpendLedger): SpendRow[] {
  return Object.values(rollUp(ledger.rows, ledger.queue, [], false))
}

/** The rows of committed Features, by spec. Drafts and Outside features are left out. */
export function rowsBySpec(rows: readonly SpendRow[]): Map<IssueRef, SpendRow[]> {
  const out = new Map<IssueRef, SpendRow[]>()
  for (const row of rows) {
    const spec = specOfKey(row.feature)
    if (spec === null) continue
    out.set(spec, [...(out.get(spec) ?? []), row])
  }
  return out
}

/** A session file, rows in a fixed order so an unchanged rollup writes the same text. */
export function serialiseSpendFile(file: SpendFile): string {
  const rows = [...file.rows].sort((a, b) =>
    rowKey(a, a.model).localeCompare(rowKey(b, b.model), 'en'),
  )
  return `${JSON.stringify({ ...file, rows }, null, 2)}\n`
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const SPEND_PHASES: readonly string[] = [...PHASE_ORDER, 'between']

function parseRow(v: unknown): SpendRow | null {
  if (!isRecord(v) || !isRecord(v.tokens)) return null
  const t = v.tokens
  if (![t.input, t.output, t.cacheRead, t.cacheWrite].every(isCount)) return null
  if (typeof v.model !== 'string' || !isCount(v.steps)) return null
  if (v.usd !== null && !isCount(v.usd)) return null
  const phase = v.phase === null || SPEND_PHASES.includes(v.phase as string) ? v.phase : undefined
  if (phase === undefined) return null
  return {
    feature: textOrNull(v.feature) as FeatureKey | null,
    phase: phase as SpendRow['phase'],
    ticket: textOrNull(v.ticket) as IssueRef | null,
    agentId: textOrNull(v.agentId) as AgentId | null,
    model: v.model,
    tokens: {
      input: t.input as number,
      output: t.output as number,
      cacheRead: t.cacheRead as number,
      cacheWrite: t.cacheWrite as number,
    },
    usd: v.usd as number | null,
    isEstimated: v.isEstimated === true,
    steps: v.steps,
  }
}

/**
 * Reads a session file. A row that does not parse is dropped and named in `problem`; a file that
 * is not a version 1 object with a session id is invalid as a whole.
 */
export function parseSpendFile(raw: string): Loaded<SpendFile> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    return { state: 'invalid', raw, problem: error instanceof Error ? error.message : 'not JSON' }
  }
  if (!isRecord(json) || json.version !== 1 || typeof json.session !== 'string')
    return { state: 'invalid', raw, problem: 'expected a version 1 object with a session' }
  const list = Array.isArray(json.rows) ? json.rows : []
  const rows = list.flatMap(r => parseRow(r) ?? [])
  const dropped = list.length - rows.length
  const user = textOrNull(json.user)
  const value: SpendFile = {
    version: 1,
    session: json.session,
    ...(user !== null && { user }),
    startedAt: (textOrNull(json.startedAt) ?? '') as IsoTime,
    rows,
  }
  return {
    state: 'ok',
    value,
    raw,
    ...(dropped > 0 && { problem: `${dropped} row${dropped === 1 ? '' : 's'} dropped` }),
  }
}

/** Folds rows into a ledger's rollup: how a resumed session takes back what it wrote before. */
export function seedRows(ledger: SpendLedger, rows: readonly SpendRow[]): SpendLedger {
  const seeded = { ...ledger.rows }
  for (const row of rows) {
    const key = rowKey(row, row.model)
    const was = seeded[key]
    seeded[key] =
      was === undefined
        ? row
        : {
            ...was,
            tokens: addTokens(was.tokens, row.tokens),
            usd: row.usd === null ? was.usd : (was.usd ?? 0) + row.usd,
            isEstimated: was.isEstimated || row.isEstimated,
            steps: was.steps + row.steps,
          }
  }
  return { ...ledger, rows: seeded }
}

/** Dollars as the rail shows them: cents under $10, then one decimal. */
export const usdText = (usd: number) => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

/** Tokens as the rail shows them: `850`, `412k`, `1.2M`. */
export function tokensText(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** The short spend for the status line and the summary chip; null when nothing was spent. */
export function spendText(total: SpendTotal): string | null {
  if (total.usd !== null) return usdText(total.usd)
  return total.fresh > 0 ? tokensText(total.fresh) : null
}

/** Outside features is kept for this many days, counted from each session's last step. */
export const OUTSIDE_DAYS = 30

export const STORE_SPEND_OUTSIDE = 'spend:outside'
export const storeDraftKey = (draftId: string) => `spend:draft:${draftId}`

/** The draft id a Feature key names; null for a spec or no Feature. */
export const draftOfKey = (key: FeatureKey | null): string | null =>
  key !== null && key.startsWith('draft:') ? key.slice('draft:'.length) : null

export const EMPTY_LOCAL: LocalSpend = { version: 1, sessions: {} }

/** Reads a stored entry leniently: anything unreadable is an empty one, a bad row is dropped. */
export function parseLocalSpend(stored: unknown): LocalSpend {
  if (!isRecord(stored) || stored.version !== 1 || !isRecord(stored.sessions)) return EMPTY_LOCAL
  const sessions: LocalSpend['sessions'] = {}
  for (const [session, entry] of Object.entries(stored.sessions)) {
    if (!isRecord(entry) || typeof entry.lastAt !== 'string' || !Array.isArray(entry.rows)) continue
    sessions[session] = {
      lastAt: entry.lastAt,
      rows: entry.rows.flatMap(r => parseRow(r) ?? []),
    }
  }
  return { version: 1, sessions }
}

/** This session's entry set to `rows` at `at`; removed when it has none. */
export function withSession(
  local: LocalSpend,
  session: string,
  rows: readonly SpendRow[],
  at: IsoTime,
): LocalSpend {
  const rest = Object.fromEntries(Object.entries(local.sessions).filter(([id]) => id !== session))
  return {
    version: 1,
    sessions: rows.length === 0 ? rest : { ...rest, [session]: { lastAt: at, rows: [...rows] } },
  }
}

/** Drops the sessions whose last step is more than `days` before `now`. */
export function withinDays(local: LocalSpend, now: Millis, days: number): LocalSpend {
  const since = now - days * 24 * 60 * 60 * 1000
  return {
    version: 1,
    sessions: Object.fromEntries(
      Object.entries(local.sessions).filter(([, e]) => Date.parse(e.lastAt) >= since),
    ),
  }
}

export const ownRowsOf = (local: LocalSpend, session: string): SpendRow[] =>
  local.sessions[session]?.rows ?? []

export const otherRowsOf = (local: LocalSpend, session: string): SpendRow[] =>
  Object.entries(local.sessions).flatMap(([id, e]) => (id === session ? [] : e.rows))

/** This session's rows of one Feature key: a draft's, or Outside features' with `null`. */
export const rowsOfKey = (rows: readonly SpendRow[], key: FeatureKey | null): SpendRow[] =>
  rows.filter(r => r.feature === key)

/**
 * Charges everything held under `from` to `to` instead: how a draft's spend follows it once its
 * spec binds. Rows that meet under the new key are added together.
 */
export function rekeyLedger(ledger: SpendLedger, from: FeatureKey, to: FeatureKey): SpendLedger {
  const moved = Object.values(ledger.rows).map(r =>
    r.feature === from ? { ...r, feature: to } : r,
  )
  return {
    ...seedRows({ ...ledger, rows: {} }, moved),
    queue: ledger.queue.map(q => (q.feature === from ? { ...q, feature: to } : q)),
  }
}

export const rekeyRows = (
  rows: readonly SpendRow[],
  from: FeatureKey,
  to: FeatureKey,
): SpendRow[] => rows.map(r => (r.feature === from ? { ...r, feature: to } : r))

export type SpendBreakdown = {
  total: SpendTotal
  phases: Partial<Record<SpendPhase, SpendTotal>>
  tickets: Record<string, SpendTotal>
}

function groupTotals<K extends string>(
  rows: readonly SpendRow[],
  queued: readonly SpendStep[],
  keyOf: (t: SpendTarget) => K | null,
): Partial<Record<K, SpendTotal>> {
  const keys = new Set([...rows, ...queued].flatMap(t => keyOf(t) ?? []))
  return Object.fromEntries(
    [...keys].map(k => [
      k,
      totalOfRows(
        rows.filter(r => keyOf(r) === k),
        queued.filter(q => keyOf(q) === k),
      ),
    ]),
  ) as Partial<Record<K, SpendTotal>>
}

/** A Feature's spend, in all and by phase and by ticket, this session's and `disk`'s together. */
export function breakdownOf(
  ledger: SpendLedger,
  feature: FeatureKey | null,
  disk: readonly SpendRow[] = [],
): SpendBreakdown {
  const rows = [...Object.values(ledger.rows).filter(r => r.feature === feature), ...disk]
  const queued = ledger.queue.filter(s => s.feature === feature)
  return {
    total: totalOfRows(rows, queued),
    phases: groupTotals<SpendPhase>(rows, queued, t => t.phase),
    tickets: groupTotals<string>(rows, queued, t => t.ticket) as Record<string, SpendTotal>,
  }
}

/** Said where the host keeps no cost ledger, so no one reads the missing dollars as $0. */
export const NO_COST_TEXT = '$ unavailable on this surface'

/**
 * A phase card's Spend row: `$2.14 · 318k fresh · 61% cache`. Without a cost ledger the dollars
 * give way to a note saying so. Null when the phase has spent nothing.
 */
export function phaseSpendText(total: SpendTotal, hasCost: boolean): string | null {
  if (total.fresh === 0 && total.cacheRead === 0) return null
  const hit = cacheHit(total.tokens)
  return [
    ...(total.usd !== null ? [usdText(total.usd)] : []),
    `${tokensText(total.fresh)} fresh`,
    ...(hit === null ? [] : [`${Math.round(hit * 100)}% cache`]),
    ...(hasCost ? [] : [NO_COST_TEXT]),
  ].join(' · ')
}

/** An agent's dollars beside its token bar, `≈` when they were shared with others; else null. */
export const agentSpendText = (total: SpendTotal | undefined): string | null =>
  total === undefined || total.usd === null
    ? null
    : `${total.isEstimated ? '≈' : ''}${usdText(total.usd)}`

/**
 * The line `/craftory`'s text reply adds: `Spend: $4.12 (318k fresh tokens) across 3 sessions`.
 * Tokens alone, with a note, where the host keeps no cost ledger; null when nothing was spent.
 */
export function spendSummaryLine(
  total: SpendTotal,
  sessions: number,
  hasCost: boolean,
): string | null {
  if (total.fresh === 0 && total.cacheRead === 0) return null
  const fresh = `${tokensText(total.fresh)} fresh tokens`
  const across = `across ${sessions} session${sessions === 1 ? '' : 's'}`
  if (total.usd !== null) return `Spend: ${usdText(total.usd)} (${fresh}) ${across}`
  return `Spend: ${fresh} ${across}${hasCost ? '' : ` (${NO_COST_TEXT})`}`
}
