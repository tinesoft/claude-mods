import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { mountPane, session, stubEngine, SURFACES } from './harness'

const PAINT = {
  light: {
    skill: { fg: '#1F4FC1', bg: '#EDF2FD', bd: '#C9D7F7' },
    fill: '#F0F1F4',
    surface: '#FFFFFF',
    ink: '#17181C',
    text2: '#3B3F48',
    muted: '#5A5E68',
    lineSoft: '#ECEDF0',
    link: '#1F4FC1',
  },
  dark: {
    skill: { fg: '#8FB0FF', bg: '#1B2A4A', bd: '#2D4373' },
    fill: '#2A2C31',
    surface: '#1B1D21',
    ink: '#ECEDEF',
    text2: '#B4B8C1',
    muted: '#9499A3',
    lineSoft: '#2A2C31',
    link: '#8FB0FF',
  },
} as const

const activity = async ($: Engine) => {
  await $.skill.prompt({
    skill: 'docx',
    text: '',
    frontmatter: {},
    source: 'plugin',
    path: '/skills/docx/SKILL.md',
  } as never)
  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
}

const DENY = { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } } as const

for (const surface of SURFACES) {
  const rich = surface !== 'terminal'
  for (const tone of ['light', 'dark'] as const) {
    const t = PAINT[tone]

    test(`${tone} on ${surface}: the filter row is segmented on rich surfaces`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on, DENY)
      await activity($)
      const pane = await mountPane($, surface)
      const boxes = await pane.findAll({ type: 'Box' })
      const filterBoxes = boxes.filter(b => b.key?.startsWith('filterbox-'))
      expect(filterBoxes.map(b => b.key)).toEqual([
        'filterbox-all',
        'filterbox-skill',
        'filterbox-perm',
      ])
      if (rich) {
        expect(filterBoxes.map(b => b.props.backgroundColor)).toEqual([t.surface, t.fill, t.fill])
        const label = (await pane.findAll({ type: 'Text' })).find(x => x.text === 'All 2')
        expect(label?.props).toMatchObject({ bold: true, color: t.ink })
      } else {
        expect(filterBoxes.every(b => b.props.backgroundColor === undefined)).toBe(true)
      }
    })

    test(`${tone} on ${surface}: a row has its type mark, why line, tally and Mute button`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on, DENY)
      await activity($)
      const pane = await mountPane($, surface)
      const texts = await pane.findAll({ type: 'Text' })
      const why = texts.find(x => x.text === 'Claude loaded this skill from a plugin.')
      expect(why).toBeDefined()
      if (rich) expect(why!.props.color).toBe(t.text2)
      const tally = texts.find(x => /^×1 · /.test(x.text) && x.props.color !== undefined)
      if (rich) expect(tally?.props.color).toBe(t.text2)
      expect(await pane.find({ key: 'mute-skill-docx' })).toMatchObject({ text: 'Mute' })
      if (rich) {
        const tile = (await pane.findAll({ type: 'Box' })).find(
          b => b.props.borderStyle === 'round' && b.props.borderColor === t.skill.bd,
        )
        expect(tile?.props).toMatchObject({ backgroundColor: t.skill.bg })
        const icons = await pane.findAll({ type: 'Svg' })
        expect(
          icons.some(i => i.props.alt === 'Skill' && String(i.props.source).includes(t.skill.fg)),
        ).toBe(true)
      } else {
        const glyph = texts.find(x => x.text === ' ▤ ')
        expect(glyph?.props).toMatchObject({ color: t.skill.fg, backgroundColor: t.skill.bg })
      }
    })

    test(`${tone} on ${surface}: a denied row wears a white-on-red badge and no Mute button`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on, DENY)
      await activity($)
      const pane = await mountPane($, surface)
      const badge = (await pane.findAll({ type: 'Text' })).find(
        x => x.text === (rich ? ' Denied ' : ' DENIED '),
      )
      expect(badge?.props).toMatchObject({ color: '#FFFFFF', backgroundColor: '#B42318' })
      expect(
        (await pane.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('mute-perm')),
      ).toEqual([])
      expect((await pane.findAll({ type: 'Text' })).map(x => x.text)).toContain(
        'Stopped and errored chips always show.',
      )
    })

    test(`${tone} on ${surface}: Mute marks a row Muted in text-2 on line-soft, and Unmute undoes it`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on, DENY)
      await activity($)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'mute-skill-docx' })
      const muted = (await pane.findAll({ type: 'Text' })).find(x => x.text === ' Muted ')
      expect(muted?.props).toMatchObject({ color: t.text2, backgroundColor: t.lineSoft })
      expect(muted?.props.inverse).toBeUndefined()
      expect(await pane.find({ key: 'mute-skill-docx' })).toMatchObject({ text: 'Unmute' })
      await pane.press({ key: 'mute-skill-docx' })
      expect((await pane.findAll({ type: 'Text' })).some(x => x.text === ' Muted ')).toBe(false)
    })

    test(`${tone} on ${surface}: the header names the session and links to Customize`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on, DENY)
      await activity($)
      const pane = await mountPane($, surface)
      const texts = await pane.findAll({ type: 'Text' })
      expect(texts.find(x => x.text === 'Session activity')?.props.bold).toBe(true)
      const meta = texts.find(x => x.text.startsWith('2 items'))
      if (rich) expect(meta?.props.color).toBe(t.muted)
      const link = texts.find(x => x.text === 'Customize')
      if (rich) expect(link?.props.color).toBe(t.link)
      await pane.press({ key: 'customize' })
      expect(await pane.find({ key: 'reset' })).toBeDefined()
    })
  }
}

test(
  'untinted rows keep the inverse Muted badge and uppercase badges',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    session(on, {}, new Map(), 'dark', ['desktop'])
    stubEngine(on, DENY)
    await activity($)
    const pane = await mountPane($, 'desktop')
    await pane.press({ key: 'mute-skill-docx' })
    const texts = await pane.findAll({ type: 'Text' })
    expect(texts.find(x => x.text === ' Muted ')?.props).toMatchObject({ inverse: true })
    expect(texts.find(x => x.text === ' DENIED ')?.props).toMatchObject({ inverse: true })
  },
)
