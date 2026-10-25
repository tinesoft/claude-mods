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
