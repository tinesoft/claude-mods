import type { SessionRateLimit } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import {
  EMPTY_WINDOW_USE,
  noteWindowUse,
  pointsPerDollarOf,
  forecastWindowOf,
  forecastWindowText,
} from '../src/window-use'
import type { WindowUse } from '../types'

const RESET = '2026-11-18T17:40:00Z'
const LATER_RESET = '2026-11-18T22:40:00Z'

const five = (percentUsed: number, resetsAt = RESET): SessionRateLimit => ({
  kind: 'five_hour',
  percentUsed,
  resetsAt,
})
const seven = (percentUsed: number): SessionRateLimit => ({
  kind: 'seven_day',
  percentUsed,
  resetsAt: '2026-11-23T08:00:00Z',
})

/** Folds readings, each `[usd, limits]`, from no use. */
const useOf = (...readings: [number, SessionRateLimit[]][]): WindowUse =>
  readings.reduce<WindowUse>(
    (use, [usd, limits]) => noteWindowUse(use, { usd, limits }),
    EMPTY_WINDOW_USE,
  )

for (const [name, readings, expected] of [
  ['no reading', [], {}],
  ['one reading', [[1, [five(10)]]], {}],
  [
    '$1 for 4 points',
    [
      [1, [five(10)]],
      [1.5, [five(12)]],
      [2, [five(14)]],
    ],
    { five_hour: 4 },
  ],
  [
    'under $0.50 moved',
    [
      [1, [five(10)]],
      [1.4, [five(14)]],
    ],
    {},
  ],
  [
    'exactly $0.50 and 2 points',
    [
      [1, [five(10)]],
      [1.5, [five(12)]],
    ],
    { five_hour: 4 },
  ],
  [
    'under 2 points moved',
    [
      [1, [five(10)]],
      [3, [five(11.5)]],
    ],
    {},
  ],
  [
    'each window on its own',
    [
      [0, [five(10), seven(30)]],
      [2, [five(20), seven(32)]],
    ],
    { five_hour: 5, seven_day: 1 },
  ],
  [
    'a window that reset starts again from its reset',
    [
      [0, [five(70)]],
      [2, [five(90)]],
      [3, [five(1, LATER_RESET)]],
      [4, [five(4, LATER_RESET)]],
    ],
    { five_hour: 3 },
  ],
  [
    'a window whose use fell starts again',
    [
      [0, [five(70)]],
      [1, [five(40)]],
      [2, [five(44)]],
    ],
    { five_hour: 4 },
  ],
  [
    'a window that left the reading is forgotten',
    [
      [0, [five(10), seven(30)]],
      [1, [seven(30)]],
      [2, [five(14), seven(30)]],
    ],
    {},
  ],
] as const) {
  test(`points per dollar: ${name}`, () => {
    expect(
      pointsPerDollarOf(useOf(...(readings as unknown as [number, SessionRateLimit[]][]))),
    ).toEqual(expected)
  })
}

/** Wednesday 18 November 2026, 10:00 UTC, read in CET. */
const CLOCK = { now: Date.parse('2026-11-18T10:00:00Z'), offsetMinutes: 60 }
const build = (p90: number, unit: 'usd' | 'tokens' = 'usd') => ({
  median: p90 / 2,
  p90,
  tickets: 5,
  unit,
})
const warn = (
  p90: number,
  limits: SessionRateLimit[],
  rates: Record<string, number>,
  unit: 'usd' | 'tokens' = 'usd',
) => forecastWindowOf(build(p90, unit), { limits, ...CLOCK }, rates)

test('Build forecast past what a window has left warns, naming the window, the points and the reset', () => {
  // $14 at 2.5 points per dollar: 35 points, with 22 left.
  const warning = warn(14, [five(78)], { five_hour: 2.5 })
  expect(warning).toEqual({ usd: 14, window: '5-hour', points: 35, left: 22, resets: '18:40' })
  expect(forecastWindowText(warning!)).toBe(
    'Build is forecast at up to $14, about 35% of the 5-hour window · 22% is left, resets 18:40',
  )
})

for (const [name, p90, limits, rates, unit] of [
  ['with enough room', 8, [five(78)], { five_hour: 2.5 }, 'usd'],
  ['at exactly what is left', 8, [five(78)], { five_hour: 2.75 }, 'usd'],
  ['with no estimate', 14, [five(78)], {}, 'usd'],
  ['with an estimate for another window only', 14, [five(78)], { seven_day: 2.5 }, 'usd'],
  ['off a subscription', 14, [], { five_hour: 2.5 }, 'usd'],
  ['for a forecast in tokens', 14, [five(78)], { five_hour: 2.5 }, 'tokens'],
] as const) {
  test(`no warning ${name}`, () => {
    expect(warn(p90, [...limits], rates, unit)).toBeNull()
  })
}

test('of the windows the forecast would use up, the one with least left is named', () => {
  const warning = warn(10, [five(60), seven(90)], { five_hour: 5, seven_day: 2 })
  expect(warning).toMatchObject({ window: '7-day', points: 20, left: 10, resets: 'Mon 09:00' })
})

test('a tighter window with room to spare does not hide a looser one that would be used up', () => {
  const warning = warn(10, [five(50), seven(90)], { five_hour: 6, seven_day: 0.5 })
  expect(warning).toMatchObject({ window: '5-hour', points: 60, left: 50 })
})

test('left is read off the whole percent the card shows, and a reset it cannot read is left out', () => {
  const warning = warn(5, [{ kind: 'five_hour', percentUsed: 77.5 }], { five_hour: 10 })
  expect(warning).toEqual({ usd: 5, window: '5-hour', points: 50, left: 23, resets: null })
  expect(forecastWindowText(warning!)).toBe(
    'Build is forecast at up to $5.00, about 50% of the 5-hour window · 23% is left',
  )
})
