import type { Tone } from '../types'
import type { PhaseState } from './evidence'
import { TOKENS, TRIPLES } from './theme'

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
/** The board's branch mark on an agent's worktree line. */
export const branchSvg = (color: string) =>
  stroke(
    '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="6" r="1.5"/><path d="M4.5 5v6M11.5 7.5c0 2.5-7 1.5-7 3.5"/>',
    color,
  )
export const closeSvg = (color: string) => stroke('<path d="M4 4l8 8M12 4l-8 8"/>', color)

/** The Wayfinder map's diamond, filled as on the board's map chip. */
export const diamondSvg = (color: string) =>
  `<svg ${XMLNS} viewBox="0 0 16 16" fill="${color}"><path d="M8 1.5L14.5 8 8 14.5 1.5 8z"/></svg>`

/** A one-pixel hairline that stretches to its slot: the divider between a list's rows. */
export const ruleSvg = (color: string) =>
  `<svg ${XMLNS} viewBox="0 0 1000 1" width="1000" height="1" preserveAspectRatio="none"><rect width="1000" height="1" fill="${color}"/></svg>`

/** The board's list mark on the feature title pill. */
export const listSvg = (color: string) =>
  stroke('<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.1M2.5 8h.1M2.5 12h.1"/>', color)

/** The short bar joining two phase steps on rich surfaces. */
export const BAR_SIZE = { width: 10, height: 2 } as const

/** The thin vertical bar joining two phases of the Flow timeline on rich surfaces. */
export const VBAR_SIZE = { width: 2, height: 16 } as const

/** A rounded bar `w`×`h`: the line joining two phases, across the rail or down the Flow timeline. */
export const barSvg = (w: number, h: number, color: string) =>
  `<svg ${XMLNS} viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="1" fill="${color}"/></svg>`

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

/** The phase dot's size on rich surfaces, as the board's numbered step marker. */
export const DOT_PX = 18

/**
 * Step numbers as stroked paths in a 5×8 box: Desktop's `Svg` is not known to draw `<text>`, so the
 * number never depends on a font.
 */
const DIGIT_PATHS: Record<string, string> = {
  '0': 'M2.5 0C.5 0 0 2 0 4s.5 4 2.5 4S5 6 5 4 4.5 0 2.5 0z',
  '1': 'M1 1.6L3 0v8',
  '2': 'M.2 1.8C.5.6 1.4 0 2.5 0c1.4 0 2.3.9 2.3 2.2 0 1-.6 1.7-1.5 2.5L0 8h5',
  '3': 'M.3.8C.8.3 1.6 0 2.5 0c1.3 0 2.2.8 2.2 1.9 0 1.2-1 2-2.3 2 1.5 0 2.6.8 2.6 2.1C5 7.2 3.9 8 2.5 8 1.5 8 .7 7.6.2 7',
  '4': 'M3.8 8V0L0 5.6h5',
  '5': 'M4.6 0H.8L.4 3.6C.9 3.2 1.6 3 2.4 3 3.9 3 5 4 5 5.5S3.9 8 2.4 8C1.4 8 .6 7.6.1 7',
  '6': 'M4.3.4C3.8.1 3.2 0 2.6 0 1 0 0 1.6 0 4.5 0 6.8 1 8 2.6 8 4 8 5 7 5 5.6S4 3.2 2.6 3.2C1.4 3.2.4 4 0 5',
  '7': 'M0 0h5L1.8 8',
  '8': 'M2.5 3.8C1.3 3.8.4 3.1.4 1.9S1.3 0 2.5 0s2.1.7 2.1 1.9-.9 1.9-2.1 1.9zm0 0C1.1 3.8 0 4.6 0 5.9S1.1 8 2.5 8 5 7.2 5 5.9 3.9 3.8 2.5 3.8z',
  '9': 'M.7 7.6c.5.3 1.1.4 1.7.4C4 8 5 6.4 5 3.5 5 1.2 4 0 2.4 0 1 0 0 1 0 2.4s1 2.4 2.4 2.4c1.2 0 2.2-.8 2.6-1.8',
}

const DIGIT_W = 5
const DIGIT_GAP = 1.5

/** The glyph states keep their own phase icon inside the dot; the rest show the step number. */
export type DotGlyph = Extract<
  PhaseIconKind,
  'done' | 'needs-you' | 'gated' | 'failed' | 'over-budget'
>

export type Dot = {
  /** The ring's colour, or `null` when the dot is a filled disc. */
  ring: string | null
  fill: string | null
  mark:
    { kind: 'number'; n: number; color: string } | { kind: 'glyph'; glyph: DotGlyph; color: string }
  dashed: boolean
  /** A line struck through the number (Skipped). */
  strike: boolean
  /** Running: an arc that turns around the disc, on its track. */
  spinner: { color: string; track: string } | null
}

/** Which dot a phase in `state` draws as step `n`, in the tone's design tokens. */
export const dotOf = (state: PhaseState['kind'], n: number, tone: Tone): Dot => {
  const t = TOKENS[tone]
  const skill = TRIPLES.skill[tone]
  const plain = { fill: null, dashed: false, strike: false, spinner: null }
  const number = (color: string) => ({ kind: 'number' as const, n, color })
  const glyph = (kind: DotGlyph, color: string): Dot => ({
    ...plain,
    ring: color,
    mark: { kind: 'glyph', glyph: kind, color },
  })
  switch (state) {
    case 'todo':
      return { ...plain, ring: t.lineStrong, mark: number(t.muted) }
    case 'next':
      return { ...plain, ring: skill.fg, fill: skill.bg, mark: number(skill.fg) }
    case 'running':
      return {
        ...plain,
        ring: null,
        fill: skill.fg,
        mark: number(t.onInk),
        spinner: { color: skill.fg, track: skill.bd },
      }
    case 'skipped':
      return { ...plain, ring: t.muted, mark: number(t.muted), dashed: true, strike: true }
    case 'done':
      return { ...glyph('done', TRIPLES.perm[tone].fg), fill: TRIPLES.perm[tone].bg }
    case 'needs-you':
      return glyph('needs-you', TRIPLES.hook[tone].fg)
    case 'gated':
      return glyph('gated', t.text2)
    case 'failed':
    case 'over-budget':
      return glyph(state, t.danger)
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

const numberMark = (n: number, color: string) => {
  const digits = String(n).split('')
  const scale = digits.length > 1 ? 0.8 : 1
  const width = (digits.length * DIGIT_W + (digits.length - 1) * DIGIT_GAP) * scale
  const paths = digits
    .map(
      (d, i) =>
        `<path transform="translate(${i * (DIGIT_W + DIGIT_GAP)} 0)" d="${DIGIT_PATHS[d]}"/>`,
    )
    .join('')
  return (
    `<g data-n="${n}" fill="none" stroke="${color}" stroke-width="${1.7 / scale}" ` +
    `stroke-linecap="round" stroke-linejoin="round" ` +
    `transform="translate(${12 - width / 2} ${12 - 4 * scale}) scale(${scale})">${paths}</g>`
  )
}

const glyphMark = (kind: DotGlyph, color: string) =>
  `<g fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ` +
  `transform="translate(6 6) scale(0.75)"><path d="${PHASE_PATHS[kind]}"/></g>`

/** The dot (from `dotOf`) as a 24×24 image; `frame` turns the Running spinner as `spinnerSvg` does. */
export const phaseDotSvg = (dot: Dot, frame = 0) => {
  const ring =
    dot.ring === null
      ? ''
      : `<circle cx="12" cy="12" r="10" fill="none" stroke="${dot.ring}" stroke-width="1.6"` +
        `${dot.dashed ? ' stroke-dasharray="3 2.2"' : ''}/>`
  const spinner =
    dot.spinner === null
      ? ''
      : `<circle cx="12" cy="12" r="10.6" fill="none" stroke="${dot.spinner.track}" stroke-width="1.6"/>` +
        `<path d="M12 1.4a10.6 10.6 0 0 1 10.6 10.6" fill="none" stroke="${dot.spinner.color}" ` +
        `stroke-width="1.6" stroke-linecap="round" transform="rotate(${(frame % 4) * 90} 12 12)"/>`
  // a ringed disc fills up to its ring; Running's disc sits inside the spinner's track
  const fill =
    dot.fill === null
      ? ''
      : `<circle cx="12" cy="12" r="${dot.ring === null ? 8 : 10}" fill="${dot.fill}"/>`
  const mark =
    dot.mark.kind === 'number'
      ? numberMark(dot.mark.n, dot.mark.color)
      : glyphMark(dot.mark.glyph, dot.mark.color)
  const strike =
    dot.strike && dot.mark.kind === 'number'
      ? `<path d="M6.5 12h11" stroke="${dot.mark.color}" stroke-width="1.6" stroke-linecap="round"/>`
      : ''
  return `<svg ${XMLNS} viewBox="0 0 24 24">${fill}${ring}${spinner}${mark}${strike}</svg>`
}
