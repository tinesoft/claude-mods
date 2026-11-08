import { expect, test } from 'claude-code/testing'
import type { Flow, PhaseState } from '../src/evidence'
import { paneHeader } from '../src/pane-view'
import { PHASE_ORDER } from '../src/phases'
import type { Feature } from '../types'
import { allText, BAND_SURFACES, featureWorld, mountPane, startSession, world } from './harness'

const specced = {
  kind: 'specced',
  key: 'csv',
  record: { spec: '#42', title: 'CSV' },
} as unknown as Feature
const draft = { kind: 'draft', key: 'csv', draft: { title: 'CSV' } } as unknown as Feature

const flowOf = (feature: Feature, states: PhaseState['kind'][]): Flow => {
  const phases = PHASE_ORDER.map((phase, i) => ({ phase, state: { kind: states[i] ?? 'todo' } }))
  return {
    feature,
    title: 'Export invoices as CSV',
    phases,
    current:
      phases.find(p => p.state.kind === 'running' || p.state.kind === 'needs-you')?.phase ?? null,
    doneCount: phases.filter(p => p.state.kind === 'done').length,
    enabledCount: phases.filter(p => p.state.kind !== 'skipped').length,
  } as unknown as Flow
}

test('the header of a feature with nothing done counts zero phases and names no spec', () => {
  expect(paneHeader(flowOf(draft, ['next']), 0)).toEqual({
    kicker: 'Craftory',
    title: 'Export invoices as CSV',
    progress: '0 of 7 phases done',
  })
})

test('the header of a running Build names the spec, the running phase and its agents', () => {
  const flow = flowOf(specced, ['done', 'done', 'done', 'running'])
  expect(paneHeader(flow, 2)).toEqual({
    kicker: 'Craftory · spec #42',
    title: 'Export invoices as CSV',
    progress: '3 of 7 phases done · Build running, 2 agents',
  })
  expect(paneHeader(flow, 1).progress).toBe('3 of 7 phases done · Build running, 1 agent')
  expect(paneHeader(flow, 0).progress).toBe('3 of 7 phases done · Build running')
})

test('the header of a phase waiting on you says so', () => {
  const flow = flowOf(specced, ['done', 'needs-you'])
  expect(paneHeader(flow, 0).progress).toBe('1 of 7 phases done · Spec needs you')
})

test('the header of a finished feature counts every enabled phase done', () => {
  const flow = flowOf(specced, ['done', 'done', 'done', 'done', 'done', 'skipped', 'done'])
  expect(paneHeader(flow, 0).progress).toBe('6 of 6 phases done')
})

test('with no feature the header says so and points at /grill-with-docs', () => {
  expect(paneHeader(null, 0)).toEqual({
    kicker: 'Craftory',
    title: 'No feature in flight',
    progress: 'Talk the plan through first with /grill-with-docs.',
  })
})

type Pane = Pick<Awaited<ReturnType<typeof mountPane>>, 'findAll'>

/** The first three lines the pane draws, and its first two Buttons. */
const headOf = async (pane: Pane) => ({
  lines: (await pane.findAll({ type: 'Text' })).slice(0, 3).map(t => t.text),
  buttons: (await pane.findAll({ type: 'Button' })).slice(0, 2).map(b => b.key),
})

for (const surface of BAND_SURFACES) {
  test(`${surface}: the pane starts with the feature's kicker, title, progress, gear and close`, async ($, on) => {
    featureWorld(on, { surfaces: [surface] })
    await startSession($, surface)
    const pane = await mountPane($, surface)
    expect(await headOf(pane)).toEqual({
      lines: ['Craftory · spec csv', 'Export invoices as CSV', '3 of 7 phases done'],
      buttons: ['pane-gear', 'pane-close'],
    })
    for (const key of ['pane-gear', 'pane-close']) {
      const button = (await pane.find({ key }))!
      expect(button.type).toBe('Button')
      expect(button.text.length).toBe(1)
      expect(JSON.stringify(button.children)).not.toContain('"color"')
    }
  })

  test(`${surface}: with no feature the pane header points at /grill-with-docs`, async ($, on) => {
    world(on, { surfaces: [surface] })
    await startSession($, surface)
    const pane = await mountPane($, surface)
    const { lines } = await headOf(pane)
    expect(lines[1]).toBe('No feature in flight')
    expect(lines[2]).toContain('/grill-with-docs')
  })

  test(`${surface}: the pane gear opens Settings and the close closes the pane`, async ($, on) => {
    const w = featureWorld(on, { surfaces: [surface] })
    await startSession($, surface)
    const pane = await mountPane($, surface)
    await pane.press({ key: 'pane-gear' })
    await pane.redraw()
    expect(await pane.find({ key: 'settings' })).toBeDefined()
    await pane.press({ key: 'pane-close' })
    expect(w.closes).toEqual([expect.objectContaining({ id: 'craftory' })])
  })
}

test('the plugin status line shows in the Settings tab header only', async ($, on) => {
  world(on, {
    commands: [
      {
        name: 'mattpocock-skills:to-spec',
        description: '',
        source: 'plugin',
        plugin: 'mattpocock-skills',
      },
    ],
    plugins: [{ id: 'mattpocock-skills@claude-plugins-official', version: '1.3.1', enabled: true }],
  })
  await startSession($)
  const line = 'mattpocock-skills 1.3.1 installed · tested with 1.3.x'
  const pane = await mountPane($)
  expect(await allText(pane)).not.toContain(line)
  await pane.press({ key: 'tab-settings' })
  await pane.redraw()
  expect(await allText(pane)).toContain(line)
})
