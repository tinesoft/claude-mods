import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import {
  retryContext,
  retryModel,
  mainRoute,
  mainRouteText,
  routeOf,
  routeText,
  spawnModel,
  subagentPhase,
} from '../src/routing'
import type { CraftoryConfig, PhaseConfig, PhaseId } from '../types'

const routed = (phases: Partial<Record<PhaseId, Partial<PhaseConfig>>>): CraftoryConfig => {
  const config = structuredClone(DEFAULT_CONFIG)
  for (const [id, over] of Object.entries(phases))
    config.phases[id as PhaseId] = { ...config.phases[id as PhaseId], ...over }
  return config
}

test('which phase a subagent belongs to', () => {
  const rows = [
    { isImplementer: true, running: null, phase: 'build' },
    { isImplementer: true, running: { phase: 'review' }, phase: 'build' },
    { isImplementer: false, running: { phase: 'review' }, phase: 'review' },
    { isImplementer: false, running: { phase: 'align' }, phase: 'align' },
    { isImplementer: false, running: null, phase: null },
    // an entry point such as Triage runs with no phase
    { isImplementer: false, running: { phase: null }, phase: null },
  ] as const
  for (const { phase, ...spawn } of rows) expect(subagentPhase(spawn)).toBe(phase)
})

test('the route a phase resolves to leaves out whatever is on session', () => {
  const config = routed({
    build: { model: 'sonnet', effort: 'medium' },
    review: { model: 'opus' },
    align: { effort: 'high' },
  })
  expect(routeOf(config, 'build')).toEqual({ model: 'sonnet', effort: 'medium' })
  expect(routeOf(config, 'review')).toEqual({ model: 'opus' })
  expect(routeOf(config, 'align')).toEqual({ effort: 'high' })
  expect(routeOf(config, 'ship')).toEqual({})
  expect(routeOf(config, null)).toEqual({})
})

test('a spawn gets the route model only when it names none', () => {
  expect(spawnModel({ model: 'sonnet' }, undefined)).toBe('sonnet')
  expect(spawnModel({ model: 'sonnet' }, 'haiku')).toBeUndefined()
  expect(spawnModel({ model: 'sonnet' }, 'inherit')).toBeUndefined()
  expect(spawnModel({ effort: 'low' }, undefined)).toBeUndefined()
  expect(spawnModel({}, undefined)).toBeUndefined()
})

test('the card text names the model, the effort, or both', () => {
  expect(routeText({ model: 'sonnet', effort: 'medium' })).toBe('sonnet · medium')
  expect(routeText({ model: 'claude-opus-4-1-20250805' })).toBe('claude-opus-4-1-20250805')
  expect(routeText({ effort: 'high' })).toBe('high effort')
  expect(routeText({})).toBeNull()
})

test('Retry is offered on a Failed or Over budget ticket, on a model it did not run on', () => {
  const rows = [
    { status: 'failed', escalateTo: 'opus', lastModel: 'sonnet', offer: 'opus' },
    { status: 'over', escalateTo: 'opus', lastModel: 'haiku', offer: 'opus' },
    // a record from before the model was kept
    { status: 'failed', escalateTo: 'opus', lastModel: undefined, offer: 'opus' },
    { status: 'failed', escalateTo: 'opus', lastModel: 'opus', offer: null },
    // the engine answers a full id when the spawn named no model
    { status: 'failed', escalateTo: 'opus', lastModel: 'claude-opus-4-5-20251101', offer: null },
    { status: 'failed', escalateTo: 'opus', lastModel: 'claude-sonnet-4-5', offer: 'opus' },
    { status: 'failed', escalateTo: 'claude-opus-4-5', lastModel: 'claude-opus-4-5', offer: null },
    { status: 'failed', escalateTo: 'session', lastModel: 'haiku', offer: null },
    { status: 'stopped', escalateTo: 'opus', lastModel: 'sonnet', offer: null },
    { status: 'running', escalateTo: 'opus', lastModel: 'sonnet', offer: null },
    { status: 'awaiting-merge', escalateTo: 'opus', lastModel: 'sonnet', offer: null },
  ] as const
  for (const { offer, ...row } of rows) expect(retryModel(row), JSON.stringify(row)).toBe(offer)
})

test('the retry context names the ticket, the model, and the kept worktree and branch', () => {
  expect(
    retryContext({
      ticket: 'csv/03',
      model: 'opus',
      worktree: '.claude/worktrees/csv-03-date-filter',
      branch: 'craftory/csv-03-date-filter',
    }),
  ).toBe(
    'Craftory: the user pressed Retry on opus for csv/03. Start one implementer for csv/03 again, as before; ' +
      'Craftory runs it on opus in its kept worktree `.claude/worktrees/csv-03-date-filter` on branch `craftory/csv-03-date-filter`, ' +
      'so it carries on from what is committed there. Start no other ticket.',
  )
})

test('the main session is routed only with mainThread on, while a phase with a route runs', () => {
  const config = routed({ align: { model: 'opus', effort: 'high' }, build: { effort: 'low' } })
  const on = { ...config, routing: { ...config.routing, mainThread: true } }
  const rows = [
    {
      config: on,
      running: { phase: 'align' },
      route: { phase: 'align', route: { model: 'opus', effort: 'high' } },
    },
    {
      config: on,
      running: { phase: 'build' },
      route: { phase: 'build', route: { effort: 'low' } },
    },
    // between phases, an entry point, and a phase left on session
    { config: on, running: null, route: null },
    { config: on, running: { phase: null }, route: null },
    { config: on, running: { phase: 'review' }, route: null },
    // off by default
    { config, running: { phase: 'align' }, route: null },
  ] as const
  for (const { config: c, running, route } of rows) expect(mainRoute(c, running)).toEqual(route)
})

test('the band note says what the running phase runs on', () => {
  expect(mainRouteText({ phase: 'align', route: { model: 'opus', effort: 'high' } })).toBe(
    'Align runs on opus · high',
  )
  expect(mainRouteText({ phase: 'build', route: { effort: 'low' } })).toBe(
    'Build runs on low effort',
  )
})
