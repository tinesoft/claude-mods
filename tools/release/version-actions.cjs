const { execFileSync } = require('node:child_process')
const path = require('node:path')
const jsActions = require('@nx/js/src/release/version-actions')

const syncScript = path.join(__dirname, '..', 'sync-plugin-version.mjs')

// nx commits and tags in the same run, so plugin.json must change before that commit.
const afterAllProjectsVersioned = async (cwd, opts) => {
  const result = await jsActions.afterAllProjectsVersioned(cwd, opts)
  if (opts.dryRun) return result

  execFileSync('node', [syncScript], { cwd, stdio: 'inherit' })
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', '--', 'mods/*/.claude-plugin/plugin.json'],
    { cwd, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
  return { ...result, changedFiles: [...result.changedFiles, ...changed] }
}

exports.default = jsActions.default
exports.afterAllProjectsVersioned = afterAllProjectsVersioned
