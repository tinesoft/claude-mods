import { expect, test } from 'claude-code/testing'
import type { IssueRef, WayMap } from '../types'
import { parseFeature, serialiseFeature } from '../src/features'
import { resolveMaps } from '../src/map-view'
import { featureJson, featureWorld, mountBand, startSession, type WorldOptions } from './harness'
import { scenarioFiles } from './wayfinder'

const way = (ref: string, updatedAt: number, isClosed = false): WayMap => ({
  ref: ref as IssueRef,
  source: 'local',
  title: ref,
  origin: `.scratch/${ref}`,
  location: `.scratch/${ref}/map.md`,
  isClosed,
  destination: '',
  hasFog: false,
  tickets: [],
  updatedAt,
})

const maps = [way('old', 1), way('new', 5), way('shut', 9, true)]

test('without a link the active map is the most recently updated open one', () => {
  const r = resolveMaps({ maps, link: null, reachable: true })
  expect(r.active?.ref).toBe('new')
  expect(r.others.map(m => m.ref)).toEqual(['shut', 'old'])
  expect(r.link).toBe('none')
})

test('a valid link wins over a newer map, even a closed one', () => {
  expect(resolveMaps({ maps, link: 'old' as IssueRef, reachable: true }).active?.ref).toBe('old')
  const shut = resolveMaps({ maps, link: 'shut' as IssueRef, reachable: true })
  expect(shut.active?.ref).toBe('shut')
  expect(shut.link).toBe('valid')
})

test('an unreachable tracker keeps the link silently and falls back', () => {
  const r = resolveMaps({ maps, link: 'gone' as IssueRef, reachable: false })
  expect(r.link).toBe('unknown')
  expect(r.active?.ref).toBe('new')
})

test('a link to nothing map-shaped is stale and falls back', () => {
  const r = resolveMaps({ maps, link: 'gone' as IssueRef, reachable: true })
  expect(r.link).toBe('stale')
  expect(r.active?.ref).toBe('new')
})

test('a picked map overrides the rule while it exists', () => {
  expect(resolveMaps({ maps, link: null, reachable: true, picked: 'old' }).active?.ref).toBe('old')
  expect(resolveMaps({ maps, link: null, reachable: true, picked: 'zzz' }).active?.ref).toBe('new')
})

test('a Feature stores one optional map reference and round-trips it', () => {
  const loaded = parseFeature(featureJson({ map: 'billing-v2' }))
  if (loaded.state !== 'ok') throw new Error('invalid')
  expect(loaded.value.map).toBe('billing-v2')
  expect(parseFeature(serialiseFeature(loaded.value))).toMatchObject({
    value: { map: 'billing-v2' },
  })
  const plain = parseFeature(featureJson())
  if (plain.state !== 'ok') throw new Error('invalid')
  expect(plain.value.map).toBeUndefined()
  expect(serialiseFeature(plain.value)).not.toContain('"map"')
})

const twoMaps = (feature: Record<string, unknown>): WorldOptions => {
  const refunds = Object.fromEntries(
    Object.entries(scenarioFiles('local', 'mixed')).map(([path, text]) => [
      path.replace('billing-v2', 'refunds'),
      text.replace('# Billing v2', '# Refunds'),
    ]),
  )
  return {
    files: {
      ...scenarioFiles('local', 'mixed'),
      ...refunds,
      '.craftory/features/csv.json': featureJson(feature),
    },
  }
}

const openCard = async ($: Parameters<typeof mountBand>[0]) => {
  await (await mountBand($, 'terminal', 200)).press({ key: 'map-chip' })
  return mountBand($, 'terminal', 200)
}

test('several maps: the newest is active and the card lists the rest in a switcher', async ($, on) => {
  const w = featureWorld(on, twoMaps({}))
  w.mtimes.set('.scratch/refunds/map.md', 500)
  await startSession($)
  const band = await openCard($)
  expect((await band.find({ key: 'map-chip' }))!.text).toContain('Refunds')
  expect((await band.find({ key: 'map-switch-billing-v2' }))!.text).toContain('Billing v2')
  expect(await band.find({ key: 'map-switch-refunds' })).toBeUndefined()
})

test('the Feature link beats a newer map', async ($, on) => {
  const w = featureWorld(on, twoMaps({ map: 'billing-v2' }))
  w.mtimes.set('.scratch/refunds/map.md', 500)
  await startSession($)
  const band = await openCard($)
  expect((await band.find({ key: 'map-chip' }))!.text).toContain('Billing v2')
  expect((await band.find({ key: 'map-card' }))!.text).not.toContain('Map not found')
})

test('picking a map in the switcher makes it the active one, and the chip stays one chip', async ($, on) => {
  const w = featureWorld(on, twoMaps({}))
  w.mtimes.set('.scratch/refunds/map.md', 500)
  await startSession($)
  await (await openCard($)).press({ key: 'map-switch-billing-v2' })
  const band = await mountBand($, 'terminal', 200)
  expect((await band.find({ key: 'map-chip' }))!.text).toContain('Billing v2 2✓ 4?')
  expect((await band.find({ key: 'map-switch-refunds' }))!.text).toContain('Refunds')
})

test('one map has no switcher', async ($, on) => {
  featureWorld(on, { files: scenarioFiles('local', 'mixed') })
  await startSession($)
  const band = await openCard($)
  expect(await band.find({ key: 'map-switch-billing-v2' })).toBeUndefined()
})

test('a stale link shows a quiet Map not found, falls back, and is never rewritten', async ($, on) => {
  const w = featureWorld(on, {
    files: {
      ...scenarioFiles('local', 'stale-link'),
      '.craftory/features/csv.json': featureJson({ map: 'notes' }),
    },
  })
  await startSession($)
  const band = await openCard($)
  const card = (await band.find({ key: 'map-card' }))!
  expect(card.text).toContain('Map not found')
  expect(card.text).toContain('Billing v2')
  expect(w.writes.filter(x => x.path.startsWith('.craftory'))).toEqual([])
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).map).toBe('notes')
})

test('a valid link shows no warning and the file keeps the link', async ($, on) => {
  const w = featureWorld(on, {
    files: {
      ...scenarioFiles('local', 'mixed'),
      '.craftory/features/csv.json': featureJson({ map: 'billing-v2' }),
    },
  })
  await startSession($)
  const band = await openCard($)
  expect((await band.find({ key: 'map-card' }))!.text).not.toContain('Map not found')
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).map).toBe('billing-v2')
})
