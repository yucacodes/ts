# @yucacodes/ts

A lightweight TypeScript runtime loader for Node.js using custom import hooks. Run TypeScript and JSX files directly without pre-compilation.

Works with TypeScript 7 (the native compiler) and with TypeScript 6 and earlier.

## Features

- **Direct execution** - Run `.ts`, `.tsx`, `.jsx`, `.mts`, and `.cts` files without building
- **JSX support** - Transpiles JSX, honoring your tsconfig `jsx` settings (defaults to the automatic runtime)
- **TypeScript 7** - Uses the native compiler when the project has it, with a disk cache shared across processes
- **Decorator metadata** - Emits `design:paramtypes` via the real TypeScript compiler, so dependency-injection frameworks keep working
- **tsconfig.json support** - Automatically loads and applies your TypeScript configuration
- **Path aliases** - Full support for `paths` in tsconfig.json (exact matches and wildcards)
- **Fast resolution** - Optimized with caching for alias paths and transpiled modules
- **Zero configuration** - Works out of the box with sensible defaults
- **Module interop** - Import CommonJS, ESM, JSON, and TypeScript files seamlessly

## Installation

```bash
npm install @yucacodes/ts
```

## Usage

### CLI

Run any TypeScript file directly:

```bash
yts your-script.ts
```

### Programmatic

Use as a loader with Node.js:

```bash
node --import @yucacodes/ts your-script.ts
```

## Configuration

Create a `tsconfig.json` in your project root:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2015",
    "paths": {
      "@models/*": ["./src/models/*"],
      "@utils": ["./src/utils/index.ts"]
    }
  }
}
```

The loader will automatically:
- Find and load `tsconfig.json` from your working directory
- Apply your compiler options
- Resolve path aliases

### JSX

JSX is enabled by default using the automatic runtime (`react-jsx`). Point it at
your renderer with `jsxImportSource`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

`jsx`, `jsxImportSource`, `jsxFactory`, and `jsxFragmentFactory` are all read
from your `tsconfig.json`. Then run `.tsx`/`.jsx` files directly:

```bash
yts your-component.tsx
```

## How It Works

The package uses Node.js [custom import hooks](https://nodejs.org/api/module.html#customization-hooks)
to resolve path aliases from `tsconfig.json` and to load TypeScript files. How
files are compiled depends on the TypeScript version the project installs
(resolved from the working directory):

### TypeScript 7

TypeScript 7 ships the native `tsc` executable but no JavaScript compiler API.
At startup the loader runs `tsc --noCheck` once over the whole project (the
files your `tsconfig.json` includes) and serves the emitted JavaScript from a
cache in `node_modules/.cache/yts`:

- When neither `tsconfig.json` nor any project file changed since the last
  emit, startup runs no compiler at all.
- Every process shares the cache: under `node --test`, one worker emits while
  the others wait and reuse its output.
- Each module is checked against its source when loaded, so files edited or
  added later are emitted on demand. Files outside `include` are emitted with a
  one-file config that extends yours.
- The compiler sees the whole program, so decorator metadata names the actual
  types (`design:paramtypes` is `[Repository]`, not a runtime guess).
- Output carries inline source maps pointing at your `.ts` files (run with
  `--enable-source-maps` for TypeScript stack traces).
- Syntax and configuration errors are printed the way `tsc` prints them; type
  errors are not checked (run `tsc --noEmit` for that).

The loader overrides the options that would stop emission (`noEmit`,
`declaration`, `composite`, `incremental`, `outDir`, `sourceMap`) and, where your
config leaves them unset, turns on `experimentalDecorators`,
`emitDecoratorMetadata`, `jsx: "react-jsx"` and `module: "esnext"`.

Changes to a config your `tsconfig.json` `extends` are not detected; delete
`node_modules/.cache/yts` after editing one.

### TypeScript 6 and earlier

Each imported file is transpiled in process with `ts.transpileModule` and
cached in memory with modification time validation.

## Supported Features

- TypeScript transpilation (`.ts`, `.tsx`, `.jsx`, `.mts`, `.cts` files)
- JSX transpilation (automatic, classic, or custom factory via tsconfig)
- Decorator metadata emission (`experimentalDecorators` + `emitDecoratorMetadata`)
- Path alias resolution (exact and wildcard patterns)
- CommonJS and ESM module imports
- JSON imports
- Source maps for debugging
- Module format detection (CommonJS/ESM based on tsconfig)

## Performance

The loader includes several optimizations:

- **Caching** - TypeScript 7 output is cached on disk and shared across processes; with TypeScript 6 and earlier, transpiled modules are cached in memory with modification time validation
- **Lazy resolution** - Path aliases are pre-processed for O(1) exact lookups
- **Skip JS files** - JavaScript files bypass TypeScript processing entirely

## License

ISC
