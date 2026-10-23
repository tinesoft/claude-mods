import { expect, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import {
  BAND_SURFACES,
  type BandSurface,
  FRESH,
  type Finder,
  hoversOf,
  mountBand,
  mountPane,
  session,
  stubEngine,
} from './harness'

const SKILLS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']

const loadSkills = async ($: Engine, clock: MockClock, skills = SKILLS) => {
  for (const skill of skills) {
    await clock.advance(1000)
    await $.skill.prompt({ skill, text: '', frontmatter: {}, source: 'projectSettings' } as never)
  }
  await clock.advance(FRESH)
}

const row = async ($: Engine, columns: number, surface: BandSurface = 'terminal') => {
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
    const chipCells = boxes.reduce((sum, b) => sum + b.text.length + 2, 0)
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

test('the first row is four cells shorter than the band, leaving room for +N more and the gear', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock, ['aa', 'bb'])
  expect((await row($, 17)).boxes).toHaveLength(2)
  expect((await row($, 16)).boxes).toHaveLength(1)
})

test('max_chips caps the row', { options: { max_chips: 2 } }, async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const { boxes, more } = await row($, 200)
  expect(boxes.map(b => b.text)).toEqual(['▤ hotel', '▤ golf'])
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
      ['1', '1: ▤ hotel'],
      ['2', '2: ▤ golf'],
    ])
    expect(buttons.find(b => b.key === 'more')?.props.hotkey).toBe('0')
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
  expect(boxes[0]!.text).toBe('↯ guard BLOCKED ')
})

test(
  'the summary layout is one tinted box with a count per type and a blocked tally',
  { options: { layout: 'summary' } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
    await loadSkills($, clock)
    await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
    const band = await mountBand($, 'terminal', 100)
    expect((await band.find({ key: 'summary-skill' }))?.text).toBe('▤8')
    expect((await band.find({ key: 'summary-perm' }))?.text).toBe('⚷1')
    expect((await band.find({ key: 'summary-stopped' }))?.text).toBe('● 1 blocked')
    expect(await texts(band)).not.toContain('9 active')
    const counts = (await band.findAll({ type: 'Text' })).filter(
      t => t.text === '▤8' || t.text === '⚷1',
    )
    expect(counts.map(t => t.props.color)).toEqual(['#8FB0FF', '#7FD6C8'])
    const blocked = (await band.findAll({ type: 'Text' })).find(t => t.text === '● 1 blocked')
    expect(blocked?.props).toMatchObject({ color: '#F97066', backgroundColor: '#1B1D21' })
    const boxes = await band.findAll({ type: 'Box' })
    expect(
      boxes.some(b => b.text === '▤8⚷1● 1 blocked' && b.props.backgroundColor === '#1B1D21'),
    ).toBe(true)
  },
)

for (const surface of ['desktop'] as const) {
  test(
    `on ${surface} the summary layout draws type icons in the type colour inside a round box`,
    { options: { layout: 'summary' } },
    async ($, on) => {
      const clock = session(on, {}, new Map(), 'light', [surface])
      stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
      await loadSkills($, clock, ['alpha', 'bravo'])
      await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
      const band = await mountBand($, surface, 100)
      expect((await band.find({ key: 'summary-skill' }))?.text).toBe('2')
      expect((await band.findAll({ type: 'Svg' })).map(i => i.props.alt)).toEqual([
        'Skill',
        'Permission',
      ])
      const box = (await band.findAll({ type: 'Box' })).find(b => b.props.borderStyle === 'round')
      expect(box?.props).toMatchObject({ borderColor: '#DADCE1', backgroundColor: '#FFFFFF' })
      expect((await band.find({ key: 'summary-stopped' }))?.text).toBe('● 1 blocked')
    },
  )
}

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
  expect((await row($, 100, 'terminal')).boxes[0]!.text).toBe('▤ hotel')
  expect((await row($, 100, 'desktop')).boxes[0]!.text).toBe('hotel')
})

test('Svg icons are drawn on every surface but the terminal', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock, ['alpha', 'bravo'])
  for (const surface of BAND_SURFACES) {
    const icons = await (await mountBand($, surface, 100)).findAll({ type: 'Svg' })
    expect(icons.length).toBe(surface === 'terminal' ? 0 : 2)
  }
  const [icon] = await (await mountBand($, 'desktop', 100)).findAll({ type: 'Svg' })
  expect(icon!.props).toMatchObject({ alt: 'Skill', width: 14, height: 14 })
  expect(icon!.props.source).toContain('#8FB0FF')
})

for (const columns of [60, 100, 200]) {
  test(`on desktop at ${columns} columns the bordered row still fits`, async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await loadSkills($, clock)
    const { boxes, more, hidden } = await row($, columns, 'desktop')
    expect(boxes.length + hidden).toBe(SKILLS.length)
    const chipCells = boxes.reduce((sum, b) => sum + b.text.length + 1 + 2 + 2, 0)
    const used = chipCells + (boxes.length - 1) + (more ? 1 + more.text.length + 4 : 0)
    expect(used).toBeLessThanOrEqual(columns - 2)
  })
}

test('on desktop the overflow count sits in a dashed box; elsewhere it stays plain', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock)
  const desktop = await mountBand($, 'desktop', 60)
  const dashed = (await desktop.findAll({ type: 'Box' })).filter(
    b => b.props.borderStyle === 'dashed',
  )
  expect(dashed).toHaveLength(1)
  expect(dashed[0]!.text).toMatch(/\+\d+ more/)
  expect(dashed[0]!.props).toMatchObject({ borderColor: '#5A5F69', paddingX: 'sm' })
  const terminal = await mountBand($, 'terminal', 60)
  expect((await terminal.findAll({ type: 'Box' })).some(b => b.props.borderStyle)).toBe(false)
})

test('a tinted chip on desktop is round, bordered and darkens on hover', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await loadSkills($, clock, ['alpha'])
  const { boxes } = await row($, 100, 'desktop')
  expect(boxes[0]!.props).toMatchObject({
    borderStyle: 'round',
    borderColor: expect.stringMatching(/^#[0-9A-F]{6}$/),
  })
  const hover = { backgroundColor: expect.stringMatching(/^#[0-9A-F]{6}$/) }
  expect(await hoversOf(await mountBand($, 'desktop'), 'box-')).toEqual([hover])
  expect((await row($, 100, 'terminal')).boxes[0]!.props.borderStyle).toBeUndefined()
  expect(await hoversOf(await mountBand($, 'terminal'), 'box-')).toEqual([undefined])
})

test(
  'text chips on desktop have no border, tint or hover',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await loadSkills($, clock, ['alpha'])
    const { boxes } = await row($, 100, 'desktop')
    expect(boxes[0]!.props.borderStyle).toBeUndefined()
    expect(boxes[0]!.props.backgroundColor).toBeUndefined()
    expect(await hoversOf(await mountBand($, 'desktop'), 'box-')).toEqual([undefined])
  },
)

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

const askBash = ($: Engine) =>
  $.tool.check({ tool: 'Bash', command: 'sleep 10', tool_use_id: 'asked' } as never)

test('a running chip of a hidden type never redraws the band', async ($, on) => {
  const clock = session(on)
  const engine = stubEngine(on, { verdict: { decision: 'ask' } })
  await askBash($)
  const before = engine.invalidations()
  await clock.advance(2000)
  expect((await row($, 160, 'desktop')).boxes).toEqual([])
  expect(engine.invalidations()).toBe(before)
})

test(
  'a running chip of a shown type spins',
  { options: { show_permissions: true } },
  async ($, on) => {
    const clock = session(on)
    const engine = stubEngine(on, { verdict: { decision: 'ask' } })
    await askBash($)
    const before = engine.invalidations()
    await clock.advance(2000)
    expect(engine.invalidations() - before).toBeGreaterThanOrEqual(10)
  },
)

const interrupt = async ($: Engine, clock: MockClock) => {
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
}

test(
  'an interrupted agent shows a red triangle and an ERROR badge on untinted chips',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await interrupt($, clock)
    const { band, boxes } = await row($, 100)
    expect(boxes.map(b => b.text)).toEqual(['▲ Explore ERROR '])
    const triangle = (await band.findAll({ type: 'Text' })).find(t => t.text === '▲ ')
    expect(triangle?.props.color).toBe('error')
  },
)

test('a tinted error chip is white with bold red text and a red border', async ($, on) => {
  const clock = session(on, {}, new Map(), 'light')
  stubEngine(on)
  await interrupt($, clock)
  const { band, boxes } = await row($, 100, 'desktop')
  expect(boxes[0]!.props).toMatchObject({
    backgroundColor: '#FFFFFF',
    borderColor: '#B42318',
    borderStyle: 'dashed',
  })
  const badge = (await band.findAll({ type: 'Text' })).find(t => t.text === 'Error')
  expect(badge?.props).toMatchObject({ bold: true, color: '#B42318' })
  expect(badge?.props.inverse).toBeUndefined()
})

test('a selected pill chip takes its type colour as border; others keep the soft border', async ($, on) => {
  const clock = session(on, {}, new Map(), 'light')
  stubEngine(on)
  await loadSkills($, clock, ['alpha', 'bravo'])
  const before = (await row($, 100, 'desktop')).boxes
  expect(before[0]!.props.borderColor).not.toBe('#1F4FC1')
  await (await mountBand($, 'desktop')).press({ key: 'chip-skill-bravo' })
  const after = (await row($, 100, 'desktop')).boxes
  const byKey = new Map(after.map(b => [b.key, b.props.borderColor]))
  expect(byKey.get('box-skill:bravo')).toBe('#1F4FC1')
  expect(byKey.get('box-skill:alpha')).toBe(
    before.find(b => b.key === 'box-skill:alpha')!.props.borderColor,
  )
})

test('a blocked pill chip has a soft red border unless it is selected', async ($, on) => {
  const clock = session(on, {}, new Map(), 'light')
  stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
  await clock.advance(FRESH)
  const { boxes } = await row($, 100, 'desktop')
  expect(boxes[0]!.props.borderColor).toBe('#E8A39C')
  const key = boxes[0]!.key!.slice(4)
  await (await mountBand($, 'desktop')).press({ key: `chip-${key.replace(':', '-')}` })
  const selected = (await row($, 100, 'desktop')).boxes[0]!
  expect(selected.props.borderColor).toBe('#0E6159')
})

test('the detail card has a neutral border when tinted and the type colour when not', async ($, on) => {
  const clock = session(on, {}, new Map(), 'light')
  stubEngine(on)
  await withSkill($, clock)
  await (await mountBand($)).press({ key: 'chip-skill-docx' })
  expect((await (await mountBand($)).find({ key: 'card' }))?.props.borderColor).toBe('#DADCE1')
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

test('an ansi theme falls back to coloured text with no background', async ($, on) => {
  const clock = session(on, {}, new Map(), 'dark-ansi')
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
    expect((await row($, 100)).boxes[0]!.text).toBe('▤ docxvia anthropic-skills')
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
  expect((await row($, 100)).boxes[0]!.text).toBe('▤ docx')
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

test('pressing a chip opens the detail card above the chip row; pressing it again closes it', async ($, on) => {
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
  expect(await open.find({ key: 'open' })).toMatchObject({
    text: 'o: Open source',
    props: { hotkey: 'o' },
  })
  expect(await open.find({ key: 'mute' })).toMatchObject({
    text: 'm: Mute for this session',
    props: { hotkey: 'm' },
  })
  expect(await open.find({ key: 'chip-skill-docx' })).toBeDefined()
  const keys = (await open.findAll({})).map(el => el.key)
  expect(keys.indexOf('card')).toBeGreaterThan(-1)
  expect(keys.indexOf('card')).toBeLessThan(keys.indexOf('chip-skill-docx'))
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

test('the band never gets Esc, so the card closes on x as well', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await withSkill($, clock)
  await (await mountBand($)).press({ key: 'chip-skill-docx' })
  const close = await (await mountBand($)).find({ key: 'close' })
  expect(close).toMatchObject({ text: 'x: Close', props: { hotkey: 'x' } })
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

test('the card of a chip that always shows offers no Mute', async ($, on) => {
  const clock = session(on)
  stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
  await clock.advance(FRESH)
  const first = await mountBand($, 'terminal', 120, 40)
  const [chip] = (await first.findAll({ type: 'Button' })).filter(b =>
    b.key?.startsWith('chip-perm'),
  )
  await first.press({ key: chip!.key! })
  const band = await mountBand($, 'terminal', 120, 40)
  expect(await band.find({ key: 'card' })).toBeDefined()
  expect(await band.find({ text: /Mute/ })).toBeUndefined()
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

test(
  'pressing +N more again closes the pane it opened',
  { options: { max_chips: 1 } },
  async ($, on) => {
    const clock = session(on)
    const { isOpen } = stubEngine(on)
    await loadSkills($, clock)
    await (await mountBand($)).press({ key: 'more' })
    expect(isOpen('session-activity')).toBe(true)
    await (await mountBand($)).press({ key: 'more' })
    expect(isOpen('session-activity')).toBe(false)
  },
)

test('on desktop the bordered chip row counts three rows, so the card gives way to the pane sooner', async ($, on) => {
  const clock = session(on)
  const { opens } = stubEngine(on)
  await withSkill($, clock)
  const probe = async (surface: BandSurface, maxRows: number) => {
    opens.length = 0
    await (await mountBand($, surface, 100, maxRows)).press({ key: 'chip-skill-docx' })
    return opens.length === 0 ? 'card' : 'pane'
  }
  let edge = 0
  while ((await probe('terminal', edge)) === 'pane') edge++
  expect(await probe('desktop', edge)).toBe('pane')
  expect(await probe('desktop', edge + 2)).toBe('card')
})

test(
  'the detail card keeps the type colour border on untinted chips',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await withSkill($, clock)
    await (await mountBand($)).press({ key: 'chip-skill-docx' })
    expect((await (await mountBand($)).find({ key: 'card' }))?.props.borderColor).toBe('suggestion')
  },
)

test('with digit hotkeys on, the terminal chip reads hotkey, glyph, label', async ($, on) => {
  const clock = session(on, {}, new Map([['overrides', { hotkeys: true }]]))
  stubEngine(on)
  await loadSkills($, clock, ['docx'])
  const band = await mountBand($)
  expect((await band.find({ key: 'box-skill:docx' }))?.text).toBe('1: ▤ docx')
})

for (const surface of BAND_SURFACES) {
  test(
    `${surface}: the summary chip has the board's spacing, 13 px icons and a divider before the tally`,
    { options: { layout: 'summary' } },
    async ($, on) => {
      const clock = session(on, {}, new Map(), 'dark', [surface])
      stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
      await loadSkills($, clock, ['docx'])
      await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
      const band = await mountBand($, surface, 100)
      const summary = (await band.findAll({ type: 'Box' })).find(
        b => b.props.flexDirection === 'row' && b.text.endsWith('● 1 blocked'),
      )
      expect(summary?.props).toMatchObject({ columnGap: 'sm', paddingX: 'md' })
      const shown = (await band.findAll({ type: 'Text' })).map(t => t.text)
      if (surface === 'desktop') {
        expect(shown.slice(-3)).toEqual(['│', '● 1 blocked', '\u2699'])
        const divider = (await band.findAll({ type: 'Text' })).find(t => t.text === '│')
        expect(divider?.props.color).toBe('#34373E')
        const icons = await band.findAll({ type: 'Svg' })
        expect(icons.map(i => [i.props.width, i.props.height])).toEqual([
          [13, 13],
          [13, 13],
        ])
      } else {
        expect(shown).not.toContain('│')
      }
    },
  )
}

test('the band has a settings gear that opens the pane on the settings view and closes it again', async ($, on) => {
  const clock = session(on)
  const { opens, isOpen } = stubEngine(on)
  await loadSkills($, clock)
  const band = await mountBand($)
  expect((await band.find({ key: 'settings-gear' }))?.text).toBe('\u2699')
  await band.press({ key: 'settings-gear' })
  expect(opens).toEqual([expect.objectContaining({ id: 'session-activity' })])
  expect((await (await mountPane($)).findAll({ type: 'Button' })).map(b => b.key)).toContain(
    'reset',
  )
  await (await mountBand($)).press({ key: 'settings-gear' })
  expect(isOpen('session-activity')).toBe(false)
})

test(
  'the gear switches an open activity pane to settings instead of closing it',
  { options: { max_chips: 1 } },
  async ($, on) => {
    const clock = session(on)
    const { isOpen } = stubEngine(on)
    await loadSkills($, clock)
    await (await mountBand($)).press({ key: 'more' })
    await (await mountBand($)).press({ key: 'settings-gear' })
    expect(isOpen('session-activity')).toBe(true)
    expect((await (await mountPane($)).findAll({ type: 'Button' })).map(b => b.key)).toContain(
      'reset',
    )
  },
)
