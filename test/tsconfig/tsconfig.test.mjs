import test from 'node:test'
import { execTsFile } from '../../test.assets/utils.mjs'
import assert from 'node:assert'

test('working dir tsconfig', async () => {
  const logs = await execTsFile('test/tsconfig/1.working-dir-tsconfig.ts', {
    cwd: 'test/tsconfig',
  })
  assert.equal(logs.includes('tsconfig.json'), true)
})
