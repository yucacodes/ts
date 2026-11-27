import test from 'node:test'
import assert from 'node:assert'
import { BACKENDS, execTsFile } from '../../test.assets/utils.mjs'

// This fixture's tsconfig.json sets jsx: "react-jsx" and jsxImportSource:
// "preact" and leaves the decorator options unset, so the loader's defaults
// (experimentalDecorators + emitDecoratorMetadata) apply.
for (const typescript of BACKENDS) {
  test(`tsx file with jsx runs end-to-end (${typescript})`, async () => {
    const output = await execTsFile('test/tsx/1.jsx-element.tsx', {
      typescript,
      cwd: 'test/tsx',
    })
    // `<div id="app">hello</div>` becomes a preact vnode whose `.type` is "div".
    // preact is the only JSX runtime installed, so this also proves the
    // automatic runtime and jsxImportSource were honored.
    assert.equal(output.trim(), 'div')
  })

  test(`decorators emit design:paramtypes by default (${typescript})`, async () => {
    const output = await execTsFile('test/tsx/2.decorator-metadata.ts', {
      typescript,
      cwd: 'test/tsx',
    })
    assert.deepEqual(output.trim().split('\n'), [
      'design:paramtypes=Repository',
      'decorators-ran',
    ])
  })
}
