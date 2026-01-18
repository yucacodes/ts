import test from 'node:test'
import { execTsFile } from '../../test.assets/utils.mjs'
import assert from 'node:assert'

test('working dir tsconfig', async () => {
  const output = await execTsFile('test/tsconfig/1.working-dir-tsconfig.ts', {
    cwd: 'test/tsconfig',
  })
  // Verify the file executed successfully with the tsconfig applied
  // The tsconfig.json sets module: "commonjs" which should allow the file to run
  assert.equal(output.includes('tsconfig test executed successfully'), true)
})
