import { expect, test } from 'claude-code/testing'
import { readTracker } from '../src/tracker'
import { spec as githubSpec } from '../src/tracker/github'
import { mapView } from '../src/map-view'
import type { Read } from '../src/tracker'
import { ctx, gh } from './wayfinder'

const mapsOf = async (scenario: string) => {
  const snapshot = await readTracker(githubSpec, ctx, gh(scenario))
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

test('mixed: a wayfinder:map issue and its sub-issues read into the shared model', async () => {
  const [map, ...others] = await mapsOf('mixed')
  expect(others).toEqual([])
  expect(map).toMatchObject({
    ref: '#12',
    source: 'github',
    title: 'Billing v2',
    origin: '#12',
    location: 'https://github.com/acme/app/issues/12',
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

test('mixed: native dependency links win over a stale Blocked by line in the body', async () => {
  // #18's body says "Blocked by: #16"; the native link says #17
  expect((await rows('mixed')).at(-1)).toEqual(['#18', 'open', null, ['#17']])
})

test('no-native-links: the task list, Part of and Blocked by lines give the same map', async () => {
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

test('prose-trap: state, claims and blockers never come from prose or comment mentions', async () => {
  const [map] = await mapsOf('prose-trap')
  // #13 is closed whatever its Status line says; #15 quotes "resolved" and "claimed" but is open;
  // #30 mentions the map and #16 without being a sub-issue, so it never joins
  expect(await rows('prose-trap')).toEqual([
    ['#13', 'resolved', null, []],
    ['#15', 'open', null, []],
    ['#16', 'open', null, []],
  ])
  expect(map!.tickets.map(t => t.ref)).not.toContain('#30')
})

const failing = (scenario: string, stderr: string) => async (reads: readonly Read[]) =>
  (await gh(scenario)(reads)).map(r =>
    r.kind === 'run' && r.argv[2]?.endsWith('/blocked_by')
      ? { ...r, exitCode: 1, stdout: '', stderr }
      : r,
  )

test('a failed dependency lookup is not "no native links": the open tickets are not Takeable', async () => {
  const snapshot = await readTracker(
    githubSpec,
    ctx,
    failing('no-native-links', 'connection reset'),
  )
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  const view = mapView(snapshot.maps![0]!)
  expect(view.takeable).toEqual([])
  expect(view.blocked.length).toBeGreaterThan(0)
  expect(view.blocked.every(b => b.ticket.blockersUnknown === true)).toBe(true)
})

test('a lookup the host does not support (HTTP 404) falls back to the Blocked by line', async () => {
  const snapshot = await readTracker(
    githubSpec,
    ctx,
    failing('no-native-links', 'gh: Not Found (HTTP 404)'),
  )
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  const view = mapView(snapshot.maps![0]!)
  expect(view.takeable.length).toBeGreaterThan(0)
  expect(snapshot.maps![0]!.tickets.some(t => t.blockersUnknown === true)).toBe(false)
})

test('captured: real gh output from the sandbox repo reads into the same model', async () => {
  const [map, ...others] = await mapsOf('captured')
  expect(others).toEqual([])
  expect(map).toMatchObject({ ref: '#1', source: 'github', title: 'Billing v2', hasFog: true })
  expect(await rows('captured')).toEqual([
    ['#2', 'resolved', null, []],
    ['#3', 'claimed', 'tinesoft', []],
    ['#4', 'open', null, ['#2']], // a closed blocker stays an edge; it is not a live gate
    ['#5', 'open', null, ['#3']],
    ['#6', 'open', null, ['#5']],
  ])
})
