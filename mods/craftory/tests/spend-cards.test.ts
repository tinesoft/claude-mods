import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import type { SpendRow } from '../types'
import { fakeGit, READY, start, step } from './build-harness'
import {
  allText,
  featureWorld,
  mountBand,
  skillPrompt,
  startSession,
  texts,
  type WorldOptions,
} from './harness'

const TOKENS = {
  input_tokens: 100,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1_000,
}

type CardSurface = 'terminal' | 'desktop' | 'vscode'

/** Build under way on `surface`, with the session started there. */
const buildingOn = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  surface: CardSurface,
  options: WorldOptions = {},
) => {
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    usage: () => TOKENS,
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

const alignFile = (usd: number) =>
  serialiseSpendFile({
    version: 1,
    session: 's0',
    startedAt: '2026-11-16T10:00:00.000Z',
    rows: [
      {
        feature: 'spec:csv' as SpendRow['feature'],
        phase: 'align',
        ticket: null,
        agentId: null,
        model: 'claude-opus-5-5',
        tokens: { input: 2_000, output: 1_000, cacheRead: 7_000, cacheWrite: 0 },
        usd,
        isEstimated: false,
        steps: 4,
      },
    ],
  })

for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
  test(`${surface}: the Build card has a Spend row; each agent’s dollars sit beside its tokens`, async ($, on) => {
    let usd = 0
    await buildingOn(on, $, surface, { cost: () => usd })
    await start($, 43, 'Export button')
    await start($, 44, 'Ledger tax')
    usd = 0.42
    await step($, 'agent-tu43', 0)
    await step($, 'agent-tu44', 0)
    usd = 1
    await step($, 'agent-tu44', 1)
    const card = await openCard($, surface, 'build')
    const text = await allText(card)
    expect(text).toContain('Spend')
    expect(text).toContain('$1.00 · 900 fresh · 91% cache')
    const words = await texts(card)
    expect(words.some(w => /· \$0\.42 · /.test(w))).toBe(true)
    expect(words.some(w => /· \$0\.58 · /.test(w))).toBe(true)
  })
}

test('agents that shared one cost reading show ≈ before their dollars', async ($, on) => {
  let usd = 0
  await buildingOn(on, $, 'terminal', { cost: () => usd })
  await start($, 43, 'Export button')
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu43', 0)
  usd = 0.6
  await step($, 'agent-tu44', 0)
  const words = await texts(await openCard($, 'terminal', 'build'))
  expect(words.filter(w => /· ≈\$0\.30 · /.test(w))).toHaveLength(2)
})

test('a phase another session spent on shows its Spend row; one that spent nothing has none', async ($, on) => {
  await buildingOn(on, $, 'terminal', {
    cost: () => 0,
    files: { '.craftory/spend/csv/s0.json': alignFile(0.4) },
  })
  expect(await allText(await openCard($, 'terminal', 'align'))).toContain(
    'Spend $0.40 · 3k fresh · 78% cache',
  )
  expect(await allText(await openCard($, 'terminal', 'spec'))).not.toContain('Spend')
})

test('where the host keeps no cost ledger the card says so and agents show no dollars', async ($, on) => {
  await buildingOn(on, $, 'terminal')
  await start($, 43, 'Export button')
  await step($, 'agent-tu43', 0)
  const card = await openCard($, 'terminal', 'build')
  expect(await allText(card)).toContain('300 fresh · 91% cache · $ unavailable on this surface')
  expect((await texts(card)).some(w => /\$\d/.test(w))).toBe(false)
})
