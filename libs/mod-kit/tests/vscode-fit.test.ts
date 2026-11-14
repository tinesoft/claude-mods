import { expect, test } from 'claude-code/testing'
import { vscodeButton, vscodeSpaced } from '../src/vscode-fit'
import { byKey, fakeUi, findAll, type Node } from './fake-ui'

test('a structural `sm` gap becomes one row on VS Code, which draws steps as cells', () => {
  expect(vscodeSpaced({ rowGap: 'sm', marginBottom: 'sm', marginTop: 'sm' })).toMatchObject({
    rowGap: 1,
    marginBottom: 1,
    marginTop: 1,
  })
})

test('`xs`, the larger steps, numbers and padding are left as they are', () => {
  const props = { rowGap: 'xs', marginBottom: 'md', marginTop: 2, paddingY: 'sm', columnGap: 'sm' }
  expect(vscodeSpaced(props)).toEqual({ ...props, flexWrap: 'nowrap' })
})

test('a Box wraps on VS Code only when it asks to, as on the terminal', () => {
  expect(vscodeSpaced({ flexDirection: 'row' })).toMatchObject({ flexWrap: 'nowrap' })
  expect(vscodeSpaced({ flexDirection: 'row', flexWrap: 'wrap' })).toMatchObject({
    flexWrap: 'wrap',
  })
})

test('a wrapping row gets a row gap unless it sets one', () => {
  expect(vscodeSpaced({ flexDirection: 'row', flexWrap: 'wrap' })).toMatchObject({ rowGap: 1 })
  expect(vscodeSpaced({ flexDirection: 'row', flexWrap: 'wrap', rowGap: 0 })).toMatchObject({
    rowGap: 0,
  })
  expect(vscodeSpaced({ flexDirection: 'row', flexWrap: 'nowrap' })).not.toHaveProperty('rowGap')
  expect(vscodeSpaced({ flexDirection: 'column', flexWrap: 'wrap' })).not.toHaveProperty('rowGap')
})

test('on VS Code an accent Button is a dim one in a terracotta outline that hugs it', () => {
  const ui = fakeUi()
  const Button = vscodeButton(ui.Button as never, ui.Box as never)
  const out = Button({ key: 'go', onPress: () => undefined, children: 'Go' } as never)
  const [outline] = findAll(out, n => n.props.borderStyle === 'round')
  expect(outline?.props).toMatchObject({ borderColor: 'claude', flexWrap: 'nowrap' })
  expect(byKey(out, 'go')?.props).toMatchObject({ dimColor: true })
  expect(byKey(out, 'go')?.type).toBe('Button')
  expect((out as unknown as Node).props).toMatchObject({ alignItems: 'flex-start', flexShrink: 0 })
})

test('on VS Code a dim Button stays plain, with no outline', () => {
  const ui = fakeUi()
  const Button = vscodeButton(ui.Button as never, ui.Box as never)
  const out = Button({ key: 'later', dimColor: true, onPress: () => undefined } as never)
  expect((out as unknown as Node).type).toBe('Button')
  expect(findAll(out, n => n.props.borderStyle !== undefined)).toEqual([])
})
