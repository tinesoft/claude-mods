import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow } from '../src/evidence'
import { renderBand, type BandActions, type BandArgs } from '../src/rail'
import { Entry, Field, type Typed } from '../src/widgets'
import type { Feature, Tone } from '../types'
import { byKey, fakeUi, findAll, textOf } from './fake-ui'
import { featureWorld, mountBand, mountPane, startSession } from './harness'
import { scenarioFiles } from './wayfinder'

type Node = { type: string; props?: Record<string, unknown>; children?: unknown[] }
const isNode = (c: unknown): c is Node => typeof c === 'object' && c !== null && 'type' in c
/** Every element under one found element, depth first. */
const within = (el: { children?: unknown[] }): Node[] =>
  (el.children ?? []).filter(isNode).flatMap(c => [c, ...within(c)])
/** The real band on VS Code (its wrappers turn the roomy `lg`/`md`/`xs` spacing into whole rows and cells), with no tone, the phase card opened by `open` or the wayfinder card by `map`. */
const vscodeBand = async ($: Engine, on: On, show: { open?: string; map?: boolean } = {}) => {
  featureWorld(on, {
    surfaces: ['vscode'],
    theme: 'auto',
    ...(show.map && { files: scenarioFiles('local', 'mixed') }),
  })
  await startSession($, 'vscode')
  const opener = show.map ? 'map-chip' : show.open
  if (opener !== undefined) await (await mountBand($, 'vscode', 200)).press({ key: opener })
  return mountBand($, 'vscode', 200)
}

const draft: Feature = {
  kind: 'draft',
  key: 'draft:d1',
  draft: {
    draftId: 'd1',
    title: 'Export invoices as CSV',
    entry: 'align',
    enteredFrom: null,
    marks: {},
    startedAt: '2026-10-24T09:00:00Z',
  },
}

const noop = () => undefined
const on: BandActions = {
  phase: noop,
  triage: noop,
  summary: noop,
  gear: noop,
  closeCard: noop,
  pickFeature: noop,
  switchFeature: noop,
  map: noop,
  pickMap: noop,
  act: noop,
  wayfinder: noop,
  openFolder: noop,
}

const bandArgs = (surface: BandArgs['surface'], tone: Tone | undefined): BandArgs => ({
  ui: fakeUi(surface !== 'terminal'),
  surface,
  columns: 120,
  tone,
  ascii: false,
  spinFrame: 0,
  below: undefined,
  layout: 'row',
  flow: deriveFlow({ feature: draft, config: DEFAULT_CONFIG, tracker: null, running: null }),
  config: DEFAULT_CONFIG,
  waiting: 0,
  agents: null,
  notices: [],
  open: 'spec',
  map: null,
  isMapOpen: false,
  features: [],
  isPickingFeature: false,
  on,
})

const band = (surface: BandArgs['surface'], tone: Tone | undefined, rich: boolean) =>
  renderBand({ ...bandArgs(surface, tone), ui: fakeUi(rich) })

test("VS Code's card keeps its roomy padding and reads `x: Close`, with no tone", async ($, on) => {
  const band = await vscodeBand($, on, { open: 'phase-tickets' })
  expect((await band.find({ key: 'card' }))?.props).toMatchObject({ paddingY: 1, rowGap: 1 })
  expect((await band.find({ key: 'close' }))?.text).toBe('x: Close')
  expect((await band.find({ key: 'close-slot' }))?.props).toMatchObject({ flexShrink: 0 })
})

test("Desktop's card still goes compact over its wrapping rail, with the × close", () => {
  const out = band('desktop', 'light', true)
  expect(byKey(out, 'card')?.props).toMatchObject({ paddingY: 'xs', rowGap: 'xs' })
  expect(textOf(byKey(out, 'close'))).toBe('×')
})

test("the terminal's close keeps the plain `Close` label, which the Button draws as `x: Close`", () => {
  const out = band('terminal', undefined, false)
  expect(textOf(byKey(out, 'close'))).toBe('Close')
})

test('a chip with no tone keeps a cell of padding on VS Code, and none extra on the terminal', async ($, on) => {
  const vscode = await vscodeBand($, on)
  expect((await vscode.find({ key: 'box-gear' }))?.props).toMatchObject({
    paddingX: 1,
    columnGap: 1,
  })
  const terminal = await mountBand($, 'terminal', 200)
  expect((await terminal.find({ key: 'box-gear' }))?.props).not.toHaveProperty('paddingX')
})

test('with no tone, every connector of the phase row is a text dash, so the row stays on one line', async ($, on) => {
  const band = await vscodeBand($, on)
  const steps = (await band.find({ key: 'phases-steps' }))!
  const below = within(steps)
  expect(below.filter(n => n.type === 'Svg')).toEqual([])
  // VS Code draws no `key` on a Text, so the dashes are counted in the row's text.
  expect(steps.text.match(/─/g)).toHaveLength(6)
})

test("VS Code's settings tabs take a row of padding above and below, with no tone", async ($, on) => {
  featureWorld(on, { surfaces: ['vscode'], theme: 'auto' })
  await startSession($, 'vscode')
  const pane = await mountPane($, 'vscode')
  expect((await pane.find({ key: 'tab-flow-box' }))?.props).toMatchObject({ paddingY: 1 })
})

test('with no tone, a dim phase label is dim on its Button, not on a Text inside it', async ($, on) => {
  const band = await vscodeBand($, on)
  const retro = (await band.find({ key: 'phase-retro' }))!
  expect(retro.props).toMatchObject({ dimColor: true })
  expect(within(retro).filter(n => n.type === 'Text' && n.props?.dimColor !== undefined)).toEqual(
    [],
  )
})

test('with no tone, the selected tab carries a marker and the others do not', async ($, on) => {
  featureWorld(on, { surfaces: ['vscode'], theme: 'auto' })
  await startSession($, 'vscode')
  const pane = await mountPane($, 'vscode')
  expect((await pane.find({ key: 'tab-flow' }))?.text).toContain('▸ Flow')
  expect((await pane.find({ key: 'tab-tickets' }))?.text).not.toContain('▸')
})

test("VS Code's wayfinder card takes the phase card's roomy spacing and padded buttons", async ($, on) => {
  const band = await vscodeBand($, on, { map: true })
  expect((await band.find({ key: 'map-card' }))?.props).toMatchObject({ paddingY: 1, rowGap: 1 })
  expect((await band.find({ key: 'close' }))?.text).toBe('x: Close')
  const work = within((await band.find({ key: 'map-card' }))!).filter(
    n => n.props?.paddingY === 1 && textOf(n).includes('Work next ticket'),
  )
  expect(work.length).toBeGreaterThan(0)
})

test('with no tone, the band draws no raw fills a dark VS Code window would clash with', async ($, on) => {
  const band = await vscodeBand($, on, { map: true })
  expect(
    JSON.stringify(await band.drawn()).match(
      /"(backgroundColor|borderColor|color)":"#[0-9A-Fa-f]+"/g,
    ),
  ).toBeNull()
})

const richUi = () => ({ ...fakeUi(true), Input: fakeUi().Box }) as never

const typedLog = () => {
  const held: Record<string, string> = {}
  const typed: Typed = {
    note: (key, text) => void (held[key] = text),
    submit: (key, fallback, submit) => submit(held[key] ?? fallback),
  }
  return { held, typed }
}

test('on VS Code a field draws its own Save Button, which saves what was typed', () => {
  const { typed } = typedLog()
  const saved: string[] = []
  const out = Field({
    ui: richUi(),
    tone: undefined,
    id: 'triage',
    label: 'Needs triage',
    value: 'needs-triage',
    onSubmit: text => void saved.push(text),
    typed,
  })
  const input = findAll(out, n => n.props?.key === 'set-triage')[0]!
  expect(input.props).not.toHaveProperty('submitLabel')
  ;(input.props.onInput as (t: string) => void)('triage')
  const save = byKey(out, 'set-triage-submit')!
  expect(textOf(save)).toBe('Save')
  ;(save.props.onPress as () => void)()
  expect(saved).toEqual(['triage'])
})

test('elsewhere the Input keeps its own submit word, capitalised', () => {
  const out = Entry({
    ui: { ...fakeUi(true), Input: fakeUi().Box } as never,
    tone: 'dark',
    id: 'x',
    value: '',
    submitLabel: 'Save',
    onSubmit: noop,
    typed: typedLog().typed,
  })
  expect(byKey(out, 'x')?.props).toMatchObject({ submitLabel: 'Save' })
  expect(byKey(out, 'x-submit')).toBeUndefined()
})
