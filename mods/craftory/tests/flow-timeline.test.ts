import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { RenderSurface } from 'claude-code'
import { PHASES } from '../src/phases'
import { TOKENS, TRIPLES } from '../src/theme'
import { allText, featureWorld, mountPane, startSession, world, type WorldOptions } from './harness'
import { scenarioFiles } from './wayfinder'

type Node = { type: string; props: Record<string, unknown>; children?: unknown[] }
const isNode = (c: unknown): c is Node => typeof c === 'object' && c !== null && 'type' in c
const within = (el: { children?: unknown[] }): Node[] =>
  (el.children ?? []).filter(isNode).flatMap(c => [c, ...within(c)])

const IDS = Object.keys(PHASES)
const LAST = IDS[IDS.length - 1]!

const flowTab = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  surface: RenderSurface,
  options: WorldOptions = {},
) => {
  featureWorld(on, { surfaces: [surface], ...options })
  await startSession($, surface)
  const pane = await mountPane($, surface)
  await pane.press({ key: 'tab-flow' })
  await pane.redraw()
  return pane
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: each Flow row reads mark, label, command, then result`, async ($, on) => {
    const pane = await flowTab(on, $, surface)
    const row = (await pane.find({ key: 'flow-build' }))!.text
    const at = (s: string) => row.indexOf(s)
    expect(at(PHASES.build.label)).toBeGreaterThanOrEqual(0)
    expect(at(PHASES.build.label)).toBeLessThan(at('/implement-spec'))
    expect(at('/implement-spec')).toBeLessThan(at(PHASES.build.why))
    if (surface === 'terminal') expect(row.startsWith('▸')).toBe(true)
  })

  test(`${surface}: a joining line sits under every phase but the last`, async ($, on) => {
    const pane = await flowTab(on, $, surface)
    for (const phase of IDS.slice(0, -1))
      expect(await pane.find({ key: `flow-join-${phase}` })).toBeDefined()
    expect(await pane.find({ key: `flow-join-${LAST}` })).toBeUndefined()
  })

  test(`${surface}: the phase buttons stay under their phase`, async ($, on) => {
    const pane = await flowTab(on, $, surface)
    const row = (await pane.find({ key: 'flow-build' }))!.text
    const primary = (await pane.find({ key: 'flow-build-primary' }))!.text
    expect(row).toContain(primary)
    expect(row.indexOf(primary)).toBeGreaterThan(row.indexOf(PHASES.build.why))
  })
}

test('terminal: the mark is the phase glyph, joined by │', async ($, on) => {
  const pane = await flowTab(on, $, 'terminal')
  expect((await pane.find({ key: 'flow-join-align' }))!.text).toBe('│')
  expect(await pane.findAll({ type: 'Svg' })).toEqual([])
})

test('terminal, ASCII: the joining line is |', async ($, on) => {
  const pane = await flowTab(on, $, 'terminal', { store: { prefs: { ascii: true } } })
  expect((await pane.find({ key: 'flow-join-align' }))!.text).toBe('|')
  expect((await pane.find({ key: 'flow-align' }))!.text.startsWith('v')).toBe(true)
})

for (const tone of ['light', 'dark'] as const) {
  test(`desktop ${tone}: the mark is the numbered dot, joined by a thin bar`, async ($, on) => {
    const pane = await flowTab(on, $, 'desktop', { theme: tone })
    const svgsOf = async (key: string) =>
      within((await pane.find({ key })) as Node).filter(n => n.type === 'Svg')
    const dot = async (phase: string) =>
      String((await svgsOf(`flow-mark-${phase}`))[0]!.props.source)
    expect(await dot('build')).toContain('data-n="4"')
    expect(await dot('build')).toContain(TRIPLES.skill[tone].fg)
    expect(await dot('align')).toContain(TRIPLES.perm[tone].fg)
    const bar = async (phase: string) => {
      const svgs = await svgsOf(`flow-join-${phase}`)
      expect(svgs).toHaveLength(1)
      return String(svgs[0]!.props.source)
    }
    expect(await bar('align')).toContain(TRIPLES.perm[tone].bd)
    expect(await bar('build')).toContain(TOKENS[tone].line)
    expect(await pane.findAll({ type: 'Text', text: '│' })).toEqual([])
  })
}

test('desktop: no Button in the Flow rows colours its own Text', async ($, on) => {
  const pane = await flowTab(on, $, 'desktop')
  const rows = await Promise.all(IDS.map(p => pane.find({ key: `flow-${p}` })))
  for (const row of rows)
    for (const button of within(row as Node).filter(n => n.type === 'Button'))
      expect(JSON.stringify(button.children)).not.toContain('"color"')
})

for (const surface of ['mobile', 'vscode'] as const) {
  test(`${surface}: the Flow tab heads with the rail and the map chip`, async ($, on) => {
    const pane = await flowTab(on, $, surface, { files: scenarioFiles('local', 'mixed') })
    expect(await pane.find({ key: 'pane-rail' })).toBeDefined()
    expect(await pane.find({ key: 'map-chip' })).toBeDefined()
  })
}

test("vscode: with no tone from the editor, the rail draws no raw fills a dark window would clash with", async ($, on) => {
  const pane = await flowTab(on, $, 'vscode', {
    files: scenarioFiles('local', 'mixed'),
    theme: 'auto',
  })
  const rail = JSON.stringify(await pane.find({ key: 'pane-rail' }))
  expect(rail.match(/"(backgroundColor|borderColor|color)":"#[0-9A-Fa-f]+"/g)).toBeNull()
})

test('with no feature, the Flow tab leaves the /grill-with-docs pointer to the header', async ($, on) => {
  world(on, { surfaces: ['terminal'] })
  await startSession($, 'terminal')
  const pane = await mountPane($, 'terminal')
  const words = await allText(pane)
  expect(words.split('/grill-with-docs').length - 1).toBe(1)
})
