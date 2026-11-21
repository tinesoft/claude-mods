import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createWorktree } from './worktree-create.mjs'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

function repo() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'wt-')))
  git(root, 'init', '-q', '-b', 'develop')
  git(root, 'config', 'user.email', 't@example.com')
  git(root, 'config', 'user.name', 't')
  writeFileSync(path.join(root, 'a.txt'), 'a')
  git(root, 'add', '.')
  git(root, 'commit', '-q', '-m', 'init')
  return root
}

test('a worktree starts on the checkout HEAD, not the default branch', () => {
  const root = repo()
  try {
    git(root, 'checkout', '-q', '-b', 'feat/x')
    writeFileSync(path.join(root, 'b.txt'), 'b')
    git(root, 'add', '.')
    git(root, 'commit', '-q', '-m', 'on the integration branch')
    const dir = createWorktree(root, 'agent-1')
    assert.equal(dir, path.join(root, '.claude', 'worktrees', 'agent-1'))
    assert.equal(git(dir, 'rev-parse', 'HEAD'), git(root, 'rev-parse', 'HEAD'))
    assert.equal(git(dir, 'branch', '--show-current'), 'worktree-agent-1')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('dependencies are installed in the new worktree', () => {
  const root = repo()
  try {
    const installed = []
    const dir = createWorktree(root, 'agent-2', d => installed.push(d))
    assert.deepEqual(installed, [dir])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failed install still returns the worktree', () => {
  const root = repo()
  try {
    const dir = createWorktree(root, 'agent-3', () => {
      throw new Error('offline')
    })
    assert.ok(existsSync(path.join(dir, 'a.txt')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
