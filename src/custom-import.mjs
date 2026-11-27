import { register } from 'node:module'
import { findTypeScript } from './typescript.mjs'

const typescript = findTypeScript()

if (typescript.major >= 7) {
  // TypeScript 7: emit the project with the native compiler, serve from cache.
  const { NativeEmitter } = await import('./native-emit.mjs')
  const options = {
    cwd: process.cwd(),
    typescriptPkgJson: typescript.pkgJson,
    typescriptVersion: typescript.version,
  }
  const stamp = new NativeEmitter(options).prepare()
  register('./native-hooks.mjs', import.meta.url, {
    data: { emitter: options, compilerOptions: stamp?.compilerOptions },
  })
} else {
  // TypeScript 6 and earlier: transpile each module with the compiler API.
  register('./custom-import-hooks.mjs', import.meta.url)
}
