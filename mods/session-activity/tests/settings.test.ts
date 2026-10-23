import { expect, test } from 'claude-code/testing'
import { across } from '../src/theme'
import { mountBand, mountPane, session, stubEngine, SURFACES } from './harness'

const SWITCH = {
  light: {
    on: '#17181C',
    off: '#B9BCC4',
    muted: '#5A5E68',
    text2: '#3B3F48',
    line: '#DADCE1',
    surface: '#FFFFFF',
  },
  dark: {
    on: '#5B7FE0',
    off: '#4A4E57',
    muted: '#9499A3',
    text2: '#B4B8C1',
    line: '#34373E',
    surface: '#1B1D21',
  },
} as const

for (const surface of SURFACES) {
  const rich = surface !== 'terminal'
  for (const tone of ['light', 'dark'] as const) {
    const t = SWITCH[tone]

    test(`${tone} on ${surface}: switches use the neutral switch tokens, not the type colour`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'tab-settings' })
      const switches = (await pane.findAll({ type: 'Svg' })).filter(s =>
        /^(On|Off)$/.test(String(s.props.alt)),
      )
      if (!rich) {
        expect(switches).toEqual([])
        expect((await pane.find({ key: 'toggle-skill' }))?.text).toBe('●')
        expect((await pane.find({ key: 'toggle-memory' }))?.text).toBe('○')
        return
      }
      const on_ = switches.filter(s => s.props.alt === 'On')
      const off = switches.filter(s => s.props.alt === 'Off')
      expect(on_.length).toBeGreaterThan(6)
      expect(off.length).toBeGreaterThan(6)
      for (const s of on_) expect(String(s.props.source)).toContain(`fill="${t.on}"`)
      for (const s of off) expect(String(s.props.source)).toContain(`fill="${t.off}"`)
      expect((await pane.find({ key: 'toggle-skill' }))?.text).toBe('On')
    })

    test(`${tone} on ${surface}: the page has the board's title, intro, sections and preview`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'tab-settings' })
      const shown = (await pane.findAll({ type: 'Text' })).map(x => x.text)
      expect(shown).toEqual(
        expect.arrayContaining([
          'Session activity chips',
          'Choose what shows above the prompt bar when it activates during a session. Optional types stay off until you turn them on.',
          'Show chips above the prompt bar',
          'PREVIEW',
          'Chip row',
          'Collapsed summary',
          'SHOWN BY DEFAULT',
          'OPTIONAL',
          'Off by default · 0 of 8 on',
          'Chip theme',
          'Chip style',
          'Digit hotkeys on chips',
          'Toast when blocked or denied',
          'Text summary after each answer',
        ]),
      )
      const desc = (await pane.findAll({ type: 'Text' })).find(x =>
        x.text.startsWith('Choose what'),
      )
      if (rich) expect(desc?.props.color).toBe(t.text2)
      const optionalCount = (await pane.findAll({ type: 'Text' })).find(x =>
        x.text.startsWith('Off by default'),
      )
      if (rich) expect(optionalCount?.props.color).toBe(t.text2)
      if (rich) {
        const marks = (await pane.findAll({ type: 'Svg' })).filter(s => s.props.alt === 'Skill')
        expect(marks.length).toBeGreaterThan(0)
      }
    })

    test(`${tone} on ${surface}: section headers are quiet uppercase eyebrows on the board's gaps`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'tab-settings' })
      const texts = await pane.findAll({ type: 'Text' })
      for (const title of ['PREVIEW', 'SHOWN BY DEFAULT', 'OPTIONAL']) {
        const header = texts.find(x => x.text === title)
        expect(header?.props.mono).toBe(true)
        expect(header?.props.bold).toBeFalsy()
        if (rich) expect(header?.props.color).toBe(t.muted)
        else expect(header?.props.dimColor).toBe(true)
      }
      const step = (s: 'sm' | 'md') => (surface === 'vscode' ? across(s) : s)
      const rows = (await pane.findAll({ type: 'Box' })).filter(
        b => b.props.flexDirection === 'row',
      )
      expect(rows.find(b => b.text.startsWith('PREVIEW'))?.props.columnGap).toBe(step('md'))
      expect(rows.find(b => b.text.startsWith('OPTIONAL'))?.props.columnGap).toBe(step('sm'))
    })

    test(`${tone} on ${surface}: the summary preview shows a blocked tally, the row preview no badge`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      const pane = await mountPane($, surface, 160)
      await pane.press({ key: 'tab-settings' })
      const shown = async () => (await pane.findAll({ type: 'Text' })).map(x => x.text)
      expect((await shown()).some(x => /^\s*(BLOCKED|Blocked)\s*$/.test(x))).toBe(false)
      await pane.press({ key: 'layout-summary' })
      expect((await pane.find({ key: 'summary-stopped' }))?.text).toBe('● 1 blocked')
    })

    test(`${tone} on ${surface}: the preview ends with a muted prompt bar stand-in`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      const pane = await mountPane($, surface, 160)
      await pane.press({ key: 'tab-settings' })
      for (const press of [undefined, 'layout-summary', 'toggle-enabled']) {
        if (press !== undefined) await pane.press({ key: press })
        const bar = await pane.find({ key: 'prompt-standin' })
        expect(bar?.text).toBe('Reply to Claude…')
        const text = (await pane.findAll({ type: 'Text' })).find(x => x.text === 'Reply to Claude…')
        if (rich) {
          expect(bar?.props).toMatchObject({ borderStyle: 'round', borderColor: t.line })
          expect(text?.props.color).toBe(t.muted)
        } else {
          expect(text?.props.dimColor).toBe(true)
        }
      }
    })

    test(`${tone} on ${surface}: the master switch, the preview and each type list sit on cards`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      const pane = await mountPane($, surface, 160)
      await pane.press({ key: 'tab-settings' })
      const cards = ['card-master', 'card-preview', 'card-shown', 'card-optional']
      for (const key of cards) {
        const card = await pane.find({ key })
        expect(card).toBeDefined()
        if (rich) {
          expect(card?.props).toMatchObject({
            borderStyle: 'round',
            borderColor: t.line,
            backgroundColor: t.surface,
          })
        } else {
          expect([card?.props.borderStyle, card?.props.backgroundColor]).toEqual([
            undefined,
            undefined,
          ])
        }
      }
      expect((await pane.find({ key: 'card-master' }))?.text).toContain(
        'Show chips above the prompt bar',
      )
      expect((await pane.find({ key: 'card-preview' }))?.text).toContain('Reply to Claude…')
      expect((await pane.find({ key: 'card-shown' }))?.text).toContain('Skills')
      expect((await pane.find({ key: 'card-optional' }))?.text).toContain('Slash commands')
    })

    test(`${tone} on ${surface}: the preview follows the layout and the master switch`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      const pane = await mountPane($, surface, 160)
      await pane.press({ key: 'tab-settings' })
      expect(
        (await pane.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('box-')).length,
      ).toBe(5)
      await pane.press({ key: 'layout-summary' })
      expect((await pane.findAll({ type: 'Button' })).some(b => b.key === 'summary-skill')).toBe(
        true,
      )
      await pane.press({ key: 'toggle-enabled' })
      expect((await pane.findAll({ type: 'Text' })).map(x => x.text)).toContain(
        'Chips are hidden. Activity is still listed in the session tray.',
      )
    })
  }
}

test('the Chip theme row saves an override that recolours the band', async ($, on) => {
  const store = new Map<string, unknown>()
  const clock = session(on, {}, store, 'light')
  stubEngine(on)
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  await clock.advance(5000)
  const bg = async () =>
    (await (await mountBand($)).findAll({ type: 'Box' })).find(b => b.key === 'box-skill:docx')
      ?.props.backgroundColor
  expect(await bg()).toBe('#EDF2FD')
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'theme-dark' })
  expect(store.get('overrides')).toEqual({ chipTheme: 'dark' })
  expect(await bg()).toBe('#1B2A4A')
  await pane.press({ key: 'theme-auto' })
  expect(await bg()).toBe('#EDF2FD')
})

test(
  'chip_theme from the plugin options is the default for the Chip theme row',
  { options: { chip_theme: 'dark' } },
  async ($, on) => {
    session(on, {}, new Map(), 'light')
    stubEngine(on)
    const pane = await mountPane($)
    await pane.press({ key: 'tab-settings' })
    const label = (text: string) =>
      pane.findAll({ type: 'Text' }).then(all => all.find(x => x.text === text))
    expect((await label('Dark'))?.props.bold).toBe(true)
    expect((await label('Auto'))?.props.bold).toBe(false)
  },
)

test('two presses of a toggle before a redraw flip it twice, back where it was', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, {}, store)
  stubEngine(on)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await Promise.all([pane.press({ key: 'toggle-memory' }), pane.press({ key: 'toggle-memory' })])
  await Promise.all([pane.press({ key: 'toggle-hotkeys' }), pane.press({ key: 'toggle-hotkeys' })])
  expect((await pane.find({ key: 'toggle-memory' }))?.text).toBe('○')
  expect((await pane.find({ key: 'toggle-hotkeys' }))?.text).toBe('○')
})

for (const tone of ['light', 'dark'] as const) {
  test(
    `${tone}: untinted chips keep the switch tokens on desktop switches`,
    { options: { chip_style: 'text' } },
    async ($, on) => {
      session(on, {}, new Map(), tone, ['desktop'])
      stubEngine(on)
      const pane = await mountPane($, 'desktop')
      await pane.press({ key: 'tab-settings' })
      const switches = (await pane.findAll({ type: 'Svg' })).filter(s =>
        /^(On|Off)$/.test(String(s.props.alt)),
      )
      const fill = (alt: string) =>
        switches.find(s => s.props.alt === alt)?.props.source as string | undefined
      expect(fill('On')).toContain(`fill="${SWITCH[tone].on}"`)
      expect(fill('Off')).toContain(`fill="${SWITCH[tone].off}"`)
    },
  )
}

test('the Model switches setting and its preview speak of the model only, never the output style', async ($, on) => {
  session(on, {}, new Map(), 'dark', ['terminal'])
  stubEngine(on)
  const pane = await mountPane($, 'terminal', 400)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-model' })
  expect(
    await pane.find({ text: 'A quiet chip when the model changes mid-session.' }),
  ).toBeDefined()
  expect(await pane.find({ text: /Style: |style or model/ })).toBeUndefined()
  expect(await pane.find({ text: /Model: / })).toBeDefined()
})
