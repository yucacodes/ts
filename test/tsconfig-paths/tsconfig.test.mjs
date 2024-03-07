import test from 'node:test'
import { execTsFile } from '../../test.assets/utils.mjs'

test('tsconfig exact path to ts file', async () => {
  await execTsFile('test/tsconfig-paths/1.exact-path-to-ts-file.ts', {
    cwd: 'test/tsconfig-paths',
  })
})

test('tsconfig exact path to ts dir', async () => {
  await execTsFile('test/tsconfig-paths/2.exact-path-to-ts-dir.ts', {
    cwd: 'test/tsconfig-paths',
  })
})

test('tsconfig wilcard path to ts dir', async () => {
  await execTsFile('test/tsconfig-paths/3.wilcard-path-to-ts-dir.ts', {
    cwd: 'test/tsconfig-paths',
  })
})
