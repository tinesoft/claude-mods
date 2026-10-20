import { expect, test } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'
import { hoversOf, stubEngine, mountBand, mountPane, session } from './harness'

const HOOKS = {
  hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: 'bash .claude/hooks/block-secrets.sh' }] }],
  },
}

const activity = async ($: Engine) => {
  await $.tool.call({ tool: 'mcp__github__get_pull_request' } as never)
  await $.skill.prompt({
    skill: 'docx',
    text: '',
    frontmatter: {},
    source: 'plugin',
    path: '/skills/docx/SKILL.md',
  } as never)
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
}

const blocking = (on: Parameters<typeof session>[0]) =>
  on('classic.PreToolUse', ($, e, next) =>
    (e as { command?: string }).command === 'cat .env' ? { deny: 'reads a secret' } : next(e),
  )

const texts = async (pane: { findAll: (q: ElementQuery) => Promise<FoundElement[]> }) =>
  (await pane.findAll({ type: 'Text' })).map(t => t.text)

test('session start registers /session-activity to run mid-turn', async ($, on) => {
  session(on)
  const registered: unknown[] = []
  on('command.register', ($, e) => (registered.push(e), { value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  expect(registered).toEqual([
    expect.objectContaining({ name: 'session-activity', immediate: true }),
  ])
})

test('/session-activity opens the pane', async ($, on) => {
  session(on)
  const { opened } = stubEngine(on)
  expect(await $.command.run({ command: 'session-activity', args: '' } as never)).toEqual({
    text: 'Opened the session activity pane.',
  })
  expect(opened).toEqual(['session-activity'])
})

for (const columns of [40, 100]) {
  test(`pressing a chip in a band too short for the card opens its detail view at ${columns} columns`, async ($, on) => {
    session(on, HOOKS)
    const { opens } = stubEngine(on)
    blocking(on)
    await activity($)
    await (await mountBand($, 'terminal', columns, 3)).press({ key: 'chip-hook-PreToolUse' })
    expect(opens).toEqual([expect.objectContaining({ id: 'session-activity', rows: 10 })])
    const pane = await mountPane($, 'terminal', columns)
    expect(await texts(pane)).toContain('Blocked: reads a secret')
    expect(await texts(pane)).toContain('bash .claude/hooks/block-secrets.sh')
    expect(await texts(pane)).toContain('HOOK · PreToolUse · Bash')
    await pane.press({ key: 'back' })
    expect(await pane.find({ key: 'row-hook-PreToolUse' })).toBeDefined()
  })
}

test('the activity header counts items and activations', async ($, on) => {
  const clock = session(on, HOOKS)
  stubEngine(on)
  blocking(on)
  await activity($)
  await clock.advance(18 * 60_000)
  const pane = await mountPane($)
  expect(await texts(pane)).toContain('3 items · 4 activations · started 18 min ago')
})

test('filters carry their hotkey and count, and the active one is the only one not dim', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  const all = await pane.find({ key: 'filter-all' })
  expect([all?.props.hotkey, all?.text]).toEqual(['a', 'All 3'])
  const skills = await pane.find({ key: 'filter-skill' })
  expect([skills?.props.hotkey, skills?.text]).toEqual(['s', 'Skills 1'])
  await pane.press({ key: 'filter-skill' })
  const label = async (text: string) =>
    (await pane.findAll({ type: 'Text' })).find(t => t.text === text)
  expect((await label('Skills 1'))?.props.dimColor).toBe(false)
  expect((await label('All 3'))?.props.dimColor).toBe(true)
})

test('rows are grouped under a coloured eyebrow with a dim count and show their why line', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  const all = await pane.findAll({ type: 'Text' })
  expect(all.find(t => t.text === 'SKILLS')?.props.color).toBe('#8FB0FF')
  expect(all.find(t => t.text === 'MCP')).toBeDefined()
  expect(all.map(t => t.text)).toContain('Claude loaded this skill from a plugin.')
  expect((await pane.find({ key: 'row-skill-docx' }))?.text).toContain('docx')
})

test('selecting a row expands it with its source, and the band shows the same selection', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'row-skill-docx' })
  expect(await texts(pane)).toContain('/skills/docx/SKILL.md')
  expect((await pane.find({ key: 'mute-skill-docx' }))?.props.hotkey).toBe('m')
  expect((await pane.find({ key: 'mute-mcp-github' }))?.props.hotkey).toBeUndefined()
  expect(await pane.find({ key: 'copy' })).toMatchObject({
    text: 'c: Copy path',
    props: { hotkey: 'c' },
  })
  expect(await (await mountBand($)).find({ key: 'card' })).toBeDefined()
})

test('the +N more button opens the pane', { options: { max_chips: 1 } }, async ($, on) => {
  session(on, HOOKS)
  const { opened } = stubEngine(on)
  await activity($)
  await (await mountBand($)).press({ key: 'more' })
  expect(opened).toEqual(['session-activity'])
})

test('a type filter shows that type alone', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  expect(await pane.find({ key: 'row-skill-docx' })).toBeDefined()
  await pane.press({ key: 'filter-mcp' })
  expect(await pane.find({ key: 'row-skill-docx' })).toBeUndefined()
  expect(await pane.find({ key: 'row-mcp-github' })).toBeDefined()
  await pane.press({ key: 'filter-all' })
  expect(await pane.find({ key: 'row-skill-docx' })).toBeDefined()
})

test('muting hides a chip from the band, keeps it dim with a Muted badge in the pane, and unmutes', async ($, on) => {
  session(on, HOOKS)
  const { status } = stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'mute-skill-docx' })
  expect(await (await mountBand($)).find({ key: 'chip-skill-docx' })).toBeUndefined()
  expect((await pane.find({ key: 'row-skill-docx' }))?.text).toContain('Muted')
  expect(status()).toBe('2 active · /session-activity')
  expect((await pane.find({ key: 'mute-skill-docx' }))?.text).toBe('Unmute')
  await pane.press({ key: 'mute-skill-docx' })
  expect(await (await mountBand($)).find({ key: 'chip-skill-docx' })).toBeDefined()
  expect(status()).toBe('3 active · /session-activity')
})

test('copy path puts the source on the clipboard', async ($, on) => {
  session(on, HOOKS)
  const { copied } = stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'row-skill-docx' })
  await pane.press({ key: 'copy' })
  expect(copied).toEqual(['/skills/docx/SKILL.md'])
})

test('Customize switches to the settings tab', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'customize' })
  expect(await pane.find({ key: 'reset' })).toBeDefined()
})

test('a settings toggle hides the type from the band and persists to the store', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, HOOKS, store)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-skill' })
  expect(await (await mountBand($)).find({ key: 'chip-skill-docx' })).toBeUndefined()
  expect(store.get('overrides')).toEqual({ shown: { skill: false } })
  expect((await pane.find({ key: 'toggle-skill' }))?.text).toStartWith('○')
})

test('the layout buttons switch the band to one summary chip', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, HOOKS, store)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'layout-summary' })
  const buttons = await (await mountBand($)).findAll({ type: 'Button' })
  expect(buttons.map(b => b.key)).toEqual(['summary-skill', 'summary-mcp', 'summary-hook'])
  expect(store.get('overrides')).toEqual({ layout: 'summary' })
  await pane.press({ key: 'layout-row' })
  expect(store.get('overrides')).toEqual({ layout: 'row' })
})

test('chip style, digit hotkeys and the block toast are settings with their own rows', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, HOOKS, store)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'style-text' })
  await pane.press({ key: 'toggle-hotkeys' })
  await pane.press({ key: 'toggle-toast' })
  expect(store.get('overrides')).toEqual({ chipStyle: 'text', hotkeys: true, toastOnBlock: false })
  const chip = await (await mountBand($)).find({ key: 'chip-mcp-github' })
  expect(chip?.props.hotkey).toBeDefined()
  expect(
    (await (await mountBand($)).findAll({ type: 'Box' })).some(b => b.props.backgroundColor),
  ).toBe(false)
  expect((await pane.find({ key: 'toggle-hotkeys' }))?.text).toStartWith('●')
  expect((await pane.find({ key: 'toggle-toast' }))?.text).toStartWith('○')
})

test('the settings preview is drawn by the band renderer and follows the toggles', async ($, on) => {
  session(on)
  stubEngine(on)
  const pane = await mountPane($, 'terminal', 200)
  await pane.press({ key: 'tab-settings' })
  const preview = async () =>
    (await pane.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('box-')).map(b => b.text)
  expect(await preview()).toContain('▤docx')
  expect(await preview()).not.toContain('✎Remembered: CLAUDE.md')
  await pane.press({ key: 'toggle-memory' })
  expect(await preview()).toContain('✎Remembered: CLAUDE.md')
  await pane.press({ key: 'toggle-skill' })
  expect(await preview()).not.toContain('▤docx')
  await pane.press({ key: 'layout-summary' })
  expect((await pane.find({ key: 'summary-memory' }))?.text).toBe('✎1')
  await pane.press({ key: 'toggle-enabled' })
  expect(await texts(pane)).toContain(
    'Chips are hidden. Activity is still listed in the session tray.',
  )
})

test('overrides saved by an earlier session apply in a new one', async ($, on) => {
  session(on, HOOKS, new Map([['overrides', { shown: { mcp: false } }]]))
  stubEngine(on)
  await activity($)
  expect(await (await mountBand($)).find({ key: 'chip-mcp-github' })).toBeUndefined()
})

test(
  'reset returns to the userConfig defaults; turn everything on shows optional types',
  { options: { show_mcp: false } },
  async ($, on) => {
    const store = new Map<string, unknown>()
    session(on, HOOKS, store)
    stubEngine(on)
    await activity($)
    await $.command.run({ command: 'review', args: '' } as never)
    const pane = await mountPane($)
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'all-on' })
    const band = async () =>
      (await (await mountBand($, 'terminal', 200)).findAll({ type: 'Button' })).map(b => b.key)
    expect(await band()).toContain('chip-command-review')
    expect(await band()).toContain('chip-mcp-github')
    await pane.press({ key: 'reset' })
    expect(await band()).not.toContain('chip-command-review')
    expect(await band()).not.toContain('chip-mcp-github')
    expect(store.get('overrides')).toEqual({})
  },
)

test('the pane draws on desktop', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($, 'desktop')
  expect(await pane.find({ key: 'row-mcp-github' })).toBeDefined()
  await pane.press({ key: 'tab-settings' })
  expect(await pane.find({ key: 'layout-row' })).toBeDefined()
})

test('desktop tray rows carry an Svg icon and a hover, the terminal neither', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  const desktop = await mountPane($, 'desktop')
  expect((await desktop.findAll({ type: 'Svg' })).length).toBeGreaterThanOrEqual(3)
  const hover = { backgroundColor: expect.stringMatching(/^#/) }
  expect(await hoversOf(desktop, 'rowbox-')).toEqual([hover, hover, hover])
  const terminal = await mountPane($, 'terminal')
  expect(await terminal.findAll({ type: 'Svg' })).toEqual([])
  expect(await hoversOf(terminal, 'rowbox-')).toEqual([undefined, undefined, undefined])
})

test('desktop settings draw a switch beside each label and keep the buttons', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  const desktop = await mountPane($, 'desktop')
  await desktop.press({ key: 'tab-settings' })
  const switches = (await desktop.findAll({ type: 'Svg' })).filter(s =>
    /^(On|Off)$/.test(String(s.props.alt)),
  )
  expect(switches.length).toBeGreaterThan(10)
  expect(await desktop.find({ key: 'toggle-skill' })).toBeDefined()
  const terminal = await mountPane($, 'terminal')
  await terminal.press({ key: 'tab-settings' })
  expect(await terminal.findAll({ type: 'Svg' })).toEqual([])
})

test('the filter row lists only the types the settings show', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  await $.command.run({ command: 'review', args: '' } as never)
  const pane = await mountPane($)
  expect(await pane.find({ key: 'filter-command' })).toBeUndefined()
  expect(await pane.find({ key: 'filter-skill' })).toBeDefined()
})

test('a blocked chip of a hidden type is still listed in the pane, without a mute button', async ($, on) => {
  session(on, HOOKS, new Map([['overrides', { shown: { hook: false } }]]))
  stubEngine(on)
  blocking(on)
  await activity($)
  const pane = await mountPane($)
  expect(await pane.find({ key: 'filter-hook' })).toBeDefined()
  expect(await pane.find({ key: 'mute-hook-PreToolUse' })).toBeUndefined()
  expect(await texts(pane)).toContain('Stopped and errored chips always show.')
})

test('toggling a type twice turns it back on', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, HOOKS, store)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-skill' })
  await pane.press({ key: 'toggle-skill' })
  expect(store.get('overrides')).toEqual({ shown: { skill: true } })
})

test('turn everything on keeps the chosen layout', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, HOOKS, store)
  stubEngine(on)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'layout-summary' })
  await pane.press({ key: 'all-on' })
  expect(store.get('overrides')).toMatchObject({ layout: 'summary', enabled: true })
})

test('the settings tab uses the design copy and counts the optional types on', async ($, on) => {
  session(on)
  stubEngine(on)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  expect((await pane.find({ key: 'toggle-enabled' }))?.text).toBe(
    '● Show chips above the prompt bar',
  )
  const shown = await texts(pane)
  expect(shown).toContain('Blocked and denied actions are always shown while this is on.')
  expect(shown).toContain('Shown by default')
  expect(shown).toContain('Optional · off by default (0 of 7 on)')
  expect(shown).toContain('Chip row')
  expect(shown).toContain('Collapsed summary')
  expect((await pane.find({ key: 'toggle-memory' }))?.text).toContain('○')
  await pane.press({ key: 'toggle-model' })
  expect(await texts(pane)).toContain('Optional · off by default (1 of 7 on)')
  expect(await pane.find({ key: 'reset' })).toBeDefined()
  expect(await pane.find({ key: 'all-on' })).toBeDefined()
})
