import test from 'node:test'
import { BACKENDS, execTsFile } from '../../test.assets/utils.mjs'
import assert from 'node:assert'

for (const typescript of BACKENDS) {
  test(`working dir tsconfig (${typescript})`, async () => {
    const output = await execTsFile('test/tsconfig/1.working-dir-tsconfig.ts', {
      typescript,
      cwd: 'test/tsconfig',
    })
    // Verify the file executed successfully with the tsconfig applied
    // The tsconfig.json sets module: "commonjs" which should allow the file to run
    assert.equal(output.includes('tsconfig test executed successfully'), true)
  })
}
