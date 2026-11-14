import { expect, test } from 'claude-code/testing'
import { vscodeAccented } from '../src/vscode-accent'

test("on VS Code the theme keys it draws blue become Claude's terracotta", () => {
  expect(vscodeAccented({ color: 'suggestion', borderColor: 'permission' })).toEqual({
    color: 'claude',
    borderColor: 'claude',
  })
  expect(vscodeAccented({ color: 'warning', backgroundColor: 'ide' })).toEqual({
    color: 'warning',
    backgroundColor: 'claude',
  })
})
