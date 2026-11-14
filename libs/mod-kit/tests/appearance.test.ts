import { expect, test } from 'claude-code/testing'
import { parseColorFgBg, SYSTEM_PROBES } from '../src/appearance'

test('COLORFGBG names the tone by its background index', () => {
  const table: [string | undefined, 'light' | 'dark' | undefined][] = [
    ['15;0', 'dark'],
    ['0;15', 'light'],
    ['7;6', 'dark'],
    ['0;7', 'light'],
    ['0;8', 'dark'],
    ['0;default;9', 'light'],
    ['0;', undefined],
    ['x;y', undefined],
    ['0;99', undefined],
    [undefined, undefined],
  ]
  for (const [raw, tone] of table) expect(parseColorFgBg(raw)).toBe(tone)
})

const [mac, gnome, windows] = SYSTEM_PROBES

test('macOS answers Dark, or fails when the style is unset', () => {
  expect(mac!.read({ exitCode: 0, stdout: 'Dark\n' })).toBe('dark')
  expect(mac!.read({ exitCode: 1, stdout: '' })).toBe('light')
})

test('GNOME answers with the colour scheme, and says nothing when gsettings fails', () => {
  expect(gnome!.read({ exitCode: 0, stdout: "'prefer-dark'\n" })).toBe('dark')
  expect(gnome!.read({ exitCode: 0, stdout: "'default'\n" })).toBe('light')
  expect(gnome!.read({ exitCode: 1, stdout: '' })).toBeUndefined()
})

test('Windows answers with AppsUseLightTheme', () => {
  const out = (value: string) =>
    `\r\nHKEY\\Personalize\r\n    AppsUseLightTheme    REG_DWORD    ${value}\r\n`
  expect(windows!.read({ exitCode: 0, stdout: out('0x0') })).toBe('dark')
  expect(windows!.read({ exitCode: 0, stdout: out('0x1') })).toBe('light')
  expect(windows!.read({ exitCode: 1, stdout: '' })).toBeUndefined()
})
