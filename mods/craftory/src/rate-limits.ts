import type { SessionRateLimit } from 'claude-code'
import type { CraftoryConfig } from '../types'

/** What each rate-limit window the engine names is called on the Build card. */
export const RATE_LIMIT_LABELS: Readonly<Record<string, string>> = {
  five_hour: '5-hour',
  seven_day: '7-day',
  spend_limit: 'Spend limit',
}

/** The word a Throttled window carries, so it never rests on colour alone. */
export const THROTTLED = 'Throttled'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MINUTE_MS = 60_000

/** One rate-limit window as the Build card draws it. */
export type WindowView = { kind: string; text: string; isThrottled: boolean }

/** The `throttleAt` that never throttles: Off. */
export const THROTTLE_OFF = 100

/** A window at or above `throttleAt` is Throttled; `throttleAt` at THROTTLE_OFF is off. */
export const isThrottled = (limit: SessionRateLimit, throttleAt: number) =>
  throttleAt < THROTTLE_OFF && limit.percentUsed >= throttleAt

const labelOf = (kind: string) => {
  const known = RATE_LIMIT_LABELS[kind]
  if (known !== undefined) return known
  const words = kind.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * `18:40` when the reset falls on today's local date, `Mon 09:00` otherwise; null when the time
 * cannot be read. `offsetMinutes` is the local zone's offset east of UTC.
 */
function resetText(resetsAt: string, now: number, offsetMinutes: number): string | null {
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return null
  const local = new Date(at + offsetMinutes * MINUTE_MS)
  const today = new Date(now + offsetMinutes * MINUTE_MS)
  const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
  const isToday = local.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)
  return isToday ? time : `${WEEKDAYS[local.getUTCDay()]} ${time}`
}

/** The windows as last read, and the clock to read their resets by. */
export type WindowReading = {
  limits: readonly SessionRateLimit[]
  now: number
  offsetMinutes: number
}

/** Throttling in force: the fullest Throttled window, its use, its reset, and the parallel limit. */
export type Throttle = { label: string; percent: number; resets: string | null; parallel: number }

/**
 * The throttle while any window is at or above `throttleAt`, else null. The fullest such window is
 * the one named; the limit is `throttledParallel`, never above `maxParallel`.
 */
export function throttleOf(
  reading: WindowReading,
  config: { throttleAt: number; throttledParallel: number; maxParallel: number },
): Throttle | null {
  const fullest = reading.limits
    .filter(limit => isThrottled(limit, config.throttleAt))
    .reduce<SessionRateLimit | null>(
      (top, limit) => (top === null || limit.percentUsed > top.percentUsed ? limit : top),
      null,
    )
  if (fullest === null) return null
  return {
    label: labelOf(fullest.kind),
    percent: Math.floor(fullest.percentUsed),
    resets:
      fullest.resetsAt === undefined
        ? null
        : resetText(fullest.resetsAt, reading.now, reading.offsetMinutes),
    parallel: Math.min(config.maxParallel, config.throttledParallel),
  }
}

/**
 * Each window the account reports, in the engine's order: `5-hour 72% · resets 18:40`. Use is
 * floored to a whole percent, so a window never reads as fuller than it is.
 */
export function windowsView(
  limits: readonly SessionRateLimit[],
  at: { throttleAt: number; now: number; offsetMinutes: number },
): WindowView[] {
  return limits.map(limit => {
    const reset =
      limit.resetsAt === undefined ? null : resetText(limit.resetsAt, at.now, at.offsetMinutes)
    const throttled = isThrottled(limit, at.throttleAt)
    const parts = [
      `${labelOf(limit.kind)} ${Math.floor(limit.percentUsed)}%`,
      ...(reset === null ? [] : [`resets ${reset}`]),
      ...(throttled ? [THROTTLED] : []),
    ]
    return { kind: limit.kind, text: parts.join(' · '), isThrottled: throttled }
  })
}

/**
 * Throttling in force: a window at or above `throttleAt` that lowers the parallel limit, so the
 * hold, the warning before Build and the card's Throttled all agree. Null otherwise, such as when
 * `throttledParallel` is at or above `maxParallel`: a window can then be Throttled while Build is not.
 */
export function throttleInForce(
  reading: WindowReading,
  config: Pick<CraftoryConfig, 'rateLimits' | 'worktrees'>,
): Throttle | null {
  const { maxParallel } = config.worktrees
  const throttle = throttleOf(reading, { ...config.rateLimits, maxParallel })
  return throttle !== null && throttle.parallel < maxParallel ? throttle : null
}
