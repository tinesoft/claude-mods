import { expect, test } from 'claude-code/testing'
import { isThrottled, RATE_LIMIT_LABELS, windowsView } from '../src/rate-limits'

/** Wednesday 18 November 2026, 10:00 UTC. */
const WED_10_UTC = Date.parse('2026-11-18T10:00:00Z')
const CET = 60

const view = (
  limits: Parameters<typeof windowsView>[0],
  over: Partial<Parameters<typeof windowsView>[1]> = {},
) => windowsView(limits, { throttleAt: 80, now: WED_10_UTC, offsetMinutes: CET, ...over })

test('each window reads its label, its use and its local 24-hour reset time', () => {
  expect(
    view([
      { kind: 'five_hour', percentUsed: 72, resetsAt: '2026-11-18T17:40:00Z' },
      { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-11-23T08:00:00Z' },
      { kind: 'spend_limit', percentUsed: 40 },
    ]).map(w => w.text),
  ).toEqual(['5-hour 72% · resets 18:40', '7-day 31% · resets Mon 09:00', 'Spend limit 40%'])
})

test('a reset is today or another day by the local date, not the UTC one', () => {
  const lateWed = Date.parse('2026-11-18T23:30:00Z')
  const window = [{ kind: 'five_hour', percentUsed: 10, resetsAt: '2026-11-19T01:00:00Z' }]
  expect(view(window, { now: lateWed, offsetMinutes: CET })[0]!.text).toBe(
    '5-hour 10% · resets 02:00',
  )
  expect(view(window, { now: lateWed, offsetMinutes: 0 })[0]!.text).toBe(
    '5-hour 10% · resets Thu 01:00',
  )
  expect(view(window, { now: lateWed, offsetMinutes: -300 })[0]!.text).toBe(
    '5-hour 10% · resets 20:00',
  )
})

test('use is shown in whole percent, never rounded up past what was used', () => {
  expect(view([{ kind: 'five_hour', percentUsed: 79.9 }])[0]!.text).toBe('5-hour 79%')
  expect(view([{ kind: 'spend_limit', percentUsed: 104.5 }], { throttleAt: 100 })[0]!.text).toBe(
    'Spend limit 104%',
  )
})

test('a reset time that cannot be read is left out', () => {
  expect(view([{ kind: 'seven_day', percentUsed: 5, resetsAt: 'soon' }])[0]!.text).toBe('7-day 5%')
})

test('a window at or above throttleAt is Throttled and says so', () => {
  const windows = view([
    { kind: 'five_hour', percentUsed: 84, resetsAt: '2026-11-18T17:40:00Z' },
    { kind: 'seven_day', percentUsed: 80 },
    { kind: 'spend_limit', percentUsed: 79.9 },
  ])
  expect(windows.map(w => [w.text, w.isThrottled])).toEqual([
    ['5-hour 84% · resets 18:40 · Throttled', true],
    ['7-day 80% · Throttled', true],
    ['Spend limit 79%', false],
  ])
})

test('throttleAt 100 is off: even a full window is not Throttled', () => {
  expect(isThrottled({ kind: 'five_hour', percentUsed: 100 }, 100)).toBe(false)
  expect(view([{ kind: 'five_hour', percentUsed: 100 }], { throttleAt: 100 })[0]).toEqual({
    kind: 'five_hour',
    text: '5-hour 100%',
    isThrottled: false,
  })
})

test('a window of a kind Craftory has no label for reads its own name', () => {
  expect(RATE_LIMIT_LABELS.five_hour).toBe('5-hour')
  expect(view([{ kind: 'opus_weekly', percentUsed: 12 }])[0]!.text).toBe('Opus weekly 12%')
})

test('with no reading there are no windows', () => {
  expect(view([])).toEqual([])
})
