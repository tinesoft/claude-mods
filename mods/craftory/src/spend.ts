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
  PhaseId,
  Running,
  SpendLedger,
  SpendRow,
  SpendStep,
  SpendTarget,
  TokenCounts,
} from '../types'

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

/** What the Feature has cost in this session, the steps still waiting for a price included. */
export function totalOf(ledger: SpendLedger, feature: FeatureKey | null): SpendTotal {
  const rows = Object.values(ledger.rows).filter(r => r.feature === feature)
  const queued = ledger.queue.filter(s => s.feature === feature)
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
