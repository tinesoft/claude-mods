import { expect, test } from 'claude-code/testing'
import { readTracker } from '../src/tracker'
import { spec as localSpec } from '../src/tracker/local'
import { ctx, fs, scenarioFiles } from './wayfinder'

const mapsOf = async (files: Record<string, string>) => {
  const snapshot = await readTracker(localSpec, ctx, fs(files))
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  return snapshot.maps ?? []
}

test('a Local map is found by its Destination heading, with its tickets in order', async () => {
  const [map, ...others] = await mapsOf(scenarioFiles('local', 'mixed'))
  expect(others).toEqual([])
  expect(map).toMatchObject({
    source: 'local',
    title: 'Billing v2',
    origin: '.scratch/billing-v2',
    isClosed: false,
    hasFog: true,
  })
  expect(map!.tickets.map(t => [t.title, t.state, t.assignee, t.type])).toEqual([
    ['Billing model', 'resolved', null, 'grilling'],
    ['Gateway limits', 'resolved', null, 'research'],
    ['Invoice layout', 'open', null, 'prototype'],
    ['Tax rounding', 'open', null, 'grilling'],
    ['Proration rules', 'claimed', 'tinekondo', 'grilling'],
    ['Refund flow', 'open', null, 'grilling'],
  ])
  expect(map!.tickets.map(t => t.blockedBy)).toEqual([
    [],
    [],
    ['billing-v2/01'],
    [],
    [],
    ['billing-v2/05'],
  ])
})

test('a folder with a map.md but no Destination heading is not a map', async () => {
  const files = scenarioFiles('local', 'mixed')
  files['.scratch/billing-v2/map.md'] = '# Notes\n\nJust notes.\n'
  expect(await mapsOf(files)).toEqual([])
})

test('a map beside a feature spec leaves the feature readable and the map separate', async () => {
  const files = {
    ...scenarioFiles('local', 'mixed'),
    '.scratch/csv/spec.md':
      '# CSV\n\n## Problem Statement\nx\n\n## User Stories\n1. As an a, I want b\n',
    '.scratch/csv/issues/01-button.md': '# 01: Button\n\nStatus: ready-for-agent\n',
  }
  const snapshot = await readTracker(localSpec, ctx, fs(files))
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  expect(snapshot.issues.map(i => i.ref)).toEqual(['csv', 'csv/01'])
  expect(snapshot.maps?.map(m => m.ref)).toEqual(['billing-v2'])
})
