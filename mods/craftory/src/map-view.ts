import type { WayMap, WayTicket } from '../types'
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
  blocked: { ticket: WayTicket; waitsOn: string[] }[]
}

/** The map the chip shows: the most recently updated open one, else the latest closed one. */
export function activeMap(maps: readonly WayMap[]): WayMap | null {
  const latest = (list: readonly WayMap[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  return latest(maps.filter(m => !m.isClosed)) ?? latest(maps) ?? null
}

/** The fact the card states when no ticket is open; the user closes the map, never the mod. */
export const routeClearText = (map: WayMap) =>
  `No open tickets · Route clear?${map.hasFog ? ' Not yet specified still has fog.' : ''}`

/** State comes from each ticket's structure alone: resolved, claimed, or open and then blocked or takeable. */
export function mapView(map: WayMap): MapView {
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
    takeable: unclaimed.filter(t => waitsOn(t).length === 0),
    blocked: unclaimed.flatMap(ticket => {
      const waits = waitsOn(ticket)
      return waits.length > 0 ? [{ ticket, waitsOn: waits }] : []
    }),
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
