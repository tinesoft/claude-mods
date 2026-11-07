import { expect, test } from 'claude-code/testing'
import type { IssueRef, WayMap, WayState, WayTicket } from '../types'
import { mapArg, mapView, ticketArg } from '../src/map-view'

const ticket = (n: number, state: WayState, blockedBy: string[] = []): WayTicket => ({
  ref: `m/0${n}` as IssueRef,
  title: `Ticket ${n}`,
  type: null,
  state,
  assignee: null,
  blockedBy: blockedBy as IssueRef[],
  location: `.scratch/m/issues/0${n}.md`,
})

const mapOf = (tickets: WayTicket[]): WayMap => ({
  ref: 'm' as IssueRef,
  source: 'local',
  title: 'M',
  origin: '.scratch/m',
  location: '.scratch/m/map.md',
  isClosed: false,
  destination: '',
  hasFog: false,
  tickets,
  updatedAt: 1,
})

test('a ticket is blocked while any blocker is unresolved', () => {
  const view = mapView(
    mapOf([ticket(1, 'resolved'), ticket(2, 'open'), ticket(3, 'open', ['m/01', 'm/02'])]),
  )
  expect(view.takeable.map(t => t.title)).toEqual(['Ticket 2'])
  expect(view.blocked.map(b => b.waitsOn)).toEqual([['Ticket 2']])
})

test('a blocker that is no ticket of the map counts as unresolved, named by its ref', () => {
  const view = mapView(mapOf([ticket(1, 'resolved'), ticket(2, 'open', ['m/01', '#99'])]))
  expect(view.takeable).toEqual([])
  expect(view.blocked.map(b => b.waitsOn)).toEqual([['#99']])
})

test('a Local map and ticket are handed to the skill by file path, a numbered one by its ref', () => {
  const local = ticket(1, 'open')
  expect(mapArg(mapOf([local]))).toBe('.scratch/m/map.md')
  expect(ticketArg(mapOf([local]), local)).toBe('.scratch/m/map.md .scratch/m/issues/01.md')
  const numbered = { ...mapOf([]), ref: '#12' as IssueRef, location: 'https://h/issues/12' }
  const task = { ...local, ref: '#14' as IssueRef, location: 'https://h/issues/14' }
  expect(mapArg(numbered)).toBe('#12')
  expect(ticketArg(numbered, task)).toBe('#12 #14')
})
