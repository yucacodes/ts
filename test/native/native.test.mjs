import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { BACKENDS, makeApp } from '../../test.assets/utils.mjs'

// The TypeScript 7 backend emits the project with `tsc` into a shared cache.
// These tests drive it through throwaway projects.

const tsconfig = (compilerOptions = {}, extra = {}) =>
  JSON.stringify({
    compilerOptions: { module: 'esnext', target: 'es2022', ...compilerOptions },
    include: ['src'],
    ...extra,
  })

const stampOf = (app) => {
  const [cache] = app.cacheDirs()
  return fs.statSync(path.join(cache, 'stamp.json')).mtimeMs
}

test('reuses the cache until a source changes', async () => {
  const app = makeApp({
    'tsconfig.json': tsconfig(),
    'src/main.ts': "import { name } from './name'\nconsole.log(name)\n",
    'src/name.ts': "export const name: string = 'first'\n",
  })
  assert.equal((await app.run('src/main.ts')).trim(), 'first')
  const emitted = stampOf(app)

  assert.equal((await app.run('src/main.ts')).trim(), 'first')
  assert.equal(
    stampOf(app),
    emitted,
    'an unchanged project must not be emitted again',
  )

  app.write('src/name.ts', "export const name: string = 'second'\n")
  assert.equal((await app.run('src/main.ts')).trim(), 'second')
  assert.ok(stampOf(app) > emitted, 'an edited source must trigger an emit')
})

test('picks up a file added after the last emit', async () => {
  const app = makeApp({
    'tsconfig.json': tsconfig(),
    'src/main.ts': "console.log('main')\n",
  })
  await app.run('src/main.ts')
  app.write('src/added.ts', "export const added: string = 'added'\n")
  app.write(
    'src/main.ts',
    "import { added } from './added'\nconsole.log(added)\n",
  )
  assert.equal((await app.run('src/main.ts')).trim(), 'added')
})

test('emits files outside tsconfig include on demand', async () => {
  const app = makeApp({
    'tsconfig.json': tsconfig(),
    'src/lib.ts': "export const lib: string = 'from-src'\n",
    'scripts/run.ts': "import { lib } from '../src/lib'\nconsole.log(lib)\n",
  })
  assert.equal((await app.run('scripts/run.ts')).trim(), 'from-src')
})

test('runs projects whose tsconfig sets noEmit', async () => {
  const app = makeApp({
    'tsconfig.json': tsconfig({ noEmit: true, declaration: true }),
    'src/main.ts':
      "const message: string = 'emitted anyway'\nconsole.log(message)\n",
  })
  assert.equal((await app.run('src/main.ts')).trim(), 'emitted anyway')
})

test('runs projects that import .ts extensions without emitting', async () => {
  const app = makeApp({
    'tsconfig.json': tsconfig({
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      noEmit: true,
    }),
    'src/main.ts': "import { a } from './a.ts'\nconsole.log(a)\n",
    'src/a.ts': "export const a: string = 'imported with .ts'\n",
  })
  const { stdout, stderr } = await app.exec('src/main.ts')
  assert.equal(stdout.trim(), 'imported with .ts')
  assert.equal(stderr, '', 'tsc must not report the emit-only option')
})

test('runs without a tsconfig', async () => {
  const app = makeApp({
    'main.ts': "import { two } from './two'\nconsole.log(two * 21)\n",
    'two.ts': 'export const two: number = 2\n',
  })
  assert.equal((await app.run('main.ts')).trim(), '42')
})

test('stack traces point at the TypeScript source', async () => {
  const app = makeApp({
    'tsconfig.json': tsconfig(),
    'src/main.ts': [
      'interface Boom {',
      '  message: string',
      '}',
      'const boom: Boom = { message: "boom" }',
      'throw new Error(boom.message)',
      '',
    ].join('\n'),
  })
  const error = await app.run('src/main.ts', '--enable-source-maps').then(
    () => assert.fail('the script must throw'),
    (error) => error,
  )
  assert.match(error.stderr, /src\/main\.ts:5:\d+/)
})

test('reports syntax errors', async () => {
  const app = makeApp({
    'tsconfig.json': tsconfig(),
    'src/main.ts': 'const broken: string = (\n',
  })
  const error = await app.run('src/main.ts').then(
    () => assert.fail('the script must fail'),
    (error) => error,
  )
  assert.match(error.stderr, /src\/main\.ts\(\d+,\d+\): error TS\d+/)
})

test('concurrent processes share one emit', async () => {
  const files = { 'tsconfig.json': tsconfig() }
  for (let i = 0; i < 40; i++) {
    files[`src/m${i}.ts`] = `export const m${i}: number = ${i}\n`
  }
  files['src/main.ts'] =
    Array.from(
      { length: 40 },
      (_, i) => `import { m${i} } from './m${i}'`,
    ).join('\n') +
    `\nconsole.log(${Array.from({ length: 40 }, (_, i) => `m${i}`).join(' + ')})\n`
  const app = makeApp(files)
  const outputs = await Promise.all(
    Array.from({ length: 8 }, () => app.run('src/main.ts')),
  )
  assert.deepEqual(
    outputs.map((output) => output.trim()),
    Array(8).fill(String((39 * 40) / 2)),
  )
  assert.ok(
    !fs.existsSync(path.join(app.cacheDirs()[0], 'lock')),
    'the lock is released',
  )
})

for (const typescript of BACKENDS) {
  test(`decorator metadata names types imported from other files (${typescript})`, async () => {
    const app = makeApp(
      {
        'tsconfig.json': tsconfig({
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        }),
        'src/repository.ts': 'export class Repository {}\n',
        'src/main.ts': [
          "import { Repository } from './repository'",
          ';(Reflect as any).metadata = (key: string, value: Function[]) => () => {',
          "  if (key === 'design:paramtypes') console.log(value.map((t) => t.name).join(','))",
          '}',
          'function Injectable(_target: unknown): void {}',
          '@Injectable',
          'class Service {',
          '  constructor(readonly repository: Repository, readonly label: string) {}',
          '}',
          '',
        ].join('\n'),
      },
      { typescript },
    )
    assert.equal((await app.run('src/main.ts')).trim(), 'Repository,String')
  })
}
