import { expect, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import { stubEngine, mountBand, session, SURFACES } from './harness'

const SKILLS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']

const loadSkills = async ($: Engine, clock: MockClock) => {
  for (const skill of SKILLS) {
    await clock.advance(1000)
    await $.skill.prompt({ skill, text: '', frontmatter: {}, source: 'projectSettings' } as never)
  }
}

const buttons = async (
  $: Engine,
  columns: number,
  surface: (typeof SURFACES)[number] = 'terminal',
) => (await mountBand($, surface, columns)).findAll({ type: 'Button' })

for (const columns of [60, 100, 200]) {
  test(`at ${columns} columns the row fits and every chip is either shown or counted`, async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await loadSkills($, clock)
    const row = await buttons($, columns)
    const chips = row.filter(b => b.key?.startsWith('chip-'))
    const more = row.find(b => b.key === 'more')
    const hidden = more ? Number(/\+(\d+) more/.exec(more.text)![1]) : 0
    expect(chips.length + hidden).toBe(SKILLS.length)
    expect(chips.length).toBeLessThanOrEqual(6)
    const width =
      row.reduce((sum, b) => sum + b.text.length + (b.props.hotkey ? 3 : 0), 0) +
      3 * (row.length - 1)
    expect(width).toBeLessThanOrEqual(columns)
  })
}

test('a wider band shows more chips', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const narrow = (await buttons($, 60)).filter(b => b.key?.startsWith('chip-')).length
  const wide = (await buttons($, 100)).filter(b => b.key?.startsWith('chip-')).length
  expect(wide).toBeGreaterThan(narrow)
})

test('max_chips caps the row', { options: { max_chips: 2 } }, async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const row = await buttons($, 200)
  expect(row.map(b => b.text)).toEqual(['▤ hotel', '▤ golf', '+6 more'])
})

test('chips carry digit hotkeys in band order, newest first', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const row = await buttons($, 200)
  expect(row.slice(0, 2).map(b => [b.props.hotkey, b.text])).toEqual([
    ['1', '▤ hotel'],
    ['2', '▤ golf'],
  ])
})

test('a blocked hook takes the first seat even when everything else is newer', async ($, on) => {
  const clock = session(on, {
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'guard.sh' }] }] },
  })
  stubEngine(on)
  on('classic.PreToolUse', () => ({ deny: 'no' }))
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  await loadSkills($, clock)
  const row = await buttons($, 100)
  expect(row[0]!.text).toBe('↯ guard BLOCKED ')
})

test(
  'the summary layout is one button with counts per type',
  { options: { layout: 'summary' } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
    await loadSkills($, clock)
    await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
    const row = await buttons($, 100)
    expect(row.map(b => b.text)).toEqual(['9 active · ▤8 ⚷1 · 1 stopped'])
  },
)

test('with nothing recorded the band is what the engine drew', async ($, on) => {
  session(on)
  stubEngine(on)
  const band = await mountBand($)
  expect(await band.drawn()).toEqual({ type: 'Box', part: { plugin: 'test' } })
})

test(
  'with chips turned off the band is what the engine drew',
  { options: { enabled: false } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await loadSkills($, clock)
    const band = await mountBand($)
    expect(await band.drawn()).toEqual({ type: 'Box', part: { plugin: 'test' } })
  },
)

test('the band keeps another mod content first in the row', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const drawn = (await (await mountBand($)).drawn()) as {
    children: { part?: { plugin: string } }[]
  }
  expect(drawn.children[0]).toEqual({ type: 'Box', part: { plugin: 'test' } })
})

test('the band draws on the terminal and on desktop', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  for (const surface of SURFACES) {
    const row = await buttons($, 100, surface)
    expect(row[0]!.text).toBe('▤ hotel')
  }
})
