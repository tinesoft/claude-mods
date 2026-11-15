#!/usr/bin/env node
// Replace the installed `tinesoft-mods` marketplace with this repo and install every mod under
// `mods/` from it. The mods are the Nx projects rooted in `mods/`, so a new one is picked up as is.
// The marketplace is removed once: removing it again between installs would drop the earlier mods.
import { execFileSync } from 'node:child_process'

const MARKETPLACE = 'tinesoft-mods'
const run = (cmd, args, options = {}) => {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  return execFileSync(cmd, args, { stdio: 'inherit', ...options })
}

const mods = JSON.parse(
  execFileSync('pnpm', ['nx', 'show', 'projects', '--projects', 'mods/*', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
)
if (mods.length === 0) {
  console.error('No Nx projects under mods/.')
  process.exit(1)
}

try {
  run('claude', ['plugin', 'marketplace', 'remove', MARKETPLACE])
} catch {
  // Not installed yet, nothing to remove.
}
for (const mod of mods) run('claude', ['plugin', 'install', mod, '--marketplace', './'])
