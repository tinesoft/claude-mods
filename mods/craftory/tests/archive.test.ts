import { expect, test } from 'claude-code/testing'
import { archivedChoices, archiveRisks, isArchived, isAutoArchivable } from '../src/archive'
import {
  applyChange,
  featureChoices,
  mergeFeature,
  parseFeature,
  pickActive,
  serialiseFeature,
  specKey,
} from '../src/features'
import type { AgentRecord, FeatureRecord, IssueRef } from '../types'

const ref = (n: number) => `#${n}` as IssueRef
const T1 = '2026-10-24T10:00:00.000Z'
const T2 = '2026-10-24T11:00:00.000Z'
const T3 = '2026-10-24T12:00:00.000Z'

const base: FeatureRecord = {
  version: 1,
  spec: ref(42),
  origin: 'spec',
  title: 'Export invoices as CSV',
  entry: 'align',
  enteredFrom: null,
  skips: {},
  integrationBranch: 'feat/export',
  pr: null,
  marks: {},
  agents: {},
}

const agent = (over: Partial<AgentRecord> = {}): AgentRecord => ({
  ticket: ref(44),
  name: 'tdd-44',
  branch: 'craftory/44-x',
  worktree: '.claude/worktrees/44-x',
  tokens: 1,
  budget: 80_000,
  outcome: 'done',
  startedAt: T1,
  ...over,
})

const archived = applyChange(base, { kind: 'archive', at: T2 })

test('a feature is archived once archivedAt is later than unarchivedAt', () => {
  expect(isArchived(base)).toBe(false)
  expect(isArchived(archived)).toBe(true)
  expect(isArchived(applyChange(archived, { kind: 'unarchive', at: T3 }))).toBe(false)
  expect(
    isArchived(
      applyChange(applyChange(archived, { kind: 'unarchive', at: T3 }), {
        kind: 'archive',
        at: T3,
      }),
    ),
  ).toBe(false)
})

test('archived and unarchived survive a save and a read', () => {
  const back = parseFeature(serialiseFeature(applyChange(archived, { kind: 'unarchive', at: T3 })))
  expect(back.state === 'ok' && back.value.archivedAt).toBe(T2)
  expect(back.state === 'ok' && back.value.unarchivedAt).toBe(T3)
  expect(serialiseFeature(base)).not.toContain('archivedAt')
})

test('a merge keeps the later of each stamp, so an unarchive beats a stale archive', () => {
  const revived = applyChange(archived, { kind: 'unarchive', at: T3 })
  expect(isArchived(mergeFeature(revived, archived))).toBe(false)
  expect(isArchived(mergeFeature(archived, revived))).toBe(false)
  expect(isArchived(mergeFeature(base, archived))).toBe(true)
})

test('new activity brings an archived feature back, except a retro', () => {
  expect(isArchived(applyChange(archived, { kind: 'ran', phase: 'build', at: T3 }))).toBe(false)
  expect(
    isArchived(applyChange(archived, { kind: 'agent', record: agent({ startedAt: T3 }) })),
  ).toBe(false)
  expect(isArchived(applyChange(archived, { kind: 'ran', phase: 'retro', at: T3 }))).toBe(true)
  expect(isArchived(applyChange(archived, { kind: 'ended', phase: 'retro', at: T3 }))).toBe(true)
  // activity from before the archive changes nothing
  expect(isArchived(applyChange(archived, { kind: 'ran', phase: 'build', at: T1 }))).toBe(true)
})

test('the switcher hides archived features, and the archived list shows them', () => {
  const other: FeatureRecord = { ...base, spec: ref(50), title: 'Other' }
  const features = { '#42': archived, '#50': other }
  expect(featureChoices(features, {}, specKey(ref(50))).map(c => c.key)).toEqual(['spec:#50'])
  expect(archivedChoices(features)).toEqual([
    { key: 'spec:#42', title: 'Export invoices as CSV', archivedAt: T2 },
  ])
})

test('the active feature is never an archived one, unless its branch is checked out', () => {
  const other: FeatureRecord = { ...base, spec: ref(50), integrationBranch: 'feat/other' }
  const features = { '#42': archived, '#50': other }
  const pick = (over: object) =>
    pickActive({ features, drafts: {}, git: null, lastActive: null, ...over })
  expect(pick({ lastActive: specKey(ref(42)) })).toBe('spec:#50')
  expect(pick({ features: { '#42': archived } })).toBeNull()
  const git = {
    root: '/r',
    branch: 'feat/export',
    remote: null,
    worktrees: [],
    merged: {},
    tips: {},
    at: 0,
  }
  expect(pick({ git })).toBe('spec:#42')
})

test('a feature at risk is one with an agent that has not finished cleanly', () => {
  expect(archiveRisks(base)).toEqual([])
  expect(archiveRisks({ ...base, agents: { '#44': agent() } })).toEqual([])
  expect(
    archiveRisks({
      ...base,
      agents: {
        '#44': agent({ outcome: 'running' }),
        '#45': agent({ ticket: ref(45), outcome: 'failed' }),
      },
    }),
  ).toEqual(['#44', '#45'])
})

test('auto-archive waits for Ship, and for a retro that was offered', () => {
  const ship = { shipDone: true, retroDone: false }
  expect(isAutoArchivable(base, ship)).toBe(true)
  expect(isAutoArchivable(base, { shipDone: false, retroDone: false })).toBe(false)
  expect(isAutoArchivable({ ...base, retroOffered: true }, ship)).toBe(false)
  expect(
    isAutoArchivable({ ...base, retroOffered: true }, { shipDone: true, retroDone: true }),
  ).toBe(true)
  expect(isAutoArchivable(archived, ship)).toBe(false)
  // once brought back, it is not archived by itself again
  expect(isAutoArchivable(applyChange(archived, { kind: 'unarchive', at: T3 }), ship)).toBe(false)
})
