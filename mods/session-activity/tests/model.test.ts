import { expect, test } from 'claude-code/testing'
import type { Activation } from '../types'
import {
  bandCandidates,
  bandOrder,
  finishAgent,
  record,
  resolveSettings,
  type Observed,
} from '../src/model'

const skill: Observed = { kind: 'skill', key: 'docx', label: 'docx', detail: 'd', status: 'active' }
const hook = (status: Activation['status'], detail: string = status): Observed => ({
  kind: 'hook',
  key: 'PreToolUse',
  label: 'block-secrets',
  detail,
  status,
})

test('a repeat of kind and key counts up instead of adding a chip', () => {
  const list = record(record([], skill, 1), skill, 5)
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ count: 2, firstAt: 1, lastAt: 5 })
})

test('the same key under another kind is a separate chip', () => {
  const list = record(record([], skill, 1), { ...skill, kind: 'rule' }, 2)
  expect(list).toHaveLength(2)
})

test('MCP chips list every tool called on the server once', () => {
  const call = (name: string): Observed => ({
    kind: 'mcp',
    key: 'github',
    label: 'github',
    detail: '',
    meta: name,
    status: 'ok',
  })
  const list = [call('get_pull_request'), call('create_review'), call('get_pull_request')].reduce(
    (l, c, i) => record(l, c, i),
    [] as Activation[],
  )
  expect(list[0]!.meta).toBe('get_pull_request · create_review')
})

test('a later clean run keeps a blocked chip blocked', () => {
  const list = record(record([], hook('blocked', 'Blocked: secret'), 1), hook('ok'), 2)
  expect(list[0]).toMatchObject({ status: 'blocked', detail: 'Blocked: secret', count: 2 })
})

test('band order puts blocked, denied and error first, then running, then newest', () => {
  const at = (key: string, status: Activation['status'], lastAt: number): Activation => ({
    kind: 'skill',
    key,
    label: key,
    detail: '',
    status,
    count: 1,
    firstAt: lastAt,
    lastAt,
  })
  const order = bandOrder([
    at('old', 'active', 1),
    at('new', 'active', 9),
    at('run', 'running', 2),
    at('err', 'error', 3),
    at('deny', 'denied', 4),
  ]).map(a => a.key)
  expect(order).toEqual(['deny', 'err', 'run', 'new', 'old'])
})

test('an agent chip stays running until its last subagent finishes', () => {
  const spawn = (id: string): Observed => ({
    kind: 'agent',
    key: 'Explore',
    label: 'Explore',
    detail: '',
    status: 'running',
    startedAgentId: id,
  })
  let list = record(record([], spawn('a1'), 1), spawn('a2'), 2)
  list = finishAgent(list, 'a1', 'ok', 3)
  expect(list[0]!.status).toBe('running')
  list = finishAgent(list, 'a2', 'ok', 4)
  expect(list[0]).toMatchObject({ status: 'ok', count: 2 })
})

test('muted and hidden kinds leave the band, but blocked chips always show', () => {
  const settings = resolveSettings({ show_hooks: false }, undefined)
  const list = record(record([], skill, 1), hook('blocked'), 2)
  expect(bandCandidates(list, settings, ['skill:docx']).map(a => a.key)).toEqual(['PreToolUse'])
})

test('userConfig sets the defaults and pane overrides win', () => {
  const options = {
    enabled: true,
    layout: 'row',
    max_chips: 6,
    show_mcp: false,
    show_commands: true,
  }
  expect(resolveSettings(options, undefined).shown).toMatchObject({
    mcp: false,
    command: true,
    skill: true,
    model: false,
  })
  const overridden = resolveSettings(options, { layout: 'summary', shown: { mcp: true } })
  expect(overridden).toMatchObject({ layout: 'summary', shown: { mcp: true } })
})

test('max_chips is clamped to its documented 1 to 20 range', () => {
  expect(resolveSettings({ max_chips: 99 }, undefined).maxChips).toBe(20)
  expect(resolveSettings({ max_chips: 0 }, undefined).maxChips).toBe(1)
})

test('the list cap drops the oldest quiet chip, never a stopped one', () => {
  let list = record([], hook('blocked'), 0)
  for (let i = 0; i < 500; i++) list = record(list, { ...skill, key: `s${i}` }, i + 1)
  expect(list).toHaveLength(500)
  expect(list[0]).toMatchObject({ kind: 'hook', status: 'blocked' })
  expect(list.some(a => a.key === 's0')).toBe(false)
})
