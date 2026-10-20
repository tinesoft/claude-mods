import { expect, test } from 'claude-code/testing'
import { ICONS, iconSvg, spinnerSvg, switchSvg } from '../src/icons'
import { mix } from '../src/theme'

test('every icon builds markup far below the Svg size limit', () => {
  const markup = [
    ...Object.keys(ICONS).map(toggle => iconSvg(toggle as keyof typeof ICONS, '#112233')),
    spinnerSvg(3, '#112233', '#445566'),
    switchSvg(true, '#112233', '#445566'),
  ]
  for (const svg of markup) expect(svg.length).toBeLessThan(2000)
})

test('mix blends two hex colours', () => {
  expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  expect(mix('#EDF2FD', '#1F4FC1', 0)).toBe('#EDF2FD')
})
