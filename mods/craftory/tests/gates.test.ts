import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow, type Flow } from '../src/evidence'
import {
  checkRun,
  consumePass,
  dropText,
  gateText,
  issuePass,
  PASS_MS,
  passKey,
  type RunRequest,
} from '../src/gates'
import type { Feature, GatePass, SkillName } from '../types'

const draft: Feature = {
  kind: 'draft',
  key: 'draft:d1',
  draft: {
    draftId: 'd1',
    title: 'CSV',
    entry: 'align',
    enteredFrom: null,
    marks: { align: { ranAt: '2026-10-24T10:00:00Z' } },
    startedAt: '2026-10-24T09:00:00Z',
  },
}

const flow = (config = DEFAULT_CONFIG, feature: Feature = draft): Flow =>
  deriveFlow({ feature, config, tracker: null, running: null })

const untouched: Feature =
  draft.kind === 'draft' ? { ...draft, draft: { ...draft.draft, marks: {} } } : draft

const request = (skill: string, phase: RunRequest['phase'], args = ''): RunRequest => ({
  skill: skill as SkillName,
  args,
  phase,
})

const NOW = 1_000_000

test('a run of a gated phase asks, in the design wording, naming what is not done', () => {
  const verdict = checkRun(request('to-tickets', 'tickets', '#42'), flow(), [], NOW)
  expect(verdict).toEqual({
    kind: 'ask',
    phase: 'tickets',
    by: 'spec',
    reason: 'no spec is attached to this feature yet',
    text: 'Tickets is gated: no spec is attached to this feature yet. Run anyway?',
  })
  expect(gateText('review', '#44 has 2 failing tests')).toBe(
    'Review is gated: #44 has 2 failing tests. Run anyway?',
  )
  if (verdict.kind !== 'ask') throw new Error('ask')
  expect(dropText(verdict)).toBe(
    'Tickets is gated: no spec is attached to this feature yet. Run anyway? Use Run anyway in the Craftory band above the prompt.',
  )
})

test('a phase that is not gated, helpers, entries and a missing feature go', () => {
  expect(checkRun(request('to-spec', 'spec'), flow(), [], NOW).kind).toBe('go')
  expect(
    checkRun(request('to-spec', 'spec'), flow(DEFAULT_CONFIG, untouched), [], NOW),
  ).toMatchObject({
    kind: 'ask',
    by: 'align',
    reason: 'not run yet',
  })
  expect(checkRun(request('grill-with-docs', 'align'), flow(), [], NOW).kind).toBe('go')
  expect(checkRun(request('tdd', null), flow(), [], NOW).kind).toBe('go')
  expect(checkRun(request('to-tickets', 'tickets'), null, [], NOW).kind).toBe('go')
  const open = structuredClone(DEFAULT_CONFIG)
  open.phases.align.gate = false
  expect(checkRun(request('to-spec', 'spec'), flow(open, untouched), [], NOW).kind).toBe('go')
})

test('Run anyway grants a pass for that exact request, which consumes once', () => {
  const req = request('to-tickets', 'tickets', '#42')
  const passes = issuePass([], req, NOW)
  expect(passes).toEqual([{ key: 'to-tickets #42', until: NOW + PASS_MS }])
  expect(checkRun(req, flow(), passes, NOW + 1).kind).toBe('go')
  expect(checkRun(request('to-tickets', 'tickets', '#43'), flow(), passes, NOW + 1).kind).toBe(
    'ask',
  )
  const after = consumePass(passes, req, NOW + 1)
  expect(after).toEqual([])
  expect(checkRun(req, flow(), after, NOW + 2).kind).toBe('ask')
})

test('an unconsumed pass expires, and issuing or consuming sweeps expired ones', () => {
  const req = request('to-tickets', 'tickets', '#42')
  const stale: GatePass = { key: 'old #1', until: NOW - 1 }
  const passes = issuePass([stale], req, NOW)
  expect(passes.map(p => p.key)).toEqual([passKey(req)])
  expect(checkRun(req, flow(), passes, NOW + PASS_MS).kind).toBe('ask')
  expect(consumePass([stale, ...passes], request('x', null), NOW + PASS_MS)).toEqual([])
  expect(issuePass(passes, req, NOW + 10)).toHaveLength(1)
})
