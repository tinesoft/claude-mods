import { expect, test } from 'claude-code/testing'
import { isShared, isWritable, type WritableContext } from '../src/files'

const ctx: WritableContext = {
  steering: 'CLAUDE.md',
  docs: { glossary: 'GLOSSARY.md', adr: 'docs/adr/' },
  issuesFolder: 'docs/issues/',
}

test('only the files Craftory owns or shares are writable', () => {
  for (const path of [
    '.craftory/config.json',
    '.craftory/features/42.json',
    'docs/agents/issue-tracker.md',
    'docs/agents/triage-labels.md',
    'docs/agents/domain.md',
    'CLAUDE.md',
    'GLOSSARY.md',
    '.gitignore',
    'docs/issues/12-export-csv.md',
    './docs/agents//domain.md',
  ]) {
    expect(isWritable(path, ctx), path).toBe(true)
  }
})

test('everything else is refused, including paths that leave the repo', () => {
  for (const path of [
    'AGENTS.md',
    'src/index.ts',
    'docs/agents/other.md',
    'docs/issues/notes.md',
    'docs/issues/12-x.txt',
    '.craftory/features/../config.json',
    '.craftory/features/a/b.json',
    '../outside.md',
    '/etc/passwd',
    'docs\\agents\\domain.md',
    '',
  ]) {
    expect(isWritable(path, ctx), path).toBe(false)
  }
})

test('the steering file is whichever one the repo uses', () => {
  expect(isWritable('AGENTS.md', { ...ctx, steering: 'AGENTS.md' })).toBe(true)
  expect(isWritable('CLAUDE.md', { ...ctx, steering: 'AGENTS.md' })).toBe(false)
  expect(isWritable('CLAUDE.md', { ...ctx, steering: null })).toBe(false)
})

test("shared files are compare-and-swap, Craftory's own are not", () => {
  expect(isShared('GLOSSARY.md', ctx)).toBe(true)
  expect(isShared('.gitignore', ctx)).toBe(true)
  expect(isShared('docs/agents/domain.md', ctx)).toBe(true)
  expect(isShared('.craftory/config.json', ctx)).toBe(false)
  expect(isShared('src/index.ts', ctx)).toBe(false)
})
