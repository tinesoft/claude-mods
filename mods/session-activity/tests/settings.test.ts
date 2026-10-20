import { expect, test } from 'claude-code/testing'
import { mountBand, mountPane, session, stubEngine, SURFACES } from './harness'

const SWITCH = {
  light: { on: '#17181C', off: '#B9BCC4', muted: '#5A5E68', text2: '#3B3F48' },
  dark: { on: '#5B7FE0', off: '#4A4E57', muted: '#9499A3', text2: '#B4B8C1' },
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
          'Preview',
          'Chip row',
          'Collapsed summary',
          'Shown by default',
          'Optional',
          'Off by default · 0 of 7 on',
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
      if (rich) expect(optionalCount?.props.color).toBe(t.muted)
      if (rich) {
        const marks = (await pane.findAll({ type: 'Svg' })).filter(s => s.props.alt === 'Skill')
        expect(marks.length).toBeGreaterThan(0)
      }
    })

    test(`${tone} on ${surface}: the preview follows the layout and the master switch`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      const pane = await mountPane($, surface, 160)
      await pane.press({ key: 'tab-settings' })
      expect(
        (await pane.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('box-')).length,
      ).toBe(6)
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
