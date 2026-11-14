#!/usr/bin/env node
/**
 * commit-msg check: a commit that changes a vendored kit copy (mods/<mod>/src/_kit/**) is a
 * `fix(<mod>)` or `feat(<mod>)`, so that mod's version and changelog move with the code users
 * receive (docs/adr/0001-vendored-mod-kit.md).
 *
 *   node tools/check-kit-scope.mjs <commit-message-file> [--staged <file>...]
 *
 * The staged files come from git unless `--staged` names them (used by the tests).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [messageFile, ...rest] = process.argv.slice(2)
const staged =
  rest[0] === '--staged'
    ? rest.slice(1)
    : execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)

const touched = [
  ...new Set(staged.map(f => /^mods\/([^/]+)\/src\/_kit\//.exec(f)?.[1]).filter(Boolean)),
]
if (!touched.length) process.exit(0)

const header = readFileSync(messageFile, 'utf8').split('\n')[0] ?? ''
if (/^(Merge|Revert|fixup!|squash!)/.test(header)) process.exit(0)
const match = /^(\w+)\(([^)]+)\)!?:/.exec(header)

const problem =
  touched.length > 1
    ? `this commit changes vendored kit copies in ${touched.join(' and ')}; commit each mod on its own`
    : !match || match[2] !== touched[0] || !['fix', 'feat'].includes(match[1])
      ? `this commit changes mods/${touched[0]}/src/_kit, so it must be fix(${touched[0]}) or feat(${touched[0]})`
      : undefined

if (problem) {
  console.error(`check-kit-scope: ${problem} (docs/adr/0001-vendored-mod-kit.md)`)
  process.exit(1)
}
