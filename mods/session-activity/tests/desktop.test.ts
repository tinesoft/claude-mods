import { expect, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import {
  type BandSurface,
  chipTexts,
  FRESH,
  mountBand,
  mountPane,
  session,
  stubEngine,
  SURFACES,
} from './harness'

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

const SECRETS_HOOK = {
  hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: './.claude/hooks/block-secrets.sh' }] }],
  },
}

/** What Desktop's engine answers for the demo's hook, and its band's columns at 758 pt wide. */
const DESKTOP_DENY =
  'PreToolUse:Bash hook error: [./.claude/hooks/block-secrets.sh]: Reading .env is not allowed'
const DESKTOP_COLUMNS = 92

test("on desktop a blocked hook's card opens whole in the band's 12 rows, compact", async ($, on) => {
  const clock = session(on, SECRETS_HOOK, new Map(), 'dark', ['desktop'])
  const { opens } = stubEngine(on)
  on('classic.PreToolUse', ($, e, next) =>
    (e as { command?: string }).command === 'cat .env' ? { deny: DESKTOP_DENY } : next(e),
  )
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  await clock.advance(FRESH)
  const desktop = await mountBand($, 'desktop', DESKTOP_COLUMNS, 12)
  const chip = (await desktop.findAll({ type: 'Button' })).find(b => b.key?.startsWith('chip-hook'))
  await desktop.press({ key: chip!.key! })
  const card = await desktop.find({ key: 'card' })
  expect(opens).toEqual([])
  expect(card?.props).toMatchObject({ paddingY: 'xs', rowGap: 'xs' })
  expect(card?.text).toContain('./.claude/hooks/block-secrets.sh')
})

const blockedOnDesktop = async ($: Engine, on: Parameters<typeof session>[0]) => {
  const clock = session(on, SECRETS_HOOK, new Map(), 'dark', ['desktop'])
  const { opens } = stubEngine(on)
  on('classic.PreToolUse', ($, e, next) =>
    (e as { command?: string }).command === 'cat .env' ? { deny: DESKTOP_DENY } : next(e),
  )
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  await clock.advance(FRESH)
  return async (columns: number, maxRows: number) => {
    opens.length = 0
    const band = await mountBand($, 'desktop', columns, maxRows)
    await band.press({ key: 'chip-hook-./.claude/hooks/block-secrets.sh' })
    const card = await band.find({ key: 'card' })
    const why = (await band.findAll({ type: 'Text' })).find(t => t.text.startsWith('Blocked:'))
    if (card !== undefined) await band.press({ key: 'close' })
    await band.unmount()
    return { inPane: opens.length > 0, card, wrap: why?.props.wrap }
  }
}

test("on desktop a blocked hook's card opens above the chip at any window width", async ($, on) => {
  const probe = await blockedOnDesktop($, on)
  for (const columns of [40, 60, 80, 92, 120, 160]) {
    const { inPane, card } = await probe(columns, 12)
    expect({ columns, inPane, inBand: card !== undefined }).toEqual({
      columns,
      inPane: false,
      inBand: true,
    })
  }
})

test('on desktop the why line wraps where it fits and keeps to one line where it may not', async ($, on) => {
  const probe = await blockedOnDesktop($, on)
  expect((await probe(DESKTOP_COLUMNS, 12)).wrap).toBe('wrap')
  expect((await probe(40, 12)).wrap).toBe('truncate-end')
  expect((await probe(DESKTOP_COLUMNS, 40)).wrap).toBe('wrap')
})

test('on desktop a band too short even for the one-line card still opens the pane', async ($, on) => {
  const probe = await blockedOnDesktop($, on)
  expect(await probe(DESKTOP_COLUMNS, 6)).toMatchObject({ inPane: true, card: undefined })
})

const TOOLS = [
  'list_issues',
  'get_issue',
  'create_issue',
  'get_pull_request',
  'create_review',
  'list_commits',
  'search_code',
  'get_file_contents',
]

const LONG_RULE =
  '/srv/shared-instructions-for-every-repository/organization-wide-coding-standards.md'

/** The card's Texts, drawn in the band and in the pane, for the one chip on the band. */
const cardTexts = async ($: Engine, clock: MockClock, surface: BandSurface, rows: number) => {
  await clock.advance(FRESH)
  const band = await mountBand($, surface, 98, rows)
  const chip = (await band.findAll({ type: 'Button' })).find(b => b.key?.startsWith('chip-'))
  await band.press({ key: chip!.key! })
  const inBand = await band.find({ key: 'card' })
  const bandTexts = await band.findAll({ type: 'Text' })
  await band.press({ key: 'close' })
  return { inBand, bandTexts }
}

const wrapOf = (texts: { text: string; props: Record<string, unknown> }[], match: string) =>
  texts.find(t => t.text.includes(match))?.props.wrap

for (const [surface, rows] of [
  ['terminal', 40],
  ['desktop', 12],
] as const) {
  test(`on ${surface} an MCP card's head of many tools keeps to one line in the band`, async ($, on) => {
    const clock = session(on, {}, new Map(), 'dark', [surface])
    const { opens } = stubEngine(on)
    for (const tool of TOOLS) await $.tool.call({ tool: `mcp__github__${tool}` } as never)
    const { inBand, bandTexts } = await cardTexts($, clock, surface, rows)
    expect(opens).toEqual([])
    expect(inBand).toBeDefined()
    expect(wrapOf(bandTexts, 'MCP · list_issues')).toBe('truncate-end')
    expect(bandTexts.find(t => t.text === 'github')?.props.wrap).toBe('truncate-end')
  })

  test(`on ${surface} a long chip name keeps to one line in the band`, async ($, on) => {
    const clock = session(on, {}, new Map(), 'dark', [surface])
    const { opens } = stubEngine(on)
    await $.classic.InstructionsLoaded({
      file_path: LONG_RULE,
      memory_type: 'User',
      load_reason: 'session_start',
    } as never)
    const { inBand, bandTexts } = await cardTexts($, clock, surface, rows)
    expect(opens).toEqual([])
    expect(inBand).toBeDefined()
    const name = bandTexts.find(t => t.text === LONG_RULE.split('/').slice(-2).join('/'))
    expect(name?.props.wrap).toBe('truncate-end')
  })
}

test('the pane, where the band is too short for the card, keeps the whole head and name', async ($, on) => {
  const clock = session(on)
  const { opens } = stubEngine(on)
  for (const tool of TOOLS) await $.tool.call({ tool: `mcp__github__${tool}` } as never)
  await clock.advance(FRESH)
  await (await mountBand($, 'terminal', 98, 3)).press({ key: 'chip-mcp-github' })
  expect(opens.map(o => o.id)).toEqual(['session-activity'])
  const texts = await (await mountPane($)).findAll({ type: 'Text' })
  const head = texts.find(t => t.text.startsWith('MCP · list_issues'))
  expect(head?.text).toBe(`MCP · ${TOOLS.join(' · ')}`)
  expect(head?.props.wrap).toBeUndefined()
  const name = texts.find(t => t.text === 'github')
  expect(name).toBeDefined()
  expect(name?.props.wrap).toBeUndefined()
})
