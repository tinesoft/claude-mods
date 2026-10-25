import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow } from '../src/evidence'
import { phaseCard } from '../src/rail'
import type { Feature, PhaseId, TrackerKind, TrackerSnapshot } from '../types'
import { featureJson, featureWorld, mountBand, startSession, texts } from './harness'

const AT = '2026-10-24T10:00:00Z'

const draft = (phases: PhaseId[]): Feature => ({
  kind: 'draft',
  key: 'draft:d1',
  draft: {
    draftId: 'd1',
    title: 'CSV export',
    entry: 'align',
    enteredFrom: null,
    marks: Object.fromEntries(phases.map(p => [p, { markedDoneAt: AT }])),
    startedAt: AT,
  },
})

const tracker = (kind: TrackerKind): TrackerSnapshot =>
  kind === 'local' || kind === 'github'
    ? { kind, rich: true, issues: [], pr: null, at: 1, problem: null }
    : { kind, rich: false, links: [], note: null, at: 1 }

const PHASES_ALL: PhaseId[] = ['align', 'spec', 'tickets', 'build', 'review', 'ship', 'retro']

const flowOn = (kind: TrackerKind, marked: PhaseId[]) =>
  deriveFlow({
    feature: draft(marked),
    config: DEFAULT_CONFIG,
    tracker: tracker(kind),
    running: null,
  })

const honoured: Record<TrackerKind, PhaseId[]> = {
  local: ['align', 'review', 'ship', 'retro'],
  github: ['align', 'review', 'ship', 'retro'],
  gitlab: PHASES_ALL,
  other: PHASES_ALL,
}

for (const kind of ['local', 'github', 'gitlab', 'other'] as const) {
  test(`${kind}: a mark finishes ${honoured[kind].join(', ')} and no other phase`, () => {
    const flow = flowOn(kind, PHASES_ALL)
    const done = flow.steps.filter(s => s.state.kind === 'done').map(s => s.phase)
    expect(done).toEqual(honoured[kind])
  })

  test(`${kind}: the card offers Mark done on exactly the open phases a mark would finish`, () => {
    const flow = flowOn(kind, [])
    const offered = flow.steps.filter(s => s.canMarkDone).map(s => s.phase)
    expect(offered).toEqual(honoured[kind])
    for (const step of flow.steps)
      expect(
        phaseCard(step, flow, DEFAULT_CONFIG).secondary.some(b => b.action === 'mark-done'),
      ).toBe(step.canMarkDone)
  })
}

test('a phase already done by evidence or marked has no Mark done button', () => {
  const flow = flowOn('gitlab', ['align'])
  expect(flow.steps[0]!.state.kind).toBe('done')
  expect(flow.steps[0]!.canMarkDone).toBe(false)
})

test('Mark done on Align finishes the step, is saved on the record, and the button goes', async ($, on) => {
  const w = featureWorld(on, {
    files: {
      '.craftory/features/42.json': featureJson({ marks: { spec: { ranAt: AT } } }),
    },
  })
  await startSession($)
  const band = await mountBand($, 'terminal', 200, 60)
  await band.press({ key: 'step-align' })
  const card = await mountBand($, 'terminal', 200, 60)
  expect(await card.findAll({ key: 'mark-done' })).toHaveLength(1)
  await card.press({ key: 'mark-done' })
  const record = JSON.parse(w.files.get('.craftory/features/42.json')!)
  expect(record.marks.align.markedDoneAt).toBeDefined()
  const after = await mountBand($, 'terminal', 200, 60)
  expect(await after.findAll({ key: 'mark-done' })).toHaveLength(0)
  expect((await texts(after)).join(' ')).toContain('Done')
})
