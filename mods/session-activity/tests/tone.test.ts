import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { type BandSurface, mountBand, probes, session, stubEngine } from './harness'

const LIGHT_SKILL = '#EDF2FD'
const DARK_SKILL = '#1B2A4A'

const skillBg = async ($: Engine, surface: BandSurface = 'terminal') => {
  const band = await mountBand($, surface)
  const box = (await band.findAll({ type: 'Box' })).find(b => b.key === 'box-skill:docx')
  return box?.props.backgroundColor
}

const load = async ($: Engine) =>
  $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)

test('with the Claude theme on auto the terminal follows COLORFGBG', async ($, on) => {
  const clock = session(on, {}, new Map(), 'auto')
  stubEngine(on)
  probes(on, { colorFgBg: '0;15', system: { gsettings: { exitCode: 0, stdout: "'prefer-dark'" } } })
  await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  await clock.advance(0)
  await load($)
  expect(await skillBg($)).toBe(LIGHT_SKILL)
})

test('with no COLORFGBG the terminal follows the system appearance', async ($, on) => {
  const clock = session(on, {}, new Map(), 'auto')
  stubEngine(on)
  probes(on, { system: { defaults: { exitCode: 1, stdout: '' } } })
  await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  await clock.advance(0)
  await load($)
  expect(await skillBg($)).toBe(LIGHT_SKILL)
})

test('with nothing to go on the terminal is dark', async ($, on) => {
  const clock = session(on, {}, new Map(), 'auto')
  stubEngine(on)
  probes(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  await clock.advance(0)
  await load($)
  expect(await skillBg($)).toBe(DARK_SKILL)
})

test('a light or dark Claude theme beats COLORFGBG and the system on the terminal', async ($, on) => {
  const clock = session(on, {}, new Map(), 'light')
  stubEngine(on)
  probes(on, { colorFgBg: '15;0', system: { defaults: { exitCode: 0, stdout: 'Dark' } } })
  await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  await clock.advance(0)
  await load($)
  expect(await skillBg($)).toBe(LIGHT_SKILL)
})

for (const surface of ['desktop'] as const) {
  test(`on ${surface} the system appearance beats the Claude theme`, async ($, on) => {
    const clock = session(on, {}, new Map(), 'light', [surface])
    stubEngine(on)
    probes(on, { system: { defaults: { exitCode: 0, stdout: 'Dark' } } })
    await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
    await clock.advance(0)
    await load($)
    expect(await skillBg($, surface)).toBe(DARK_SKILL)
  })
}

test(
  'chip_theme overrides every other source',
  { options: { chip_theme: 'dark' } },
  async ($, on) => {
    const clock = session(on, {}, new Map(), 'light')
    stubEngine(on)
    probes(on, { colorFgBg: '0;15' })
    await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
    await clock.advance(0)
    await load($)
    expect(await skillBg($)).toBe(DARK_SKILL)
  },
)

test('the appearance is read again every minute and redraws on change', async ($, on) => {
  const clock = session(on, {}, new Map(), 'auto')
  stubEngine(on)
  const answers = probes(on, { system: { defaults: { exitCode: 0, stdout: 'Dark' } } })
  await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  await clock.advance(0)
  await load($)
  expect(await skillBg($)).toBe(DARK_SKILL)
  answers.system = { defaults: { exitCode: 1, stdout: '' } }
  await clock.advance(60_000)
  expect(await skillBg($)).toBe(LIGHT_SKILL)
})
