#!/usr/bin/env node
// What is left in `.scratch/`: for each feature and wayfinder map, the files not yet finished, with
// their raw `Status:` value. `--all` lists finished files too.
import { readScratch } from './scratch-read.mjs'

const FINISHED = new Set(['resolved', 'closed', 'done', 'wontfix'])
const all = process.argv.includes('--all')
const { snapshot, statusOf } = await readScratch()

const groups = new Map()
const add = (group, location, title) => {
  const status = statusOf(location)[0] ?? '(none)'
  if (!all && FINISHED.has(status)) return
  if (!groups.has(group)) groups.set(group, [])
  groups.get(group).push({ status, location, title })
}

for (const issue of snapshot.issues) {
  add(
    issue.ref.split('/')[0],
    issue.location,
    issue.kind === 'spec' ? `spec: ${issue.title}` : issue.title,
  )
}
for (const map of snapshot.maps ?? []) {
  for (const t of map.tickets) add(`${map.ref} (map)`, t.location, t.title)
}

if (groups.size === 0) console.log(all ? 'No .scratch files.' : 'Nothing open in .scratch.')
for (const [group, rows] of groups) {
  console.log(`\n${group}`)
  for (const r of rows) console.log(`  ${r.status.padEnd(16)} ${r.location}  ${r.title}`)
}
if (snapshot.problem) console.log(`\nproblems: ${snapshot.problem}`)
