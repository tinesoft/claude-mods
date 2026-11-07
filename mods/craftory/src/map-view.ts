import type { IssueRef, WayMap, WayTicket } from '../types'
import { clip } from './ui'

export const MAP_TITLE_MAX = 16

const SOURCE_NAMES = { local: 'Local', github: 'GitHub', gitlab: 'GitLab' } as const

export type MapView = {
  map: WayMap
  /** `Wayfinder · Local · .scratch/billing-v2`: where the map came from. */
  kicker: string
  decided: number
  open: number
  claimed: number
  /** Open, unblocked and unclaimed, in order: the frontier. */
  takeable: WayTicket[]
  /** Unclaimed and not takeable; `waitsOn` is empty when the tracker could not say what blocks it. */
  blocked: { ticket: WayTicket; waitsOn: string[] }[]
  /** The other maps, for the card's switcher; empty with one map. */
  others: { ref: IssueRef; title: string }[]
  /** The Feature's `map` link points at nothing map-shaped: the card says so, quietly. */
  isLinkStale: boolean
}

/** The map the chip shows: the most recently updated open one, else the latest closed one. */
export function activeMap(maps: readonly WayMap[]): WayMap | null {
  const latest = (list: readonly WayMap[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  return latest(maps.filter(m => !m.isClosed)) ?? latest(maps) ?? null
}

export type LinkState = 'none' | 'valid' | 'unknown' | 'stale'

const isLinkTo = (map: WayMap, link: IssueRef) =>
  map.ref === link || map.origin === link || map.location === link

/**
 * The active map and the rest. A Feature's `map` link is valid when it names a map, unknown when
 * the tracker could not be reached (kept, silently), and stale when it names nothing map-shaped.
 * Unknown and stale both fall back to the most recently updated open map. A map picked in the
 * switcher wins while it exists.
 */
export function resolveMaps(input: {
  maps: readonly WayMap[]
  link: IssueRef | null
  reachable: boolean
  picked?: string | null
}): { active: WayMap | null; others: WayMap[]; link: LinkState } {
  const { maps, link, reachable, picked } = input
  const linked = link === null ? undefined : maps.find(m => isLinkTo(m, link))
  const state: LinkState =
    link === null ? 'none' : linked !== undefined ? 'valid' : reachable ? 'stale' : 'unknown'
  const active = maps.find(m => m.ref === picked) ?? linked ?? activeMap(maps)
  return {
    active,
    others:
      active === null
        ? []
        : maps.filter(m => m !== active).sort((a, b) => b.updatedAt - a.updatedAt),
    link: state,
  }
}

/** The fact the card states when no ticket is open; the user closes the map, never the mod. */
export const routeClearText = (map: WayMap) =>
  `No open tickets · Route clear?${map.hasFog ? ' Not yet specified still has fog.' : ''}`

/** State comes from each ticket's structure alone: resolved, claimed, or open and then blocked or takeable. */
export function mapView(
  map: WayMap,
  extras: { others?: readonly WayMap[]; isLinkStale?: boolean } = {},
): MapView {
  const byRef = new Map(map.tickets.map(t => [t.ref, t]))
  const open = map.tickets.filter(t => t.state !== 'resolved')
  const waitsOn = (t: WayTicket) =>
    t.blockedBy.flatMap(ref => {
      const blocker = byRef.get(ref)
      return blocker !== undefined && blocker.state !== 'resolved' ? [blocker.title] : []
    })
  const unclaimed = open.filter(t => t.state === 'open')
  return {
    map,
    kicker: `Wayfinder · ${SOURCE_NAMES[map.source]} · ${map.origin}`,
    decided: map.tickets.length - open.length,
    open: open.length,
    claimed: open.length - unclaimed.length,
    takeable: unclaimed.filter(t => t.blockersUnknown !== true && waitsOn(t).length === 0),
    blocked: unclaimed.flatMap(ticket => {
      const waits = waitsOn(ticket)
      return waits.length > 0 || ticket.blockersUnknown === true ? [{ ticket, waitsOn: waits }] : []
    }),
    others: (extras.others ?? []).map(m => ({ ref: m.ref, title: m.title })),
    isLinkStale: extras.isLinkStale ?? false,
  }
}

/** `◆ Billing v2 2✓ 4?`: the title, then decided and open; or the route-clear fact, or `Closed`. */
export function mapChipText(view: MapView, ascii: boolean): string {
  const head = `${ascii ? '*' : '◆'} ${clip(view.map.title, MAP_TITLE_MAX)}`
  const counts = `${view.decided}${ascii ? 'v' : '✓'} ${view.open}?`
  if (view.map.isClosed) return `${head} ${counts} Closed`
  if (view.open === 0)
    return `${head} No open tickets · Route clear?${view.map.hasFog ? ' · fog' : ''}`
  return `${head} ${counts}`
}
