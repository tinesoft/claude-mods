import { expect, test } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'
import { stubEngine, mountBand, mountPane, session } from './harness'

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

test('/session-activity opens the pane', async ($, on) => {
  session(on)
  const { opened } = stubEngine(on)
  expect(await $.command.run({ command: 'session-activity', args: '' } as never)).toEqual({
    text: 'Opened the session activity pane.',
  })
  expect(opened).toEqual(['session-activity'])
})

for (const columns of [40, 100]) {
  test(`pressing a chip opens the pane on that item at ${columns} columns`, async ($, on) => {
    session(on, HOOKS)
    const { opened } = stubEngine(on)
    blocking(on)
    await activity($)
    await (await mountBand($)).press({ key: 'chip-hook-PreToolUse' })
    expect(opened).toEqual(['session-activity'])
    const pane = await mountPane($, 'terminal', columns)
    const row = await pane.find({ key: 'row-hook-PreToolUse' })
    expect(row?.text).toStartWith('▸ ↯ block-secrets')
    expect(await texts(pane)).toContain('Blocked: reads a secret')
    expect(await texts(pane)).toContain('bash .claude/hooks/block-secrets.sh')
  })
}

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

test('muting hides a chip from the band, keeps it in the pane, and unmutes', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'row-skill-docx' })
  await pane.press({ key: 'mute' })
  expect(await (await mountBand($)).find({ key: 'chip-skill-docx' })).toBeUndefined()
  expect((await pane.find({ key: 'row-skill-docx' }))?.text).toContain('muted')
  await pane.press({ key: 'mute' })
  expect(await (await mountBand($)).find({ key: 'chip-skill-docx' })).toBeDefined()
})

test('a blocked chip stays in the band when muted', async ($, on) => {
  session(on, HOOKS)
  stubEngine(on)
  blocking(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'row-hook-PreToolUse' })
  await pane.press({ key: 'mute' })
  expect(await (await mountBand($)).find({ key: 'chip-hook-PreToolUse' })).toBeDefined()
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
  expect((await pane.find({ key: 'toggle-skill' }))?.text).toStartWith('[ ]')
})

test('the layout picker switches the band to one summary chip', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, HOOKS, store)
  stubEngine(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.select({ key: 'layout', value: 'summary' })
  const row = await (await mountBand($)).findAll({ type: 'Button' })
  expect(row.map(b => b.key)).toEqual(['summary'])
  expect(store.get('overrides')).toEqual({ layout: 'summary' })
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
  expect(await pane.find({ key: 'layout' })).toBeDefined()
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
