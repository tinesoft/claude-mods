import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modsDir = path.join(root, 'mods')

const args = process.argv.slice(2)
const check = args.includes('--check')
const fromTags = args.includes('--from-head-tags')
const named = args.filter(a => !a.startsWith('--'))

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))

const allMods = () =>
  readdirSync(modsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(path.join(modsDir, d.name, 'package.json')))
    .map(d => d.name)

// Mods released by the last `nx release` are the ones whose tag points at HEAD.
const modsTaggedAtHead = () => {
  const tags = execFileSync('git', ['tag', '--points-at', 'HEAD'], { cwd: root, encoding: 'utf8' })
  return tags
    .split('\n')
    .map(t => t.match(/^(.+)@\d+\.\d+\.\d+.*$/)?.[1])
    .filter(Boolean)
}

const mods = named.length ? named : fromTags ? modsTaggedAtHead() : allMods()
const known = new Set(allMods())

let drift = 0
for (const mod of mods) {
  if (!known.has(mod)) continue
  const pkgFile = path.join(modsDir, mod, 'package.json')
  const manifestFile = path.join(modsDir, mod, '.claude-plugin', 'plugin.json')
  const { version } = readJson(pkgFile)
  const manifestText = readFileSync(manifestFile, 'utf8')
  const manifest = JSON.parse(manifestText)
  if (manifest.version === version) continue
  if (check) {
    console.error(`${mod}: plugin.json is ${manifest.version}, package.json is ${version}`)
    drift++
    continue
  }
  writeFileSync(
    manifestFile,
    manifestText.replace(/("version"\s*:\s*)"[^"]*"/, `$1${JSON.stringify(version)}`),
  )
  console.log(`${mod}: plugin.json -> ${version}`)
}

process.exit(drift ? 1 : 0)
