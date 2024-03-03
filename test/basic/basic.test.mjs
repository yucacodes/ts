import test from 'node:test'
import assert from 'node:assert'
import { execTsFile } from '../../test.assets/utils.mjs'

test('console log hello', async () => {
  const out = await execTsFile('./test/basic/1.console-log-hello.ts')
  assert.equal(out, 'hello\n')
})

test('import common js module ', async () => {
  await execTsFile('./test/basic/2.import-commonjs-module.ts')
})

test('import esm module ', async () => {
  await execTsFile('./test/basic/3.import-esm-module.ts')
})

test('import common js file', async () => {
  await execTsFile('./test/basic/4.import-commonjs-file.ts')
})

test('import esm file', async () => {
  await execTsFile('./test/basic/5.import-esm-file.ts')
})

test('import typescript file', async () => {
  await execTsFile('./test/basic/6.import-ts-file.ts')
})

test('import json file', async () => {
  await execTsFile('./test/basic/7.import-json-file.ts')
})
