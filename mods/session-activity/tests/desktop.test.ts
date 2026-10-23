import { expect, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import { chipTexts, FRESH, mountBand, mountPane, session, stubEngine, SURFACES } from './harness'

const band = async ($: Engine, clock: MockClock) => {
  await clock.advance(FRESH)
  return chipTexts(await mountBand($, 'terminal', 200))
}

const ranOn = (tool: string, source: string) => ({
  tool_name: tool,
  tool_input: {},
  tool_use_id: `tu-${tool}`,
  tool_response: 'ran',
  mcp_server: { name: tool.split('__')[1]!, source },
})

const claudeMd = { path: '/repo/CLAUDE.md', kind: 'project', content: 'a\nb\nc\nd' }

const context = ($: Engine, files: object[]) =>
  $.prompt.context({ blocks: [], instructionFiles: files } as never)

test('a server the host runs in process makes no chip, before or after its provenance', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan' } as never)
  await $.tool.call({ tool: 'mcp__github__list_issues' } as never)
  expect(await band($, clock)).toEqual(['mcp:ccd_turn|⇌ ccd_turn', 'mcp:github|⇌ github'])
  await $.classic.PostToolUse(ranOn('mcp__ccd_turn__update_plan', 'sdk') as never)
  await $.classic.PostToolUse(ranOn('mcp__github__list_issues', 'dynamic') as never)
  expect(await band($, clock)).toEqual(['mcp:github|⇌ github'])
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up' } as never)
  expect(await band($, clock)).toEqual(['mcp:github|⇌ github'])
})

test('a failed call also reveals a host server', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await $.tool.call({ tool: 'mcp__ccd_session__start_session' } as never)
  await $.classic.PostToolUseFailure({
    ...ranOn('mcp__ccd_session__start_session', 'sdk'),
    error: 'refused',
  } as never)
  expect(await band($, clock)).toEqual([])
})

test('the first message context lists the rule files, with their line counts', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await context($, [claudeMd, { path: '/home/me/.claude/CLAUDE.md', kind: 'user', content: '' }])
  expect(await band($, clock)).toEqual([
    'rule:/repo/CLAUDE.md|▣ CLAUDE.md',
    'rule:/home/me/.claude/CLAUDE.md|▣ .claude/CLAUDE.md',
  ])
  const pane = await mountPane($)
  await pane.press({ key: 'row-rule-/repo/CLAUDE.md' })
  expect((await pane.findAll({ type: 'Text' })).map(t => t.text)).toContain(
    'Loaded at session start · 4 lines.',
  )
})

test('a file both the startup load and the first message report counts once', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await $.classic.InstructionsLoaded({
    file_path: '/repo/CLAUDE.md',
    memory_type: 'Project',
    load_reason: 'session_start',
  } as never)
  await context($, [claudeMd])
  await context($, [claudeMd])
  expect(await band($, clock)).toEqual(['rule:/repo/CLAUDE.md|▣ CLAUDE.md'])
})

test('a startup load after the first message context does not count again', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await context($, [claudeMd])
  await $.classic.InstructionsLoaded({
    file_path: '/repo/CLAUDE.md',
    memory_type: 'Project',
    load_reason: 'session_start',
  } as never)
  expect(await band($, clock)).toEqual(['rule:/repo/CLAUDE.md|▣ CLAUDE.md'])
})

test('a later load of a listed file still counts', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await context($, [claudeMd])
  await $.classic.InstructionsLoaded({
    file_path: '/repo/CLAUDE.md',
    memory_type: 'Project',
    load_reason: 'compact',
  } as never)
  expect(await band($, clock)).toEqual(['rule:/repo/CLAUDE.md|▣ CLAUDE.md ×2 '])
})

type Drawn = { props?: Record<string, unknown>; children?: unknown[] }

const findKey = (node: unknown, key: string): Drawn | undefined => {
  if (node === null || typeof node !== 'object') return undefined
  const drawn = node as Drawn
  if (drawn.props?.key === key) return drawn
  for (const child of drawn.children ?? []) {
    const found = findKey(child, key)
    if (found !== undefined) return found
  }
  return undefined
}

for (const surface of SURFACES) {
  test(`on ${surface}: a long description never pushes a setting's switch out of its column`, async ($, on) => {
    session(on, {}, new Map(), 'dark', [surface])
    stubEngine(on)
    const pane = await mountPane($, surface)
    await pane.press({ key: 'tab-settings' })
    const row = findKey(await pane.drawn(), 'row-toggle-checkpoint')
    const [text, control] = (row?.children ?? []) as Drawn[]
    expect(text?.props).toMatchObject({ flexShrink: 1, minWidth: 0 })
    expect(control?.props).toMatchObject({ flexShrink: 0 })
  })
}
