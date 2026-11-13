import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow, type PhaseState } from '../src/evidence'
import { renderBand, type BandActions, type BandArgs } from '../src/rail'
import { vscodeSpaced } from '../src/ui'
import type { Feature, Tone } from '../types'
import { byKey, fakeUi, findAll, textOf } from './fake-ui'
import { featureWorld, mountPane, startSession } from './harness'

test('a structural `sm` gap becomes one row on VS Code, which draws steps as cells', () => {
  expect(vscodeSpaced({ rowGap: 'sm', marginBottom: 'sm', marginTop: 'sm' })).toEqual({
    rowGap: 1,
    marginBottom: 1,
    marginTop: 1,
  })
})

test('`xs`, the larger steps, numbers and padding are left as they are', () => {
  const props = { rowGap: 'xs', marginBottom: 'md', marginTop: 2, paddingY: 'sm', columnGap: 'sm' }
  expect(vscodeSpaced(props)).toEqual(props)
})

test('a wrapping row gets a row gap unless it sets one', () => {
  expect(vscodeSpaced({ flexDirection: 'row', flexWrap: 'wrap' })).toMatchObject({ rowGap: 1 })
  expect(vscodeSpaced({ flexDirection: 'row', flexWrap: 'wrap', rowGap: 0 })).toMatchObject({
    rowGap: 0,
  })
  expect(vscodeSpaced({ flexDirection: 'row', flexWrap: 'nowrap' })).not.toHaveProperty('rowGap')
  expect(vscodeSpaced({ flexDirection: 'column', flexWrap: 'wrap' })).not.toHaveProperty('rowGap')
})

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

test("VS Code's card keeps its roomy padding and reads `x: Close`, with no tone", () => {
  const out = band('vscode', undefined, true)
  expect(byKey(out, 'card')?.props).toMatchObject({ paddingY: 'lg', rowGap: 'md' })
  expect(textOf(byKey(out, 'close'))).toBe('x: Close')
  expect(byKey(out, 'close-slot')?.props).toMatchObject({ flexShrink: 0 })
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

test('a chip with no tone keeps a cell of padding on VS Code, and none extra on the terminal', () => {
  const gear = (rich: boolean) =>
    byKey(band(rich ? 'vscode' : 'terminal', undefined, rich), 'box-gear')?.props
  expect(gear(true)).toMatchObject({ paddingX: 'xs', columnGap: 'xs' })
  expect(gear(false)).not.toHaveProperty('paddingX')
})

test('with no tone, every connector of the phase row is a text dash, so the row stays on one line', () => {
  const base = deriveFlow({ feature: draft, config: DEFAULT_CONFIG, tracker: null, running: null })
  const done: PhaseState = { kind: 'done' } as PhaseState
  const flow = { ...base, phases: base.phases.map((s, i) => (i < 3 ? { ...s, state: done } : s)) }
  const out = renderBand({ ...bandArgs('vscode', undefined), ui: fakeUi(true), flow, open: null })
  const steps = byKey(out, 'phases-steps')
  expect(findAll(steps, n => n.type === 'Svg')).toEqual([])
  expect(findAll(steps, n => String(n.props.key).startsWith('connector-'))).toHaveLength(6)
})

test("VS Code's settings tabs take a row of padding above and below, with no tone", async ($, on) => {
  featureWorld(on, { surfaces: ['vscode'], theme: 'auto' })
  await startSession($, 'vscode')
  const pane = await mountPane($, 'vscode')
  expect((await pane.find({ key: 'tab-flow-box' }))?.props).toMatchObject({ paddingY: 1 })
})
