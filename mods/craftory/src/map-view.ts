import type { CraftoryConfig, IssueRef, TrackerSnapshot, WayMap, WayTicket } from '../types'
import type { WayfinderOffer } from './notices'
import { parseIssueRef } from './tracker/refs'
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
  picked?: IssueRef | null
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

/**
 * What `/wayfinder` is handed for a map or ticket: a numbered ref as it is, and for a `.scratch`
 * one the path of its file, which is how the Local tracker names it (see the tracker doc's
 * "fetch the relevant ticket": the user passes the path or the issue number).
 */
const argOf = (item: { ref: IssueRef; location: string }) =>
  parseIssueRef(item.ref) === undefined ? item.location : item.ref

export const mapArg = (map: WayMap) => argOf(map)

/** The argument that takes one named ticket of a map. */
export const ticketArg = (map: WayMap, ticket: WayTicket) => `${argOf(map)} ${argOf(ticket)}`

/** What the tracker's last read says about the maps: the maps, and whether a missing link means it is stale. */
const mapsOf = (tracker: TrackerSnapshot | null) => ({
  maps: tracker?.maps ?? [],
  reachable: tracker?.rich === true && tracker.problem === null,
})

/** The active map of the tracker's last read as the rail and pane draw it; null with no map. */
export function activeMapView(input: {
  tracker: TrackerSnapshot | null
  link: IssueRef | null
  picked: IssueRef | null
}): MapView | null {
  const { active, others, link } = resolveMaps({ ...mapsOf(input.tracker), ...input })
  return active === null ? null : mapView(active, { others, isLinkStale: link === 'stale' })
}

/** What the suggest notice shows now: the global switch, the Feature's link, an open map to join. */
export function wayfinderOffer(input: {
  tracker: TrackerSnapshot | null
  suggest: CraftoryConfig['entry']['wayfinder']['suggest']
  link: IssueRef | null
  picked: IssueRef | null
}): WayfinderOffer {
  const { active } = resolveMaps({
    maps: mapsOf(input.tracker).maps,
    link: null,
    reachable: true,
    picked: input.picked,
  })
  return {
    enabled: input.suggest === 'long-grill',
    hasLink: input.link !== null,
    attach:
      active !== null && !active.isClosed
        ? { name: active.title, ref: active.ref, arg: mapArg(active) }
        : null,
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
  // a blocker the map does not hold cannot be known resolved, so it blocks, named by its ref
  const waitsOn = (t: WayTicket) =>
    t.blockedBy.flatMap(ref => {
      const blocker = byRef.get(ref)
      return blocker === undefined ? [ref] : blocker.state !== 'resolved' ? [blocker.title] : []
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

/** `2 decided · 4 open (1 claimed) · Closed`: how far along a map is, as its cards say it. */
export const mapCountsText = (view: MapView) =>
  `${view.decided} decided · ${view.open} open${view.claimed > 0 ? ` (${view.claimed} claimed)` : ''}${view.map.isClosed ? ' · Closed' : ''}`

/** `Tax rounding (grilling)`: a ticket's title, then its type when it has one. */
export const ticketLabel = (ticket: WayTicket) =>
  `${ticket.title}${ticket.type === null ? '' : ` (${ticket.type})`}`

/** `◆ Billing v2 2✓ 4?`: the title, then decided and open; or the route-clear fact, or `Closed`. */
export function mapChipText(view: MapView, ascii: boolean): string {
  const head = `${ascii ? '*' : '◆'} ${clip(view.map.title, MAP_TITLE_MAX)}`
  const counts = `${view.decided}${ascii ? 'v' : '✓'} ${view.open}?`
  if (view.map.isClosed) return `${head} ${counts} Closed`
  if (view.open === 0)
    return `${head} No open tickets · Route clear?${view.map.hasFog ? ' · fog' : ''}`
  return `${head} ${counts}`
}
