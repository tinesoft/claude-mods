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

const PHASE_PATHS = {
  done: 'M3.5 8.5l3 3 6-7',
  next: 'M6 4.5l5 3.5-5 3.5z',
  'needs-you': 'M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2M8 11.5v.2',
  gated: 'M4.5 8h7v4.5h-7zM6 8V6.5a2 2 0 0 1 4 0V8',
  failed: 'M8 2L14.5 13.5h-13zM8 6.5v3M8 11.6v.1',
  'over-budget': 'M8 2L14.5 13.5h-13zM8 6.5v3M8 11.6v.1',
  skipped: 'M4 8h8',
  todo: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
} as const

export type PhaseIconKind = keyof typeof PHASE_PATHS

export const phaseSvg = (kind: PhaseIconKind, color: string) =>
  stroke(`<path d="${PHASE_PATHS[kind]}"/>`, color)

export const INBOX_PATH = 'M2 9.5l1.8-6h8.4l1.8 6v3.5H2zM2 9.5h3.5l1 1.5h3l1-1.5H14'
export const LOCK_PATH = 'M3 7h10v7H3zM5.5 7V5a2.5 2.5 0 0 1 5 0v2'

export const inboxSvg = (color: string) => stroke(`<path d="${INBOX_PATH}"/>`, color)
export const lockSvg = (color: string) => stroke(`<path d="${LOCK_PATH}"/>`, color)
export const helperSvg = (color: string) =>
  stroke('<path d="M8 2L14 5 8 8 2 5zM2 8l6 3 6-3M2 11l6 3 6-3"/>', color)
export const closeSvg = (color: string) => stroke('<path d="M4 4l8 8M12 4l-8 8"/>', color)

/** The Wayfinder map's diamond, filled as on the board's map chip. */
export const diamondSvg = (color: string) =>
  `<svg ${XMLNS} viewBox="0 0 16 16" fill="${color}"><path d="M8 1.5L14.5 8 8 14.5 1.5 8z"/></svg>`

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

export const SWITCH_SIZE = { width: 40, height: 24 } as const

export const switchSvg = (isOn: boolean, onColor: string, offColor: string) =>
  `<svg ${XMLNS} viewBox="0 0 40 24">` +
  `<rect width="40" height="24" rx="12" fill="${isOn ? onColor : offColor}"/>` +
  `<circle cx="${isOn ? 28 : 12}" cy="12" r="9" fill="#FFFFFF"/></svg>`
