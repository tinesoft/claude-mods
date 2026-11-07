import { expect, test } from 'claude-code/testing'
import { readTracker } from '../src/tracker'
import { spec as gitlab } from '../src/tracker/gitlab'
import { mapView } from '../src/map-view'
import type { Read } from '../src/tracker'
import { ctx, glab } from './wayfinder'

const mapsOf = async (scenario: string) => {
  const snapshot = await readTracker(gitlab, ctx, glab(scenario))
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  return snapshot.maps ?? []
}

const rows = (scenario: string) =>
  mapsOf(scenario).then(([map]) =>
    map!.tickets.map(t => [t.ref, t.state, t.assignee, t.blockedBy] as const),
  )

const MIXED = [
  ['#13', 'resolved', null, []],
  ['#14', 'resolved', null, []],
  ['#15', 'open', null, ['#13']],
  ['#16', 'open', null, []],
  ['#17', 'claimed', 'tinekondo', []],
  ['#18', 'open', null, ['#17']],
]

test('mixed: a wayfinder:map issue and its Part of children read into the shared model', async () => {
  const [map, ...others] = await mapsOf('mixed')
  expect(others).toEqual([])
  expect(map).toMatchObject({
    ref: '#12',
    source: 'gitlab',
    title: 'Billing v2',
    origin: '#12',
    location: 'https://gitlab.com/acme/app/-/issues/12',
    isClosed: false,
    hasFog: true,
  })
  expect(map!.destination).toContain('usage-based billing')
  expect(map!.tickets.map(t => [t.title, t.type])).toEqual([
    ['Billing model', 'grilling'],
    ['Gateway limits', 'research'],
    ['Invoice layout', 'prototype'],
    ['Tax rounding', 'grilling'],
    ['Proration rules', 'grilling'],
    ['Refund flow', 'grilling'],
  ])
  expect(await rows('mixed')).toEqual(MIXED)
})

test('mixed: native blocking links win over a stale Blocked by line, and a blocks link is not a blocker', async () => {
  // #18's body says "Blocked by: #16"; the native link says #17. #17 carries a `blocks #18` link
  // that must not make #17 blocked.
  expect((await rows('mixed')).slice(-2)).toEqual([
    ['#17', 'claimed', 'tinekondo', []],
    ['#18', 'open', null, ['#17']],
  ])
})

test('no-native-links: Part of, the task list and Blocked by lines give the same map', async () => {
  const [map] = await mapsOf('no-native-links')
  expect(await rows('no-native-links')).toEqual(MIXED)
  expect(map!.hasFog).toBe(true)
})

test('route-clear: every ticket decided and no fog', async () => {
  const [map] = await mapsOf('route-clear')
  expect(map).toMatchObject({ isClosed: false, hasFog: false })
  expect(map!.tickets.map(t => t.state)).toEqual(['resolved', 'resolved'])
})

test('closed-map: a closed map is marked closed and still carries its tickets', async () => {
  const [map] = await mapsOf('closed-map')
  expect(map!.isClosed).toBe(true)
  expect(await rows('closed-map')).toEqual([
    ['#13', 'resolved', null, []],
    ['#15', 'open', null, []],
  ])
})

test('stale-link: an issue without the wayfinder:map label is not a map', async () => {
  expect(await mapsOf('stale-link')).toEqual([])
})

test('prose-trap: state, claims and blockers never come from prose or mentions', async () => {
  const [map] = await mapsOf('prose-trap')
  expect(await rows('prose-trap')).toEqual([
    ['#13', 'resolved', null, []],
    ['#15', 'open', null, []],
    ['#16', 'open', null, []],
  ])
  expect(map!.tickets.map(t => t.ref)).not.toContain('#30')
})

test('a failed glab issue list leaves the links-only snapshot', async () => {
  const snapshot = await readTracker(gitlab, ctx, async reads =>
    reads.map(read => ({
      kind: 'run' as const,
      argv: read.kind === 'run' ? read.argv : [],
      exitCode: 1,
      stdout: '',
    })),
  )
  expect(snapshot).toMatchObject({ kind: 'gitlab', rich: false })
})

const failing = (scenario: string, stderr: string) => async (reads: readonly Read[]) =>
  (await glab(scenario)(reads)).map(r =>
    r.kind === 'run' && r.argv[1] === 'api' ? { ...r, exitCode: 1, stdout: '', stderr } : r,
  )

test('a failed links lookup is not "no native links": the open tickets are not Takeable', async () => {
  const snapshot = await readTracker(gitlab, ctx, failing('no-native-links', 'timeout'))
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  const view = mapView(snapshot.maps![0]!)
  expect(view.takeable).toEqual([])
  expect(view.blocked.every(b => b.ticket.blockersUnknown === true)).toBe(true)
})

test('a plan without blocking links (HTTP 403) falls back to the Blocked by line', async () => {
  const snapshot = await readTracker(gitlab, ctx, failing('no-native-links', '403 Forbidden'))
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  expect(mapView(snapshot.maps![0]!).takeable.length).toBeGreaterThan(0)
})
