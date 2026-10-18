import { expect, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import { FRESH, type Finder, mountBand, session, stubEngine, SURFACES } from './harness'

const SKILLS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']

const loadSkills = async ($: Engine, clock: MockClock, skills = SKILLS) => {
  for (const skill of skills) {
    await clock.advance(1000)
    await $.skill.prompt({ skill, text: '', frontmatter: {}, source: 'projectSettings' } as never)
  }
  await clock.advance(FRESH)
}

const row = async ($: Engine, columns: number, surface: (typeof SURFACES)[number] = 'terminal') => {
  const band = await mountBand($, surface, columns)
  const boxes = (await band.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('box-'))
  const more = await band.find({ key: 'more' })
  return { band, boxes, more, hidden: more ? Number(/\+(\d+) more/.exec(more.text)![1]) : 0 }
}

const texts = async (band: Finder) => (await band.findAll({ type: 'Text' })).map(t => t.text)

for (const columns of [60, 100, 200]) {
  test(`at ${columns} columns the row fits and every chip is either shown or counted`, async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await loadSkills($, clock)
    const { boxes, more, hidden } = await row($, columns)
    expect(boxes.length + hidden).toBe(SKILLS.length)
    expect(boxes.length).toBeLessThanOrEqual(6)
    const chipCells = boxes.reduce((sum, b) => sum + b.text.length + 3, 0)
    const used = chipCells + (boxes.length - 1) + (more ? 1 + more.text.length : 0)
    expect(used).toBeLessThanOrEqual(columns - 2)
  })
}

test('a wider band shows more chips', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const narrow = (await row($, 60)).boxes.length
  const wide = (await row($, 100)).boxes.length
  expect(wide).toBeGreaterThan(narrow)
})

test('the first row is two cells shorter than the band', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock, ['aa', 'bb'])
  expect((await row($, 15)).boxes).toHaveLength(2)
  expect((await row($, 14)).boxes).toHaveLength(1)
})

test('max_chips caps the row', { options: { max_chips: 2 } }, async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const { boxes, more } = await row($, 200)
  expect(boxes.map(b => b.text)).toEqual(['▤hotel', '▤golf'])
  expect(more?.text).toBe('+6 more')
})

test('chips and the overflow button carry no hotkey unless chip_hotkeys is on', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const buttons = await (await mountBand($, 'terminal', 60)).findAll({ type: 'Button' })
  expect(buttons.length).toBeGreaterThan(1)
  expect(buttons.map(b => b.props.hotkey)).toEqual(buttons.map(() => undefined))
})

test(
  'chip_hotkeys numbers the chips in band order, newest first',
  { options: { chip_hotkeys: true } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await loadSkills($, clock)
    const buttons = await (await mountBand($, 'terminal', 200)).findAll({ type: 'Button' })
    expect(buttons.slice(0, 2).map(b => [b.props.hotkey, b.text])).toEqual([
      ['1', 'hotel'],
      ['2', 'golf'],
    ])
    expect(buttons.at(-1)?.props.hotkey).toBe('0')
  },
)

test('a blocked hook takes the first seat even when everything else is newer', async ($, on) => {
  const clock = session(on, {
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'guard.sh' }] }] },
  })
  stubEngine(on)
  on('classic.PreToolUse', () => ({ deny: 'no' }))
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  await loadSkills($, clock)
  const { boxes } = await row($, 100)
  expect(boxes[0]!.text).toBe('↯guard BLOCKED ')
})

test(
  'the summary layout is one tinted box with counts per type and a stopped tally',
  { options: { layout: 'summary' } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
    await loadSkills($, clock)
    await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
    const band = await mountBand($, 'terminal', 100)
    const summary = await band.find({ key: 'summary' })
    expect(summary?.text).toBe('9 active · ▤8 ⚷1')
    expect(await texts(band)).toContain('· ● 1 stopped')
    const boxes = await band.findAll({ type: 'Box' })
    expect(
      boxes.some(b => b.text === '9 active · ▤8 ⚷1· ● 1 stopped' && b.props.backgroundColor),
    ).toBe(true)
    expect(summary?.props.hotkey).toBeUndefined()
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

test('while a survey holds the band the mod draws nothing of its own', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const band = await $.ui.mount({
    plugin: 'session-activity',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: true,
      isWorking: false,
      maxRows: 24,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 23 },
      view: {},
    },
  })
  expect(await band.drawn()).toEqual({ type: 'Box', part: { plugin: 'test' } })
})

test('the band keeps another mod content first', async ($, on) => {
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
    expect((await row($, 100, surface)).boxes[0]!.text).toBe('▤hotel')
  }
})

test('a chip is bold with a dot for four seconds after it activates, then settles', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  const label = async () =>
    (await (await mountBand($)).findAll({ type: 'Text' })).find(t => t.text.endsWith('docx'))
  expect(await label()).toMatchObject({ text: '● docx', props: { bold: true } })
  await clock.advance(4000)
  expect(await label()).toMatchObject({ text: 'docx', props: { bold: false } })
})

test('a running agent cycles its glyph on the clock, and the timer stops when it ends', async ($, on) => {
  const clock = session(on)
  const engine = stubEngine(on)
  await $.agent.spawn({
    tool_use_id: 'tu',
    prompt: 'p',
    description: 'pr',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: false,
    fork: false,
  } as never)
  const glyph = async () => (await row($, 100)).boxes[0]!.text[0]
  const seen = new Set<string | undefined>()
  for (let i = 0; i < 4; i++) {
    seen.add(await glyph())
    await clock.advance(150)
  }
  expect(seen.size).toBe(4)
  expect(engine.invalidations()).toBeGreaterThanOrEqual(4)
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1,
    isAborted: false,
    turnId: 't',
    agentId: 'agent-pr',
    reason: 'answer',
  })
  const after = engine.invalidations()
  await clock.advance(2000)
  expect(engine.invalidations()).toBe(after)
  expect(await glyph()).toBe('◉')
})

test('an interrupted agent shows a red triangle and an ERROR badge', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await $.agent.spawn({
    tool_use_id: 'tu',
    prompt: 'p',
    description: 'pr',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: false,
    fork: false,
  } as never)
  await $.turn.complete({
    answer: '',
    durationMs: 1,
    isAborted: true,
    turnId: 't',
    agentId: 'agent-pr',
    reason: 'aborted',
  })
  await clock.advance(FRESH)
  const { band, boxes } = await row($, 100)
  expect(boxes.map(b => b.text)).toEqual(['▲Explore ERROR '])
  const triangle = (await band.findAll({ type: 'Text' })).find(t => t.text === '▲')
  expect(triangle?.props.color).toBe('error')
})

test('tinted chips take the palette of the theme, light or dark', async ($, on) => {
  const clock = session(on, {}, new Map(), 'light')
  stubEngine(on)
  await loadSkills($, clock, ['alpha'])
  expect((await row($, 100)).boxes[0]!.props.backgroundColor).toBe('#EDF2FD')
})

test('dark themes get the dark tint', async ($, on) => {
  const clock = session(on, {}, new Map(), 'dark')
  stubEngine(on)
  await loadSkills($, clock, ['alpha'])
  expect((await row($, 100)).boxes[0]!.props.backgroundColor).toBe('#1B2A4A')
})

test('a theme the mod cannot place falls back to coloured text with no background', async ($, on) => {
  const clock = session(on, {}, new Map(), 'auto')
  stubEngine(on)
  await loadSkills($, clock, ['alpha'])
  const { band, boxes } = await row($, 100)
  expect(boxes[0]!.props.backgroundColor).toBeUndefined()
  expect((await band.findAll({ type: 'Text' }))[0]!.props.color).toBe('suggestion')
})

test(
  'chip_style text forces coloured text even on a known theme',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    const clock = session(on, {}, new Map(), 'light')
    stubEngine(on)
    await loadSkills($, clock, ['alpha'])
    const { band, boxes } = await row($, 100)
    expect(boxes[0]!.props.backgroundColor).toBeUndefined()
    expect((await band.findAll({ type: 'Text' }))[0]!.props.color).toBe('suggestion')
  },
)

test(
  'the plugin toggle tags chips with the plugin that supplied them',
  { options: { show_plugins: true } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await $.skill.prompt({
      skill: 'docx',
      text: '',
      frontmatter: {},
      source: 'plugin',
      pluginName: 'anthropic-skills',
    } as never)
    await clock.advance(FRESH)
    expect((await row($, 100)).boxes[0]!.text).toBe('▤docxvia anthropic-skills')
  },
)

test('without the plugin toggle chips carry no plugin tag', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await $.skill.prompt({
    skill: 'docx',
    text: '',
    frontmatter: {},
    source: 'plugin',
    pluginName: 'anthropic-skills',
  } as never)
  await clock.advance(FRESH)
  expect((await row($, 100)).boxes[0]!.text).toBe('▤docx')
})

const withSkill = async ($: Engine, clock: MockClock) => {
  await $.skill.prompt({
    skill: 'docx',
    text: '',
    frontmatter: {},
    source: 'plugin',
    path: '/skills/docx/SKILL.md',
  } as never)
  await clock.advance(FRESH)
}

test('pressing a chip grows a detail card under the row; pressing it again closes it', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await withSkill($, clock)
  const band = await mountBand($)
  expect(await band.find({ key: 'card' })).toBeUndefined()
  await band.press({ key: 'chip-skill-docx' })
  const open = await mountBand($)
  expect(await open.find({ key: 'card' })).toBeDefined()
  const shown = await texts(open)
  expect(shown).toContain('SKILL · Loaded')
  expect(shown).toContain('docx')
  expect(shown).toContain('/skills/docx/SKILL.md')
  expect(shown).toEqual(expect.arrayContaining(['Status', 'Activations', 'Last', 'Active', '1']))
  expect((await open.find({ key: 'open' }))?.props.hotkey).toBe('o')
  expect((await open.find({ key: 'mute' }))?.props.hotkey).toBe('m')
  expect(await open.find({ key: 'chip-skill-docx' })).toBeDefined()
  await open.press({ key: 'chip-skill-docx' })
  expect(await (await mountBand($)).find({ key: 'card' })).toBeUndefined()
})

test('the selected chip label is underlined; the card has a close button', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await withSkill($, clock)
  await (await mountBand($)).press({ key: 'chip-skill-docx' })
  const open = await mountBand($)
  const label = (await open.findAll({ type: 'Text' })).find(
    t => t.text === 'docx' && t.props.underline,
  )
  expect(label).toBeDefined()
  await open.press({ key: 'close' })
  expect(await (await mountBand($)).find({ key: 'card' })).toBeUndefined()
})

test('the card copies the source path and mutes the chip', async ($, on) => {
  const clock = session(on)
  const { copied } = stubEngine(on)
  await withSkill($, clock)
  await (await mountBand($)).press({ key: 'chip-skill-docx' })
  const open = await mountBand($)
  await open.press({ key: 'open' })
  expect(copied).toEqual(['/skills/docx/SKILL.md'])
  await open.press({ key: 'mute' })
  const after = await mountBand($)
  expect(await after.find({ key: 'chip-skill-docx' })).toBeUndefined()
  expect(await after.find({ key: 'card' })).toBeUndefined()
})

test('when the band is too short for the card the chip opens the pane on its detail view', async ($, on) => {
  const clock = session(on)
  const { opens } = stubEngine(on)
  await withSkill($, clock)
  const band = await mountBand($, 'terminal', 100, 4)
  await band.press({ key: 'chip-skill-docx' })
  expect(opens).toEqual([expect.objectContaining({ id: 'session-activity', rows: 10 })])
  expect(await (await mountBand($, 'terminal', 100, 4)).find({ key: 'card' })).toBeUndefined()
})

test(
  'the +N more button opens the pane on the activity view',
  { options: { max_chips: 1 } },
  async ($, on) => {
    const clock = session(on)
    const { opens } = stubEngine(on)
    await loadSkills($, clock)
    await (await mountBand($)).press({ key: 'more' })
    expect(opens).toEqual([expect.objectContaining({ id: 'session-activity' })])
    expect(opens[0]!.rows).toBeUndefined()
  },
)
