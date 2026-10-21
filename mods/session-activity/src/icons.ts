import type { Toggle } from '../types'

/** 16x16 stroke icons redrawn from the artboards; Desktop only (the terminal has no `Svg`). */
export const ICONS: Record<Toggle, string> = {
  skill: 'M8 2L14 5 8 8 2 5zM2 8l6 3 6-3M2 11l6 3 6-3',
  agent:
    'M4.5 5h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 2.5V5M6 8.5v1M10 8.5v1',
  mcp: 'M6 1.5v3M10 1.5v3M4 4.5h8v3a4 4 0 0 1-8 0zM8 11.5v3',
  perm: 'M8.5 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM7.6 8.4l5.9-5.9M11 5l1.5 1.5M12.5 3.5L14 5',
  hook: 'M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z',
  rule: 'M8 1.8l5 2v4c0 3-2.2 5.2-5 6.4-2.8-1.2-5-3.4-5-6.4v-4z',
  command: 'M5.5 13.5l5-11',
  memory: 'M4.5 2h7v12L8 11.5 4.5 14z',
  context: 'M2.5 11a5.5 5.5 0 1 1 11 0M8 11l2.5-3',
  checkpoint: 'M3.5 14V2.5M3.5 3h8l-2 3 2 3h-8',
  model: 'M2.5 4.5h11M2.5 11.5h11M10 3v3M6 10v3',
  background: 'M2.5 3.5h11v9h-11zM5 7l2 1.5L5 10M8.5 10.5h2.5',
  plugin: 'M2.5 5.5L8 2.5l5.5 3v5L8 13.5l-5.5-3zM2.5 5.5L8 8.5l5.5-3M8 8.5v5',
}

const ERROR_PATH = 'M8 2L14.5 13.5h-13zM8 6.5v3M8 11.6v.1'

const RING_ARC = 'M8 2.5a5.5 5.5 0 0 1 5.5 5.5'

const NEUTRAL = '#8B909A'

export const OFF_TRACK = '#C4C8D0'

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"'

/** Images don't inherit `currentColor`, so a theme key like `suggestion` falls back to grey. */
export const hexOr = (color: string | undefined, fallback = NEUTRAL) =>
  color !== undefined && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback

const strokeSvg = (body: string, color: string) =>
  `<svg ${XMLNS} viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const iconSvg = (toggle: Toggle, color: string) =>
  strokeSvg(`<path d="${ICONS[toggle]}"/>`, color)

export const errorSvg = (color: string) => strokeSvg(`<path d="${ERROR_PATH}"/>`, color)

export const dotSvg = (color: string) =>
  `<svg ${XMLNS} viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${color}"/></svg>`

export const stoppedSvg = (color: string) =>
  `<svg ${XMLNS} viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="2">` +
  `<circle cx="8" cy="8" r="6"/><path d="M3.8 12.2l8.4-8.4"/></svg>`

export const SPIN_FRAMES = 4

export const spinnerSvg = (frame: number, color: string, track: string) => {
  const degrees = (frame % SPIN_FRAMES) * (360 / SPIN_FRAMES)
  return (
    `<svg ${XMLNS} viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round">` +
    `<circle cx="8" cy="8" r="5.5" stroke="${track}"/>` +
    `<path d="${RING_ARC}" stroke="${color}" transform="rotate(${degrees} 8 8)"/></svg>`
  )
}

export const SWITCH_SIZE = { width: 40, height: 24 } as const

export const switchSvg = (isOn: boolean, onColor: string, offColor: string) =>
  `<svg ${XMLNS} viewBox="0 0 40 24">` +
  `<rect width="40" height="24" rx="12" fill="${isOn ? onColor : offColor}"/>` +
  `<circle cx="${isOn ? 28 : 12}" cy="12" r="9" fill="#FFFFFF"/></svg>`
