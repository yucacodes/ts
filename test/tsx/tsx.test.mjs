import test from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execTsFile } from '../../test.assets/utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Drive the real loader against this fixture's tsconfig.json (jsx: "react-jsx",
// jsxImportSource: "preact"). The loader reads tsconfig from cwd at import time,
// so chdir before importing it. `node --test` runs each test file in its own
// process, so this chdir is isolated to this file.
process.chdir(__dirname)
const hooks = await import('../../src/custom-import-hooks.mjs')

function loadSource(fixture) {
  const url = pathToFileURL(path.join(__dirname, fixture)).toString()
  return hooks.load(url, {}, () => {
    throw new Error('nextLoad should not be called for a TypeScript file')
  })
}

test('tsx file with jsx runs end-to-end', async () => {
  const output = await execTsFile('test/tsx/1.jsx-element.tsx', {
    cwd: 'test/tsx',
  })
  // `<div id="app">hello</div>` becomes a preact vnode whose `.type` is "div".
  assert.equal(output.trim(), 'div')
})

test('tsx transpiles to the tsconfig-configured jsx runtime', async () => {
  const { source } = await loadSource('1.jsx-element.tsx')
  assert.ok(
    source.includes('from "preact/jsx-runtime"'),
    `expected automatic preact jsx runtime import, got:\n${source}`,
  )
})

test('decorated ts file still runs end-to-end', async () => {
  const output = await execTsFile('test/tsx/2.decorator-metadata.ts', {
    cwd: 'test/tsx',
  })
  assert.equal(output.trim(), 'decorators-ran')
})

test('emitDecoratorMetadata still emits design:paramtypes', async () => {
  const { source } = await loadSource('2.decorator-metadata.ts')
  assert.ok(
    source.includes('__metadata("design:paramtypes"'),
    `expected design:paramtypes metadata emit, got:\n${source}`,
  )
})
