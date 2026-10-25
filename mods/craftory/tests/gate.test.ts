import { expect, test } from 'claude-code/testing'
import { TRIPLES } from '../src/theme'
import type { world } from './harness'
import {
  allText,
  BAND_SURFACES,
  featureWorld,
  mattCommands,
  mountBand,
  skillPrompt,
  startSession,
  submit,
  turnComplete,
} from './harness'

const DRAFT = {
  d1: {
    title: 'CSV export',
    entry: 'align',
    startedAt: '2026-10-24T09:00:00Z',
    marks: { align: { ranAt: '2026-10-24T10:00:00Z' } },
  },
}

const gatedWorld = (on: Parameters<typeof world>[0]) =>
  featureWorld(on, {
    files: {
      '.craftory/features/42.json': '',
      'docs/issues/42-export-invoices.md': '# unrelated\n',
    },
    store: { drafts: DRAFT },
  })

const GATE = 'Tickets is gated: no spec has been published yet. Run anyway?'

test('a typed namespaced command for a gated phase is dropped, with the reason and where to go', async ($, on) => {
  gatedWorld(on)
  await startSession($)
  const result = await submit($, '/mattpocock-skills:to-tickets #42')
  expect(result.drop).toBe(`${GATE} Use Run anyway in the Craftory band above the prompt.`)
})

test('the short form is recognised too', async ($, on) => {
  gatedWorld(on)
  await startSession($)
  expect((await submit($, '/to-tickets #42')).drop).toContain('Tickets is gated')
})

test('the band says it, with Run anyway and Diagnose, and one toast announces it once', async ($, on) => {
  const w = gatedWorld(on)
  await startSession($)
  await submit($, '/mattpocock-skills:to-tickets #42')
  await submit($, '/mattpocock-skills:to-tickets #42')
  const band = await mountBand($)
  expect(await allText(band)).toContain(GATE)
  expect((await band.find({ key: 'notice-run-anyway-tickets' }))!.text).toContain('Run anyway')
  expect((await band.find({ key: 'notice-diagnose-tickets' }))!.text).toContain('Diagnose')
  expect(w.toasts).toEqual(['Tickets is gated · no spec has been published yet'])
  expect(w.toastTimeouts).toEqual([4000])
})

for (const surface of BAND_SURFACES) {
  test(`${surface}: the gate row is amber`, async ($, on) => {
    gatedWorld(on)
    await startSession($, surface)
    await submit($, '/to-tickets #42')
    const row = await (await mountBand($, surface)).find({ key: 'notice-gate-tickets' })
    expect(row).toBeDefined()
    const text = (await (await mountBand($, surface)).findAll({ type: 'Text' })).find(t =>
      t.text.includes('is gated'),
    )
    expect(text?.props.color).toBe(TRIPLES.hook.dark.fg)
  })
}

test('nothing that is not a gated Matt phase is held', async ($, on) => {
  gatedWorld(on)
  await startSession($)
  expect(await submit($, 'hello there')).toEqual({ text: 'hello there' })
  expect(await submit($, '/mattpocock-skills:tdd')).toEqual({ text: '/mattpocock-skills:tdd' })
  expect((await submit($, '/other-plugin:to-tickets #1')).drop).toBeUndefined()
  expect((await submit($, '/mattpocock-skills:grill-with-docs')).drop).toBeUndefined()
})

test('Run anyway runs the command once, and the re-entered gate lets it through', async ($, on) => {
  const w = gatedWorld(on)
  await startSession($)
  await submit($, '/mattpocock-skills:to-tickets #42')
  await (await mountBand($)).press({ key: 'notice-run-anyway-tickets' })
  expect(w.commandsRun).toEqual([{ command: 'mattpocock-skills:to-tickets', args: '#42' }])
  // The engine runs a plugin's command through our own prompt.submit; the pass lets it by.
  expect(await submit($, '/mattpocock-skills:to-tickets #42')).toEqual({
    text: '/mattpocock-skills:to-tickets #42',
  })
  expect(await allText(await mountBand($))).not.toContain('is gated')
})

test('the pass is used up by that run: the next typed run is held again', async ($, on) => {
  gatedWorld(on)
  await startSession($)
  await submit($, '/mattpocock-skills:to-tickets #42')
  await (await mountBand($)).press({ key: 'notice-run-anyway-tickets' })
  expect((await submit($, '/mattpocock-skills:to-tickets #42')).drop).toBeUndefined()
  expect((await submit($, '/mattpocock-skills:to-tickets #42')).drop).toContain('Tickets is gated')
})

test('a rail press while gated holds, then Run anyway sends exactly one command and no drop', async ($, on) => {
  const w = gatedWorld(on)
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  await band.press({ key: 'step-tickets' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'primary' })
  expect(w.commandsRun).toEqual([])
  expect(await allText(await mountBand($, 'terminal', 200))).toContain(GATE)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-run-anyway-tickets' })
  expect(w.commandsRun).toEqual([{ command: 'mattpocock-skills:to-tickets', args: '' }])
  expect((await submit($, '/mattpocock-skills:to-tickets')).drop).toBeUndefined()
  expect(w.commandsRun).toHaveLength(1)
})

test('an unconsumed pass expires instead of lingering into a later run', async ($, on) => {
  const w = gatedWorld(on)
  await startSession($)
  await submit($, '/mattpocock-skills:to-tickets #42')
  await (await mountBand($)).press({ key: 'notice-run-anyway-tickets' })
  expect(w.commandsRun).toHaveLength(1)
  await w.clock.advance(31_000)
  expect((await submit($, '/mattpocock-skills:to-tickets #42')).drop).toContain('Tickets is gated')
})

test('Diagnose runs diagnosing-bugs instead, and Dismiss only closes the row', async ($, on) => {
  const w = gatedWorld(on)
  await startSession($)
  await submit($, '/to-tickets #1')
  await (await mountBand($)).press({ key: 'notice-diagnose-tickets' })
  expect(w.commandsRun).toEqual([{ command: 'mattpocock-skills:diagnosing-bugs', args: '' }])
  expect(await allText(await mountBand($))).not.toContain('is gated')
  await submit($, '/to-tickets #1')
  await (await mountBand($)).press({ key: 'notice-dismiss-gate-tickets' })
  expect(await allText(await mountBand($))).not.toContain('is gated')
  expect(w.commandsRun).toHaveLength(1)
})

test('a gate that no longer holds is dropped from the band', async ($, on) => {
  const w = gatedWorld(on)
  await startSession($)
  await submit($, '/to-tickets #1')
  w.files.set('docs/issues/50-spec.md', '---\ntype: spec\ncreated: 2026-10-24\n---\n# Spec\n')
  await skillPrompt($, 'to-spec')
  await turnComplete($)
  expect(await allText(await mountBand($))).not.toContain('is gated')
})

test('a typed bare name that another source owns is not gated, while the namespaced name is', async ($, on) => {
  featureWorld(on, {
    files: {
      '.craftory/features/42.json': '',
      'docs/issues/42-export-invoices.md': '# unrelated\n',
    },
    store: { drafts: DRAFT },
    commands: [
      ...mattCommands('to-tickets', 'to-spec'),
      { name: 'to-tickets', description: 'mine', source: 'user' },
    ],
  })
  await startSession($)
  expect((await submit($, '/to-tickets #42')).drop).toBeUndefined()
  expect((await submit($, '/mattpocock-skills:to-tickets #42')).drop).toContain('Tickets is gated')
})

test('with the plugin missing a bare name is nobody Craftory knows', async ($, on) => {
  featureWorld(on, {
    files: {
      '.craftory/features/42.json': '',
      'docs/issues/42-export-invoices.md': '# unrelated\n',
    },
    store: { drafts: DRAFT },
    commands: [],
  })
  await startSession($)
  expect((await submit($, '/to-tickets #42')).drop).toBeUndefined()
})
