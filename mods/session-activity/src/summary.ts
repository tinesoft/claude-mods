import type { Activation, Settings } from '../types'
import { bandCandidates, chipId, paneGroups } from './model'
import { clip } from './render'
import { STATUSES, TOGGLES } from './theme'

const LINE_LABEL_MAX = 24

const badgeOf = (a: Activation) => STATUSES[a.status].badge

/** The tray as Markdown, for sessions where nothing can be drawn. */
export const markdownSummary = (
  list: readonly Activation[],
  settings: Settings,
  muted: readonly string[],
) => {
  const groups = paneGroups(list, settings, 'all')
  if (groups.length === 0) return 'Nothing has activated yet in this session.'
  const sections = groups.map(({ kind, rows }) => {
    const items = rows.map(a => {
      const parts = [
        `${TOGGLES[kind].glyph} ${a.label}`,
        a.count > 1 ? `×${a.count}` : '',
        a.meta ?? '',
        badgeOf(a) === undefined ? '' : `**${badgeOf(a)}**`,
        muted.includes(chipId(a)) ? '_muted_' : '',
      ]
      return `- ${parts.filter(Boolean).join(' · ')}`
    })
    return [`### ${TOGGLES[kind].plural} (${rows.length})`, ...items].join('\n')
  })
  return ['## Session activity', ...sections].join('\n\n')
}

/** One line for the end of an answer: the band's chips as text. */
export const lineSummary = (
  list: readonly Activation[],
  settings: Settings,
  muted: readonly string[],
) => {
  const chips = bandCandidates(list, settings, muted)
  if (chips.length === 0) return undefined
  const shown = chips.slice(0, settings.maxChips).map(a => {
    const badge = badgeOf(a)
    return `${TOGGLES[a.kind].glyph} ${clip(a.label, LINE_LABEL_MAX)}${badge ? ` ${badge}` : ''}`
  })
  const hidden = chips.length - shown.length
  return `Activity: ${[...shown, ...(hidden > 0 ? [`+${hidden} more`] : [])].join(' · ')}`
}
