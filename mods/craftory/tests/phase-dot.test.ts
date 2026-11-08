import { expect, test } from 'claude-code/testing'
import { dotOf, phaseDotSvg } from '../src/icons'
import { TOKENS, TRIPLES } from '../src/theme'

const TONES = ['light', 'dark'] as const

for (const tone of TONES) {
  const t = TOKENS[tone]
  const skill = TRIPLES.skill[tone]
  const perm = TRIPLES.perm[tone]
  const hook = TRIPLES.hook[tone]

  test(`${tone}: not started is a strong grey ring with the step number`, () => {
    expect(dotOf('todo', 6, tone)).toEqual({
      ring: t.lineStrong,
      fill: null,
      mark: { kind: 'number', n: 6, color: t.muted },
      dashed: false,
      strike: false,
      spinner: null,
    })
  })

  test(`${tone}: up next is a blue ring on a pale blue disc with the step number`, () => {
    expect(dotOf('next', 4, tone)).toEqual({
      ring: skill.fg,
      fill: skill.bg,
      mark: { kind: 'number', n: 4, color: skill.fg },
      dashed: false,
      strike: false,
      spinner: null,
    })
  })

  test(`${tone}: running is a blue fill with an on-ink number and a spinner ring`, () => {
    expect(dotOf('running', 4, tone)).toEqual({
      ring: null,
      fill: skill.fg,
      mark: { kind: 'number', n: 4, color: t.onInk },
      dashed: false,
      strike: false,
      spinner: { color: skill.fg, track: skill.bd },
    })
  })

  test(`${tone}: done is a teal ring on a pale teal disc with a check`, () => {
    expect(dotOf('done', 1, tone)).toEqual({
      ring: perm.fg,
      fill: perm.bg,
      mark: { kind: 'glyph', glyph: 'done', color: perm.fg },
      dashed: false,
      strike: false,
      spinner: null,
    })
  })

  test(`${tone}: needs you, gated, failed and over budget keep their glyph in the state colour`, () => {
    const cases = [
      ['needs-you', hook.fg],
      ['gated', t.text2],
      ['failed', t.danger],
      ['over-budget', t.danger],
    ] as const
    for (const [kind, color] of cases)
      expect(dotOf(kind, 5, tone)).toEqual({
        ring: color,
        fill: null,
        mark: { kind: 'glyph', glyph: kind, color },
        dashed: false,
        strike: false,
        spinner: null,
      })
  })

  test(`${tone}: skipped is a dashed muted ring with the number struck through`, () => {
    expect(dotOf('skipped', 3, tone)).toEqual({
      ring: t.muted,
      fill: null,
      mark: { kind: 'number', n: 3, color: t.muted },
      dashed: true,
      strike: true,
      spinner: null,
    })
  })
}

test('the dot draws the number as paths, never as svg text', () => {
  for (let n = 1; n <= 9; n++) {
    const svg = phaseDotSvg(dotOf('todo', n, 'light'))
    expect(svg).not.toContain('<text')
    expect(svg).toContain(`data-n="${n}"`)
  }
})

test('each step number draws a different mark', () => {
  const marks = [1, 2, 3, 4, 5, 6, 7].map(n => phaseDotSvg(dotOf('todo', n, 'light')))
  expect(new Set(marks).size).toBe(7)
})

test('the dot carries its colours, a dash for skipped and a turning arc for running', () => {
  const skipped = phaseDotSvg(dotOf('skipped', 3, 'dark'))
  expect(skipped).toContain('stroke-dasharray')
  expect(skipped).toContain(TOKENS.dark.muted)
  const running = (frame: number) => phaseDotSvg(dotOf('running', 4, 'light'), frame)
  expect(running(0)).toContain(`fill="${TRIPLES.skill.light.fg}"`)
  expect(running(0)).toContain(TRIPLES.skill.light.bd)
  expect(running(0)).not.toBe(running(1))
  expect(phaseDotSvg(dotOf('todo', 2, 'light'))).not.toContain('stroke-dasharray')
  expect(phaseDotSvg(dotOf('next', 2, 'light'))).toContain(`fill="${TRIPLES.skill.light.bg}"`)
})
