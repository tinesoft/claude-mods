import { expect, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import {
  BAND_SURFACES,
  FRESH,
  type Finder,
  mountBand,
  mountPane,
  session,
  stubEngine,
  SURFACES,
} from './harness'

const TONES = {
  light: {
    skill: { fg: '#1F4FC1', bg: '#EDF2FD', bd: '#C9D7F7' },
    count: '#DEE3ED',
    surface: '#FFFFFF',
    line: '#DADCE1',
    dashed: '#B9BCC4',
    text2: '#3B3F48',
    danger: '#B42318',
    dangerBd: '#E8A39C',
  },
  dark: {
    skill: { fg: '#8FB0FF', bg: '#1B2A4A', bd: '#2D4373' },
    count: '#323F5C',
    surface: '#1B1D21',
    line: '#34373E',
    dashed: '#5A5F69',
    text2: '#B4B8C1',
    danger: '#F97066',
    dangerBd: '#7A2E28',
  },
} as const

const skill = ($: Engine, name = 'docx') =>
  $.skill.prompt({ skill: name, text: '', frontmatter: {}, source: 'plugin' } as never)

const agentInterrupted = async ($: Engine, clock: MockClock) => {
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

const chipBox = async (band: Finder, key: string) =>
  (await band.findAll({ type: 'Box' })).find(b => b.key === `box-${key}`)!

const textOf = async (band: Finder, text: string) =>
  (await band.findAll({ type: 'Text' })).find(t => t.text === text)

for (const surface of BAND_SURFACES) {
  const rich = surface !== 'terminal'
  for (const tone of ['light', 'dark'] as const) {
    const t = TONES[tone]

    test(`${tone} on ${surface}: a chip takes the kind paint, and a count its wash`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      await skill($)
      await skill($)
      await clock.advance(FRESH)
      const band = await mountBand($, surface, 120)
      const box = await chipBox(band, 'skill:docx')
      expect(box.props.backgroundColor).toBe(t.skill.bg)
      if (rich) expect(box.props).toMatchObject({ borderStyle: 'round', borderColor: t.skill.bd })
      else expect(box.props.borderStyle).toBeUndefined()
      expect((await textOf(band, 'docx'))?.props.color).toBe(t.skill.fg)
      expect((await textOf(band, ' ×2 '))?.props).toMatchObject({
        color: t.skill.fg,
        backgroundColor: t.count,
      })
    })

    test(`${tone} on ${surface}: a chip that just activated takes the board's fresh look`, async ($, on) => {
      session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      await skill($)
      const band = await mountBand($, surface, 120)
      const box = await chipBox(band, 'skill:docx')
      const label = (await band.findAll({ type: 'Text' })).find(x => x.text.endsWith('docx'))
      const icons = (await band.findAll({ type: 'Svg' })).map(i => i.props)
      if (rich) {
        expect(box.props.borderColor).toBe(t.skill.fg)
        expect(label).toMatchObject({ text: 'docx', props: { bold: false } })
        expect(icons).toEqual([
          expect.objectContaining({
            width: 7,
            height: 7,
            source: expect.stringContaining(`fill="${t.skill.fg}"`),
          }),
        ])
      } else {
        expect(label).toMatchObject({ text: '● docx', props: { bold: true } })
      }
    })

    test(`${tone} on ${surface}: blocked and denied show a white-on-red badge`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
      await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
      await clock.advance(FRESH)
      const band = await mountBand($, surface, 120)
      const badge = await textOf(band, rich ? ' Denied ' : ' DENIED ')
      expect(badge?.props).toMatchObject({ color: '#FFFFFF', backgroundColor: '#B42318' })
      const [key] = [
        (await band.findAll({ type: 'Box' })).find(b => b.key?.startsWith('box-perm'))!.key!,
      ]
      const box = await chipBox(band, key.slice(4))
      if (rich) expect(box.props.borderColor).toBe(t.dangerBd)
      const slash = (await band.findAll({ type: 'Svg' })).filter(s =>
        String(s.props.source).includes('M3.8 12.2l8.4-8.4'),
      )
      expect(slash).toHaveLength(rich ? 1 : 0)
      if (rich) expect(String(slash[0]!.props.source)).toContain('stroke="#FFFFFF"')
    })

    test(`${tone} on ${surface}: an error is plain bold red on the surface colour`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      await agentInterrupted($, clock)
      const band = await mountBand($, surface, 120)
      const box = await chipBox(band, 'agent:Explore')
      expect(box.props.backgroundColor).toBe(t.surface)
      if (rich) expect(box.props).toMatchObject({ borderStyle: 'dashed', borderColor: t.danger })
      else expect(box.props.borderStyle).toBeUndefined()
      const badge = await textOf(band, 'Error')
      expect(badge?.props).toMatchObject({
        bold: true,
        color: t.danger,
        backgroundColor: t.surface,
      })
      expect(badge?.props.inverse).toBeUndefined()
      if (rich) {
        const [icon] = (await band.findAll({ type: 'Svg' })).filter(i => i.props.alt === 'Agent')
        expect(icon!.props.source).toContain(t.danger)
        expect(icon!.props.source).toContain('M8 2L14.5 13.5h-13z')
      }
    })

    test(`${tone} on ${surface}: the selected chip draws its border in the kind colour`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      await skill($)
      await clock.advance(FRESH)
      await (await mountBand($, surface, 120, 40)).press({ key: 'chip-skill-docx' })
      const box = await chipBox(await mountBand($, surface, 120, 40), 'skill:docx')
      if (rich) expect(box.props.borderColor).toBe(t.skill.fg)
      else expect(box.props.borderColor).toBeUndefined()
    })

    test(`${tone} on ${surface}: +N more is text-2, dashed on rich surfaces`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) await skill($, name)
      await clock.advance(FRESH)
      const band = await mountBand($, surface, 60)
      const more = (await band.findAll({ type: 'Text' })).find(x => /^\+\d+ more$/.test(x.text))
      expect(more).toBeDefined()
      if (rich) expect(more!.props.color).toBe(t.text2)
      const dashed = (await band.findAll({ type: 'Box' })).filter(
        b => b.props.borderStyle === 'dashed',
      )
      if (rich) expect(dashed.map(b => b.props.borderColor)).toEqual([t.dashed])
      else expect(dashed).toEqual([])
    })
  }
}

test('the mobile pane header leads with an N active chip; the other surfaces have none', async ($, on) => {
  const clock = session(on, {}, new Map(), 'light', ['mobile'])
  stubEngine(on)
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) await skill($, name)
  await clock.advance(FRESH)
  const pane = await mountPane($, 'mobile', 40)
  expect((await pane.find({ key: 'lead' }))?.text).toBe('10 active')
  expect(await textOf(pane, ' ●')).toBeUndefined()
  expect(await pane.find({ text: /^\+\d+ more$/ })).toBeUndefined()
  for (const surface of SURFACES.filter(s => s !== 'mobile')) {
    expect(await (await mountPane($, surface)).find({ key: 'lead' })).toBeUndefined()
  }
})

test('the mobile pane lead chip carries a red dot when something is blocked', async ($, on) => {
  const clock = session(on, {}, new Map(), 'dark', ['mobile'])
  stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
  await skill($)
  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
  await clock.advance(FRESH)
  const pane = await mountPane($, 'mobile')
  expect((await pane.find({ key: 'lead' }))?.text).toBe('2 active ●')
  expect((await textOf(pane, ' ●'))?.props.color).toBe('#F97066')
})

test(
  'untinted chips keep the theme-key look on every surface',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    const clock = session(on, {}, new Map(), 'dark', ['desktop'])
    stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
    await skill($)
    await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 't' } as never)
    await clock.advance(FRESH)
    const band = await mountBand($, 'desktop', 120)
    expect((await textOf(band, 'docx'))?.props.color).toBe('suggestion')
    expect((await textOf(band, ' DENIED '))?.props).toMatchObject({ inverse: true, color: 'error' })
    const boxes = (await band.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('box-'))
    expect(boxes.map(b => b.props.borderStyle)).toEqual([undefined, undefined])
  },
)

test(
  'untinted skill and permission chips take theme keys of different hues, blue and cyan',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on, { verdict: { decision: 'allow', rule: 'Bash(git push:*)' } })
    await skill($)
    await $.tool.check({ tool: 'Bash', input: { command: 'git push' }, tool_use_id: 't' } as never)
    await clock.advance(FRESH)
    const band = await mountBand($)
    const colorOf = async (key: string) =>
      (await band.findAll({ type: 'Text' })).find(t => t.text.endsWith(key))?.props.color
    expect(await colorOf('docx')).toBe('suggestion')
    expect(await colorOf('git push')).toBe('planMode')
  },
)
