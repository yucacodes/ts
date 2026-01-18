import test from 'node:test'
import assert from 'node:assert'
import { execTsFile } from '../../test.assets/utils.mjs'

test('tsconfig exact path to ts file', async () => {
  const output = await execTsFile('test/tsconfig-paths/1.exact-path-to-ts-file.ts', {
    cwd: 'test/tsconfig-paths',
  })
  // Verify the exact path alias "tsfile" resolved correctly
  // Note: ts-file.ts logs a UUID when imported, so we check that output includes our verification message
  assert.ok(output.includes('tsfile-resolved'))
})

test('tsconfig exact path to ts dir', async () => {
  const output = await execTsFile('test/tsconfig-paths/2.exact-path-to-ts-dir.ts', {
    cwd: 'test/tsconfig-paths',
  })
  // Verify the directory alias "tsdir" resolved to index.ts with correct exports
  assert.equal(output.trim(), 'tsdir-resolved')
})

test('tsconfig wilcard path to ts dir', async () => {
  const output = await execTsFile('test/tsconfig-paths/3.wilcard-path-to-ts-dir.ts', {
    cwd: 'test/tsconfig-paths',
  })
  // Verify the wildcard alias "tsdir/*" resolved correctly to individual files
  assert.equal(output.trim(), 'wildcard-resolved')
})
