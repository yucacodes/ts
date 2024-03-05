import test from 'node:test'
import { execTsFile } from '../../test.assets/utils.mjs'

test('tsconfig exact path', async () => {
  await execTsFile('test/tsconfig-paths/1.exact-path.ts', {
    cwd: 'test/tsconfig-paths',
  })
})
