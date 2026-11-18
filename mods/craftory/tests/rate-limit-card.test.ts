import type { SessionRateLimit } from 'claude-code'
import { type Engine, expect, test } from 'claude-code/testing'
import { paint } from '../src/theme'
import { fakeGit, READY } from './build-harness'
import {
  allText,
  featureWorld,
  mountBand,
  skillPrompt,
  startSession,
  texts,
  type WorldOptions,
} from './harness'

type CardSurface = 'terminal' | 'desktop' | 'vscode'

/** The harness clock starts here. */
const NOW = Date.parse('2026-11-18T12:00:00Z')
const IN_AN_HOUR = '2026-11-18T13:00:00Z'
const IN_FIVE_DAYS = '2026-11-23T08:00:00Z'

/** A local 24-hour reset, with or without a weekday: the zone is the test machine's. */
const RESET = String.raw`resets (?:[A-Z][a-z]{2} )?\d\d:\d\d`

const buildingOn = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  surface: CardSurface,
  options: WorldOptions = {},
) => {
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    now: NOW,
    ...options,
    files: { ...READY, ...options.files },
  })
  await startSession($, surface)
  await skillPrompt($, 'implement-spec')
  return w
}

const openCard = async ($: Engine, surface: CardSurface, phase: string) => {
  await (await mountBand($, surface, 200, 60)).press({ key: `phase-${phase}` })
  return mountBand($, surface, 200, 60)
}

const measure = ($: Engine, rateLimits: SessionRateLimit[]) =>
  $.session.measure({
    context: { window: 200_000 },
    rateLimits,
    changed: ['rateLimits'],
  } as never)

/** The harness's theme is dark, and every surface here draws in it. */
const AMBER = paint('hook', 'dark').fg

for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
  test(`${surface}: the Build card shows each rate-limit window read at session start`, async ($, on) => {
    await buildingOn(on, $, surface, {
      rateLimits: () => [
        { kind: 'five_hour', percentUsed: 72, resetsAt: IN_AN_HOUR },
        { kind: 'seven_day', percentUsed: 31, resetsAt: IN_FIVE_DAYS },
      ],
    })
    const card = await openCard($, surface, 'build')
    const words = await texts(card)
    expect(words).toContain('Limits')
    expect(words.some(w => new RegExp(`^5-hour 72% · ${RESET}$`).test(w))).toBe(true)
    expect(words.some(w => new RegExp(`^7-day 31% · ${RESET}$`).test(w))).toBe(true)
    expect(words.some(w => w.includes('Throttled'))).toBe(false)
  })

  test(`${surface}: a window at the throttle threshold is amber and says Throttled`, async ($, on) => {
    await buildingOn(on, $, surface, {
      rateLimits: () => [{ kind: 'five_hour', percentUsed: 40, resetsAt: IN_AN_HOUR }],
    })
    await measure($, [
      { kind: 'five_hour', percentUsed: 84, resetsAt: IN_AN_HOUR },
      { kind: 'spend_limit', percentUsed: 12 },
    ])
    const card = await openCard($, surface, 'build')
    const lines = await card.findAll({ type: 'Text' })
    const throttled = lines.find(l => /^5-hour 84% · .* · Throttled$/.test(l.text))
    expect(throttled?.props.color).toBe(AMBER)
    const calm = lines.find(l => l.text === 'Spend limit 12%')
    expect(calm).toBeDefined()
    expect(calm?.props.color).not.toBe(AMBER)
  })
}

test('a later reading replaces the one before', async ($, on) => {
  await buildingOn(on, $, 'terminal', {
    rateLimits: () => [{ kind: 'five_hour', percentUsed: 40 }],
  })
  await measure($, [{ kind: 'five_hour', percentUsed: 55 }])
  const words = await texts(await openCard($, 'terminal', 'build'))
  expect(words).toContain('5-hour 55%')
  expect(words).not.toContain('5-hour 40%')
})

test('throttleAt 100 turns the word off, even for a full window', async ($, on) => {
  await buildingOn(on, $, 'terminal', {
    rateLimits: () => [{ kind: 'five_hour', percentUsed: 100 }],
    files: { '.craftory/config.json': JSON.stringify({ rateLimits: { throttleAt: 100 } }) },
  })
  const words = await texts(await openCard($, 'terminal', 'build'))
  expect(words).toContain('5-hour 100%')
})

test('off a subscription there is no Limits line', async ($, on) => {
  await buildingOn(on, $, 'terminal')
  await measure($, [])
  const text = await allText(await openCard($, 'terminal', 'build'))
  expect(text).not.toContain('Limits')
  expect(text).not.toContain('5-hour')
})

test('only the Build card shows the windows', async ($, on) => {
  await buildingOn(on, $, 'terminal', {
    rateLimits: () => [{ kind: 'five_hour', percentUsed: 72 }],
  })
  expect(await allText(await openCard($, 'terminal', 'align'))).not.toContain('5-hour')
})
