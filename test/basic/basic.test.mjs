import test from 'node:test'
import assert from 'node:assert'
import { execTsFile } from '../../test.assets/utils.mjs'

test('console log hello', async () => {
  const output = await execTsFile('test/basic/1.console-log-hello.ts')
  assert.equal(output.trim(), 'hello')
})

test('import common js module ', async () => {
  const output = await execTsFile('test/basic/2.import-commonjs-module.ts')
  // Should output a UUID string (non-empty)
  assert.ok(output.trim().length > 0)
})

test('import esm module ', async () => {
  const output = await execTsFile('test/basic/3.import-esm-module.ts')
  // isString('hi') should return true
  assert.equal(output.trim(), 'true')
})

test('import common js file', async () => {
  const output = await execTsFile('test/basic/4.import-commonjs-file.ts')
  // Should output a UUID string from the commonjs file
  assert.ok(output.trim().length > 0)
})

test('import esm file', async () => {
  const output = await execTsFile('test/basic/5.import-esm-file.ts')
  // The esm-file.mjs exports `a` which is isString('hi') === true
  assert.equal(output.trim(), 'true')
})

test('import typescript file', async () => {
  const output = await execTsFile('test/basic/6.import-ts-file.ts')
  // Should output a UUID string, and also the UUID from the imported ts-file
  const lines = output.trim().split('\n')
  assert.ok(lines.length >= 2) // At least 2 UUIDs
  assert.ok(lines.every((line) => line.length > 0))
})

test('import json file', async () => {
  const output = await execTsFile('test/basic/7.import-json-file.ts')
  // Should output the JSON object
  assert.equal(output.trim(), '{"key":"value"}')
})
