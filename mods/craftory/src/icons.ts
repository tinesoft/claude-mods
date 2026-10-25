/** 16x16 stroke icons for Desktop; the terminal has no `Svg` and draws a glyph instead. */
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"'

const NEUTRAL = '#8B909A'

/** Images don't inherit `currentColor`, so a theme key like `suggestion` falls back to grey. */
export const hexOr = (color: string | undefined, fallback = NEUTRAL) =>
  color !== undefined && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback

const stroke = (body: string, color: string) =>
  `<svg ${XMLNS} viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export type NoticeIcon = 'warn' | 'info' | 'busy'

const PATHS: Record<NoticeIcon, string> = {
  warn: 'M8 2L14.5 13.5h-13zM8 6.5v3M8 11.6v.1',
  info: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 7.3v3.4M8 5.3v.1',
  busy: 'M8 2.5a5.5 5.5 0 0 1 5.5 5.5',
}

export const noticeSvg = (icon: NoticeIcon, color: string) =>
  stroke(`<path d="${PATHS[icon]}"/>`, color)

const STEP_PATHS = {
  done: 'M3.5 8.5l3 3 6-7',
  next: 'M6 4.5l5 3.5-5 3.5z',
  'needs-you': 'M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2M8 11.5v.2',
  gated: 'M4.5 8h7v4.5h-7zM6 8V6.5a2 2 0 0 1 4 0V8',
  failed: 'M8 2L14.5 13.5h-13zM8 6.5v3M8 11.6v.1',
  'over-budget': 'M8 2L14.5 13.5h-13zM8 6.5v3M8 11.6v.1',
  skipped: 'M4 8h8',
  todo: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
} as const

export type StepIconKind = keyof typeof STEP_PATHS

export const stepSvg = (kind: StepIconKind, color: string) =>
  stroke(`<path d="${STEP_PATHS[kind]}"/>`, color)

export const INBOX_PATH = 'M2 9.5l1.8-6h8.4l1.8 6v3.5H2zM2 9.5h3.5l1 1.5h3l1-1.5H14'
export const LOCK_PATH = 'M3 7h10v7H3zM5.5 7V5a2.5 2.5 0 0 1 5 0v2'

export const inboxSvg = (color: string) => stroke(`<path d="${INBOX_PATH}"/>`, color)
export const lockSvg = (color: string) => stroke(`<path d="${LOCK_PATH}"/>`, color)
export const gearSvg = (color: string) =>
  stroke(
    '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2"/>',
    color,
  )
export const helperSvg = (color: string) =>
  stroke('<path d="M8 2L14 5 8 8 2 5zM2 8l6 3 6-3M2 11l6 3 6-3"/>', color)
export const closeSvg = (color: string) => stroke('<path d="M4 4l8 8M12 4l-8 8"/>', color)

export const OFF_TRACK = '#C4C8D0'
const RING_ARC = 'M8 2.5a5.5 5.5 0 0 1 5.5 5.5'

export const spinnerSvg = (frame: number, color: string, track: string) => {
  const degrees = (frame % 4) * 90
  return (
    `<svg ${XMLNS} viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round">` +
    `<circle cx="8" cy="8" r="5.5" stroke="${track}"/>` +
    `<path d="${RING_ARC}" stroke="${color}" transform="rotate(${degrees} 8 8)"/></svg>`
  )
}
