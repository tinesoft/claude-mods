import { atom, type EngineInterface, read, type SessionRateLimit, update } from 'claude-code'
import {
  type Throttle,
  throttleInForce,
  type WindowReading,
  type WindowView,
  windowsView,
} from '../../src/rate-limits'
import type { CraftoryConfig, RateLimitConfig } from '../../types'

/** The last rate-limit reading: empty off a subscription or before the first one. */
const limitsState = atom(
  { plugin: 'craftory', key: 'rateLimits' } as const,
  [] as SessionRateLimit[],
)

/** Keeps the windows `$.session.usage()` reports at session start; none when the read fails. */
export async function startRateLimits($: EngineInterface) {
  const limits = await $.session
    .usage()
    .then(u => u.rateLimits)
    .catch(() => [])
  await update($, limitsState, () => limits)
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
