import { atom, type EngineInterface, read, type SessionRateLimit, update } from 'claude-code'
import {
  type Throttle,
  throttleInForce,
  type WindowReading,
  type WindowView,
  windowsView,
} from '../../src/rate-limits'
import { EMPTY_WINDOW_USE, noteWindowUse, pointsPerDollarOf } from '../../src/window-use'
import type { CraftoryConfig, RateLimitConfig, WindowUse } from '../../types'

/** The last rate-limit reading: empty off a subscription or before the first one. */
const limitsState = atom(
  { plugin: 'craftory', key: 'rateLimits' } as const,
  [] as SessionRateLimit[],
)

/** This session's readings of the cost and each window's use, from which window use per dollar is told. */
const windowUseState = atom(
  { plugin: 'craftory', key: 'windowUse' } as const,
  EMPTY_WINDOW_USE as WindowUse,
)

/**
 * Keeps the windows `$.session.usage()` reports at session start, and the session's first reading
 * of cost against them; none when the read fails.
 */
export async function startRateLimits($: EngineInterface) {
  const usage = await $.session.usage().catch(() => null)
  const limits = usage?.rateLimits ?? []
  await update($, limitsState, () => limits)
  const usd = usage?.cost?.usd
  if (usd !== undefined) await noteUseReading($, usd, limits)
}

/** A reading of the cost and the windows taken together, at a `session.measure` that has a cost. */
export async function noteUseReading(
  $: EngineInterface,
  usd: number,
  limits: readonly SessionRateLimit[],
) {
  await update($, windowUseState, use => noteWindowUse(use, { usd, limits }))
}

/** Points of each window this session used per dollar, where enough has moved to tell. */
export async function pointsPerDollarNow($: EngineInterface): Promise<Record<string, number>> {
  return pointsPerDollarOf(await read($, windowUseState))
}

/** Keeps a `session.measure` reading, and redraws the Build card when it moved. */
export async function noteRateLimits($: EngineInterface, limits: SessionRateLimit[]) {
  await update($, limitsState, () => limits)
  $.ui.invalidate('ui.render')
}

/** The last reading, with the clock and the local zone its resets are read in. */
export async function windowReadingOf($: EngineInterface): Promise<WindowReading> {
  const limits = await read($, limitsState)
  const now = await $.clock.now()
  return { limits, now, offsetMinutes: -new Date(now).getTimezoneOffset() }
}

/** The Build card's windows, with reset times in the session's local zone. */
export async function rateWindowsOf(
  $: EngineInterface,
  config: RateLimitConfig,
): Promise<WindowView[]> {
  const reading = await windowReadingOf($)
  if (reading.limits.length === 0) return []
  return windowsView(reading.limits, { ...reading, throttleAt: config.throttleAt })
}

/** Throttling in force now, or null: see `throttleInForce`. */
export async function throttleNow(
  $: EngineInterface,
  config: CraftoryConfig,
): Promise<Throttle | null> {
  return throttleInForce(await windowReadingOf($), config)
}
