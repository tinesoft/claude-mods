import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { TOKENS, TRIPLES } from '../src/theme'
import { building, start, step } from './build-harness'
import {
  BAND_SURFACES,
  featureWorld,
  mountBand,
  startSession,
  texts,
  type BandSurface,
} from './harness'

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

const nodes = (node: unknown): Node[] => {
  if (node === null || typeof node !== 'object') return []
  const n = node as Node
  return [n, ...(n.children ?? []).flatMap(nodes)]
}

const keyed = (tree: unknown, key: string) => nodes(tree).find(n => n.props?.key === key)

const textIn = (node: unknown): string =>
  nodes(node)
    .filter(n => n.type === 'Text' || n.type === 'Button')
    .map(n => {
      const own = (n.children ?? []).filter(c => typeof c === 'string').join('')
      return own === '' && n.type === 'Button' ? String(n.props?.label ?? '') : own
    })
    .join(' ')

const openPhase = async ($: Engine, surface: BandSurface, phase: string) => {
  await startSession($, surface)
  await (await mountBand($, surface, 200, 60)).press({ key: `phase-${phase}` })
  return mountBand($, surface, 200, 60)
}

/** Every `Text` inside a `Button` that sets its own colour: Desktop drops it, so none may. */
const colouredInButtons = (tree: unknown) =>
  nodes(tree)
    .filter(n => n.type === 'Button')
    .flatMap(b => nodes(b).filter(n => n.type === 'Text' && n.props?.color !== undefined))
    .map(n => textIn(n))

for (const surface of BAND_SURFACES) {
  test(`${surface}: the card's close is one plain glyph that answers x`, async ($, on) => {
    featureWorld(on, { surfaces: [surface] })
    const band = await openPhase($, surface, 'spec')
    const close = await band.find({ key: 'close' })
    expect(close?.props).toMatchObject({ plain: true, hotkey: 'x' })
    expect(close?.props.role).toBeUndefined()
    expect(close?.text).toBe('×')
    await band.press({ key: 'close' })
    expect(await (await mountBand($, surface, 200, 60)).find({ key: 'card' })).toBeUndefined()
  })
}

const BOARD_ORDER = [
  'Phase 4 of 7 · Up next',
  'Build',
  'Runs every unblocked ticket in parallel on one integration branch, one subagent per ticket.',
  'Command',
  '/implement-spec',
  'Helpers',
  'tdd',
  'Integration branch',
  'feat/csv',
  'Gate on: if Build is not done when Review starts, Craftory asks you to confirm first.',
]

for (const surface of BAND_SURFACES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`${surface} ${tone}: a phase card reads in the board's order, the command its primary button`, async ($, on) => {
      featureWorld(on, { surfaces: [surface], theme: tone })
      const band = await openPhase($, surface, 'build')
      const tree = keyed(await band.drawn(), 'card')
      const words = (await texts(band)).filter(w => BOARD_ORDER.includes(w))
      expect(words.filter((w, i) => words.indexOf(w) === i)).toEqual(BOARD_ORDER)
      expect(textIn(tree).indexOf('×')).toBeLessThan(textIn(tree).indexOf('Runs every'))
      const primary = await band.find({ key: 'primary' })
      expect(primary?.props).toMatchObject({
        label: 'r: /implement-spec .scratch/csv/spec.md',
        hotkey: 'r',
      })
      if (surface === 'terminal') {
        expect(await band.findAll({ type: 'Svg' })).toEqual([])
        return
      }
      const t = TOKENS[tone]
      const skill = TRIPLES.skill[tone]
      const hook = TRIPLES.hook[tone]
      expect(primary?.props.variant).toBe('primary')
      expect(keyed(tree, 'cmd-/implement-spec')?.props).toMatchObject({
        backgroundColor: t.inverseBg,
      })
      const helper = keyed(tree, 'helper-tdd')!
      expect(helper.props).toMatchObject({ borderColor: skill.bd, backgroundColor: skill.bg })
      expect(nodes(helper).some(n => n.type === 'Svg')).toBe(true)
      expect(keyed(tree, 'artifact')?.props).toMatchObject({ backgroundColor: t.tile })
      const gate = keyed(tree, 'gate-line')!
      expect(gate.props).toMatchObject({ borderColor: hook.bd, backgroundColor: hook.bg })
      expect(nodes(gate).some(n => n.type === 'Svg')).toBe(true)
      expect(colouredInButtons(tree)).toEqual([])
    })
  }
}

test('the ascii pref draws the close as x', async ($, on) => {
  featureWorld(on, { store: { prefs: { ascii: true } } })
  const band = await openPhase($, 'terminal', 'spec')
  expect((await band.find({ key: 'close' }))?.text).toBe('x')
})

const usage = (fresh: number) => ({
  input_tokens: 0,
  output_tokens: fresh,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
})

const withAgents = async (
  on: Parameters<typeof building>[0],
  $: Engine,
  surface: BandSurface,
  tone: 'light' | 'dark',
) => {
  await building(on, $, {
    surfaces: [surface],
    theme: tone,
    usage: () => usage(12_000),
    answer: () => 'Now red · test 4 of 5: the filter test fails.',
  })
  await start($, 43, 'Export button')
  await step($, 'agent-tu43', 0)
  await start($, 44, 'Ledger tax')
  if (surface === 'desktop') await startSession($, surface)
  const band = await mountBand($, surface, 200, 60)
  await band.press({ key: 'phase-build' })
  return mountBand($, surface, 200, 60)
}

const AGENTS_ORDER = [
  'Agents',
  '2 running',
  '12.0k tokens',
  'csv/01',
  'Export button',
  'Running',
  'red · test 4 of 5',
  '12.0k · —',
  '.claude/worktrees/csv-01-export-button',
  'craftory/csv-01-export-button',
  'csv/02',
  'Ledger tax',
  'One git worktree per agent · 80k token budget each',
]

for (const surface of BAND_SURFACES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`${surface} ${tone}: the Build card's agents read in the board's order`, async ($, on) => {
      const band = await withAgents(on, $, surface, tone)
      const tree = keyed(await band.drawn(), 'agents')!
      const words = textIn(tree)
      const at = AGENTS_ORDER.map(w => words.indexOf(w))
      expect(
        at.every(i => i >= 0),
        JSON.stringify(words),
      ).toBe(true)
      expect(at).toEqual([...at].sort((a, b) => a - b))
      expect(words.indexOf('Pause all')).toBeGreaterThan(words.indexOf('One git worktree'))
      expect(words.indexOf('Open panel')).toBeGreaterThan(words.indexOf('Pause all'))
      if (surface === 'terminal') {
        expect(words).toContain('[Running]')
        expect(nodes(tree).some(n => n.type === 'Svg')).toBe(false)
        return
      }
      const badge = keyed(tree, 'badge-csv/01')!
      expect(badge.type).toBe('Box')
      expect(nodes(badge).some(n => n.type === 'Button')).toBe(false)
      expect(nodes(badge).find(n => n.type === 'Text')?.props?.color).toBeDefined()
      expect(nodes(keyed(tree, 'agent-worktree-csv/01')).some(n => n.type === 'Svg')).toBe(true)
      expect(keyed(tree, 'agents-pause-box')?.props).toMatchObject({
        borderColor: TOKENS[tone].line,
      })
      expect(colouredInButtons(tree)).toEqual([])
    })
  }
}
