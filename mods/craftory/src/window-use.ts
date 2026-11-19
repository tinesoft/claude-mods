/**
 * How fast this session uses each rate-limit window per dollar, and whether Build's forecast
 * would use up what a window has left. Pure: the shell folds in each reading of the cost and the
 * windows, taken together at session start and at each `session.measure`.
 */
import type { SessionRateLimit } from 'claude-code'
import type { BuildForecast } from './forecast'
import { forecastUsdText } from './forecast'
import type { WindowUse, WindowUsePoint } from '../types'
import { labelOf, resetText, type WindowReading } from './rate-limits'

/** Dollars that must have moved before an estimate is made: less would be noise. */
export const MIN_MOVED_USD = 0.5

/** Points of a window that must have moved before an estimate is made: under 2 is rounding. */
export const MIN_MOVED_POINTS = 2

/** One reading of the session's cost and each window's use, taken at the same time. */
export type UseReading = { usd: number; limits: readonly SessionRateLimit[] }

export const EMPTY_WINDOW_USE: WindowUse = {}

/** Folds in a reading. A window whose reset time changed, or whose use fell, starts again. */
export function noteWindowUse(use: WindowUse, reading: UseReading): WindowUse {
  return Object.fromEntries(
    reading.limits.map(limit => {
      const at: WindowUsePoint = { usd: reading.usd, percent: limit.percentUsed }
      const resetsAt = limit.resetsAt ?? null
      const known = use[limit.kind]
      const isSame =
        known !== undefined && known.resetsAt === resetsAt && at.percent >= known.to.percent
      return [limit.kind, { resetsAt, from: isSame ? known.from : at, to: at }]
    }),
  )
}

/**
 * Points of each window used per dollar, for the windows where at least MIN_MOVED_USD and
 * MIN_MOVED_POINTS have moved since their first reading; the others have no estimate.
 */
export function pointsPerDollarOf(use: WindowUse): Record<string, number> {
  return Object.fromEntries(
    Object.entries(use).flatMap(([kind, { from, to }]) => {
      const usd = to.usd - from.usd
      const points = to.percent - from.percent
      return usd >= MIN_MOVED_USD && points >= MIN_MOVED_POINTS ? [[kind, points / usd]] : []
    }),
  )
}

/** Build's forecast would use up a window: its p90, the window, the points it would use, and what is left. */
export type WindowWarning = {
  usd: number
  window: string
  points: number
  left: number
  resets: string | null
}

/**
 * The warning when Build's p90 times a window's points per dollar is more than that window has
 * left, naming the one with least left of those it would use up; null with room in each, with no
 * estimate, or with a forecast in tokens. What is left is read off the whole percent the Build
 * card shows.
 */
export function windowWarningOf(
  build: BuildForecast,
  reading: WindowReading,
  rates: Readonly<Record<string, number>>,
): WindowWarning | null {
  if (build.unit !== 'usd') return null
  const over = reading.limits.flatMap(limit => {
    const rate = rates[limit.kind]
    if (rate === undefined) return []
    const left = Math.max(0, 100 - Math.floor(limit.percentUsed))
    const points = build.p90 * rate
    return points > left ? [{ limit, left, points }] : []
  })
  const tightest = over.reduce<(typeof over)[number] | null>(
    (top, w) => (top === null || w.left < top.left ? w : top),
    null,
  )
  if (tightest === null) return null
  const { limit, left, points } = tightest
  return {
    usd: build.p90,
    window: labelOf(limit.kind),
    points: Math.round(points),
    left,
    resets:
      limit.resetsAt === undefined
        ? null
        : resetText(limit.resetsAt, reading.now, reading.offsetMinutes),
  }
}

/** `Build is forecast at up to $14, about 35% of the 5-hour window · 22% is left, resets 18:40`. */
export function windowWarningText(w: WindowWarning): string {
  const resets = w.resets === null ? '' : `, resets ${w.resets}`
  return (
    `Build is forecast at up to ${forecastUsdText(w.usd)}, about ${w.points}% of the ` +
    `${w.window} window · ${w.left}% is left${resets}`
  )
}
