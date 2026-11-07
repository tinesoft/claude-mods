import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
const pinned = /CLAUDE_CODE_VERSION:\s*(\S+)/.exec(ci)?.[1]
const local = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim().split(/\s+/)[0]

if (pinned && local !== pinned) {
  console.error(
    `claude ${local} is not the pinned ${pinned}: failures here may not reproduce in CI. ` +
      `Re-run with: npx -y @anthropic-ai/claude-code@${pinned} plugin test .`,
  )
}
