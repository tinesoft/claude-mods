import { expect, test } from 'claude-code/testing'
import { paint, resolveTone, TOKENS, TRIPLES } from '../src/theme'

test('the tokens are the session-activity palette in both tones', () => {
  expect(TOKENS.light).toMatchObject({
    ink: '#17181C',
    surface: '#FFFFFF',
    danger: '#B42318',
    lineDashed: '#B9BCC4',
  })
  expect(TOKENS.dark).toMatchObject({
    ink: '#ECEDEF',
    surface: '#1B1D21',
    danger: '#F97066',
    lineDashed: '#5A5F69',
  })
  expect(TRIPLES.skill.light).toEqual({ fg: '#1F4FC1', bg: '#EDF2FD', bd: '#C9D7F7' })
  expect(TRIPLES.perm.dark).toEqual({ fg: '#7FD6C8', bg: '#123A35', bd: '#22594F' })
  expect(TRIPLES.hook.dark).toEqual({ fg: '#F5B47A', bg: '#3D2614', bd: '#643F20' })
})

test("the agent colour is session-activity's agent palette, in both tones", () => {
  expect(paint('agent', 'light')).toEqual({ fg: '#5B3A99', bg: '#F3EEFB', bd: '#D9CCF0' })
  expect(paint('agent', 'dark')).toEqual({ fg: '#C3A8F5', bg: '#2C2147', bd: '#463470' })
  expect(paint('agent', undefined)).toEqual({ fg: 'merged', bg: undefined, bd: undefined })
})

test('a role paints from its triple, and from theme keys when the tone is unknown', () => {
  expect(paint('hook', 'light')).toEqual({ fg: '#9A4A0B', bg: '#FDF1E6', bd: '#F0CFAE' })
  expect(paint('danger', 'dark')).toEqual({ fg: '#F97066', bg: '#1B1D21', bd: '#7A2E28' })
  expect(paint('hook', undefined)).toEqual({ fg: 'warning', bg: undefined, bd: undefined })
  expect(paint('danger', undefined).fg).toBe('error')
})

test('the tone follows the pref, then the Claude Code theme, then the terminal', () => {
  const base = {
    theme: 'auto',
    claudeTheme: 'dark',
    surface: 'terminal',
    colorFgBg: undefined,
    system: undefined,
  } as const
  expect(resolveTone({ ...base, theme: 'light' })).toBe('light')
  expect(resolveTone(base)).toBe('dark')
  expect(resolveTone({ ...base, claudeTheme: 'light-daltonized' })).toBe('light')
  expect(resolveTone({ ...base, claudeTheme: 'dark-ansi' })).toBeUndefined()
  expect(resolveTone({ ...base, claudeTheme: 'auto', colorFgBg: 'light' })).toBe('light')
  expect(resolveTone({ ...base, claudeTheme: 'auto' })).toBe('dark')
  expect(resolveTone({ ...base, surface: 'desktop', claudeTheme: 'auto' })).toBe('light')
  expect(resolveTone({ ...base, surface: 'desktop', claudeTheme: 'dark-ansi' })).toBe('light')
})

test('Desktop follows the system appearance whatever the pref, as its own band and buttons do', () => {
  const desktop = {
    theme: 'dark',
    claudeTheme: 'auto',
    surface: 'desktop',
    colorFgBg: undefined,
    system: 'light',
  } as const
  expect(resolveTone(desktop)).toBe('light')
  expect(resolveTone({ ...desktop, theme: 'light', system: 'dark' })).toBe('dark')
  expect(resolveTone({ ...desktop, surface: 'terminal' })).toBe('dark')
})

test('the OS appearance decides where the terminal and the app say nothing, as in session-activity', () => {
  const base = {
    theme: 'auto',
    claudeTheme: 'auto',
    surface: 'terminal',
    colorFgBg: undefined,
    system: 'light',
  } as const
  expect(resolveTone(base)).toBe('light')
  expect(resolveTone({ ...base, colorFgBg: 'dark' })).toBe('dark')
  expect(resolveTone({ ...base, system: 'dark', surface: 'desktop', claudeTheme: 'light' })).toBe(
    'dark',
  )
})
