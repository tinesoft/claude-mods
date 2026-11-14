import { expect, test } from 'claude-code/testing'
import { meetsFloor } from '../src/engine-floor'

test('a release meets the floor by its numbers, a dev build by its release, an unnamed build always', () => {
  expect(
    [
      '2.1.298',
      '2.1.299',
      '2.1.300',
      '2.2.0',
      '3.0.0',
      '2.1.299-dev',
      '2.1.294-dev',
      undefined,
    ].map(base => meetsFloor(base)),
  ).toEqual([false, true, true, true, true, true, false, true])
})
