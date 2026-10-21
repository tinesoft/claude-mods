import { expect, test } from 'claude-code/testing'
import { BAND_SURFACES, FRESH, mountBand, session, stubEngine } from './harness'

const PAINT = {
  light: {
    line: '#DADCE1',
    surface: '#FFFFFF',
    tile: '#F5F6F8',
    muted: '#5A5E68',

    danger: '#B42318',
    fg: '#1F4FC1',
    permFg: '#0E6159',
  },
  dark: {
    line: '#34373E',
    surface: '#1B1D21',
    tile: '#26282D',
    muted: '#9499A3',

    danger: '#F97066',
    fg: '#8FB0FF',
    permFg: '#7FD6C8',
  },
} as const

for (const surface of BAND_SURFACES) {
  const rich = surface !== 'terminal'
  for (const tone of ['light', 'dark'] as const) {
    const t = PAINT[tone]
    test(`${tone} on ${surface}: the detail card uses the line border, tiles and muted titles`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      await $.skill.prompt({
        skill: 'docx',
        text: '',
        frontmatter: {},
        source: 'plugin',
        path: '/skills/docx/SKILL.md',
      } as never)
      await clock.advance(FRESH)
      await (await mountBand($, surface, 120, 40)).press({ key: 'chip-skill-docx' })
      const band = await mountBand($, surface, 120, 40)
      const card = await band.find({ key: 'card' })
      expect(card?.props).toMatchObject({ borderStyle: 'round', borderColor: t.line })
      if (rich) expect(card?.props.backgroundColor).toBe(t.surface)
      else expect(card?.props.backgroundColor).toBeUndefined()
      const texts = await band.findAll({ type: 'Text' })
      const by = (text: string) => texts.find(x => x.text === text)
      expect(by('SKILL · Loaded')?.props.color).toBe(t.fg)
      expect(by('docx')?.props.bold).toBe(true)
      expect(by('Status')?.props).toMatchObject({ color: t.muted, backgroundColor: t.tile })
      expect(by('Active')?.props.color).not.toBe(t.danger)
      if (rich) {
        expect(by('/skills/docx/SKILL.md')?.props.color).toBe(t.muted)
        expect((await band.findAll({ type: 'Svg' })).some(i => i.props.alt === 'Skill')).toBe(true)
      }
      expect(await band.find({ key: 'open' })).toMatchObject({ text: 'o: Open source' })
      expect(await band.find({ key: 'mute' })).toMatchObject({ text: 'm: Mute for this session' })
      expect(await band.find({ key: 'close' })).toBeDefined()
    })

    test(`${tone} on ${surface}: a blocked call shows its status in the danger colour`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
      await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
      await clock.advance(FRESH)
      const first = await mountBand($, surface, 120, 40)
      const [chip] = (await first.findAll({ type: 'Button' })).filter(b =>
        b.key?.startsWith('chip-perm'),
      )
      await first.press({ key: chip!.key! })
      const texts = await (await mountBand($, surface, 120, 40)).findAll({ type: 'Text' })
      const status = texts.find(x => x.text === 'Denied')
      expect(status?.props).toMatchObject({ bold: true, color: t.danger, backgroundColor: t.tile })
    })
  }
}
