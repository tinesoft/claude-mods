import { expect, test } from 'claude-code/testing'
import type { RenderSurface } from 'claude-code'
import { TOGGLE_ORDER, TOGGLES, TOKENS, resolveTone, type ToneInput } from '../src/theme'

const base: ToneInput = {
  chipStyle: 'tinted',
  chipTheme: 'auto',
  claudeTheme: 'auto',
  surface: 'terminal',
  colorFgBg: undefined,
  system: undefined,
}

const TABLE: [string, Partial<ToneInput>, 'light' | 'dark' | undefined][] = [
  ['text style is untinted', { chipStyle: 'text', claudeTheme: 'light' }, undefined],
  ['chip_theme light wins', { chipTheme: 'light', claudeTheme: 'dark', system: 'dark' }, 'light'],
  [
    'chip_theme dark wins on an ansi theme',
    { chipTheme: 'dark', claudeTheme: 'light-ansi' },
    'dark',
  ],
  ['terminal follows a light theme', { claudeTheme: 'light', system: 'dark' }, 'light'],
  ['terminal follows a daltonized dark theme', { claudeTheme: 'dark-daltonized' }, 'dark'],
  [
    'terminal ansi themes stay untinted',
    { claudeTheme: 'dark-ansi', colorFgBg: 'dark' },
    undefined,
  ],
  ['terminal auto reads COLORFGBG first', { colorFgBg: 'light', system: 'dark' }, 'light'],
  ['terminal auto then the system', { system: 'light' }, 'light'],
  ['terminal auto with no hint is dark', {}, 'dark'],
  [
    'desktop follows the system first',
    { surface: 'desktop', claudeTheme: 'dark', system: 'light' },
    'light',
  ],
  ['vscode then the Claude theme', { surface: 'vscode', claudeTheme: 'dark' }, 'dark'],
  ['mobile ignores COLORFGBG', { surface: 'mobile', colorFgBg: 'dark' }, 'light'],
  [
    'mobile with an ansi theme and no hint is light',
    { surface: 'mobile', claudeTheme: 'dark-ansi' },
    'light',
  ],
]

for (const [name, patch, tone] of TABLE) {
  test(`tone: ${name}`, () => {
    expect(resolveTone({ ...base, ...patch })).toBe(tone)
  })
}

test('every surface resolves a tone when tinted and nothing else is known', () => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as RenderSurface[]) {
    expect(resolveTone({ ...base, surface })).toBeDefined()
  }
})

test('the tokens carry the design values in both tones', () => {
  expect(TOKENS.light).toMatchObject({ surface: '#FFFFFF', danger: '#B42318', switchOn: '#17181C' })
  expect(TOKENS.dark).toMatchObject({ surface: '#1B1D21', danger: '#F97066', switchOn: '#5B7FE0' })
  expect(TOKENS.light.countBg).toEqual({ base: '#17181C', alpha: 0.07 })
  expect(TOKENS.dark.countBg).toEqual({ base: '#FFFFFF', alpha: 0.1 })
})

test('each kind paints from the design tokens; rules and optional types but permissions use the neutral ones', () => {
  expect(TOGGLES.skill.palette.light).toEqual({ fg: '#1F4FC1', bg: '#EDF2FD', bd: '#C9D7F7' })
  expect(TOGGLES.hook.palette.dark).toEqual({ fg: '#F5B47A', bg: '#3D2614', bd: '#643F20' })
  for (const tone of ['light', 'dark'] as const) {
    const t = TOKENS[tone]
    expect(TOGGLES.rule.palette[tone]).toEqual({ fg: t.ink2, bg: t.surface, bd: t.lineStrong })
    for (const toggle of TOGGLE_ORDER.filter(x => TOGGLES[x].optional && x !== 'perm')) {
      expect(TOGGLES[toggle].palette[tone]).toEqual({ fg: t.ink2, bg: t.fill, bd: t.line })
    }
  }
})
