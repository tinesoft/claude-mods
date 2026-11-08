import { expect, test } from 'claude-code/testing'
import { featureWorld, mountBand, startSession } from './harness'
import { TOKENS, TRIPLES } from '../src/theme'

type Node = { type: string; props: Record<string, unknown>; children?: unknown[] }
const isNode = (c: unknown): c is Node => typeof c === 'object' && c !== null && 'type' in c
const within = (el: { children?: unknown[] }): Node[] =>
  (el.children ?? []).filter(isNode).flatMap(c => [c, ...within(c)])

const PHASES = ['align', 'spec', 'tickets', 'build', 'review', 'ship', 'retro']

for (const tone of ['light', 'dark'] as const) {
  test(`desktop ${tone}: each step holds one numbered dot in its state's colour`, async ($, on) => {
    featureWorld(on, { surfaces: ['desktop'], theme: tone })
    await startSession($, 'desktop')
    const band = await mountBand($, 'desktop', 200)
    const dot = async (phase: string) => {
      const step = (await band.find({ key: `box-phase-${phase}` })) as Node
      const svgs = within(step).filter(n => n.type === 'Svg')
      expect(svgs).toHaveLength(1)
      return String(svgs[0]!.props.source)
    }
    for (const phase of PHASES) await dot(phase)
    // align, spec and tickets are done; build is next; review is gated; retro not started
    expect(await dot('align')).toContain(TRIPLES.perm[tone].fg)
    expect(await dot('align')).not.toContain('data-n=')
    expect(await dot('build')).toContain('data-n="4"')
    expect(await dot('build')).toContain(TRIPLES.skill[tone].fg)
    expect(await dot('review')).toContain(TOKENS[tone].text2)
    expect(await dot('retro')).toContain('data-n="7"')
    expect(await dot('retro')).toContain(TOKENS[tone].lineDashed)
  })
}

test('terminal: steps keep their glyphs and draw no dot', async ($, on) => {
  featureWorld(on, { surfaces: ['terminal'] })
  await startSession($, 'terminal')
  const band = await mountBand($, 'terminal', 200)
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  expect((await band.find({ key: 'phase-build' }))!.text).toBe('▸ Build')
})
