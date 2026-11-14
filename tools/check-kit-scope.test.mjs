import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'check-kit-scope.mjs')
const dir = mkdtempSync(path.join(tmpdir(), 'kit-scope-'))
after(() => rmSync(dir, { recursive: true, force: true }))

const run = (header, ...staged) => {
  const file = path.join(dir, 'msg')
  writeFileSync(file, `${header}\n\nbody\n`)
  const r = spawnSync('node', [tool, file, '--staged', ...staged], { encoding: 'utf8' })
  return { code: r.status, err: r.stderr }
}
const copy = mod => `mods/${mod}/src/_kit/engine-floor.ts`

describe('check-kit-scope', () => {
  it('passes a commit that touches no vendored copy, whatever its scope', () => {
    assert.equal(run('chore(repo): x', 'libs/mod-kit/src/types.ts').code, 0)
  })
  it('passes fix or feat scoped to the mod whose copy changed', () => {
    assert.equal(run('fix(craftory): x', copy('craftory')).code, 0)
    assert.equal(run('feat(session-activity)!: x', copy('session-activity')).code, 0)
  })
  it('rejects the wrong scope or type', () => {
    assert.equal(run('fix(repo): x', copy('craftory')).code, 1)
    assert.equal(run('fix(session-activity): x', copy('craftory')).code, 1)
    const r = run('refactor(craftory): x', copy('craftory'))
    assert.equal(r.code, 1)
    assert.match(r.err, /fix\(craftory\) or feat\(craftory\)/)
  })
  it('rejects one commit that changes two mods', () => {
    const r = run('fix(craftory): x', copy('craftory'), copy('session-activity'))
    assert.equal(r.code, 1)
    assert.match(r.err, /each mod on its own/)
  })
})
