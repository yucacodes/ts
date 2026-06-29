# @yucacodes/ts

A lightweight TypeScript runtime loader for Node.js using custom import hooks. Run TypeScript and JSX files directly without pre-compilation.

## Features

- **Direct execution** - Run `.ts`, `.tsx`, `.jsx`, `.mts`, and `.cts` files without building
- **JSX support** - Transpiles JSX, honoring your tsconfig `jsx` settings (defaults to the automatic runtime)
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

The package uses Node.js [custom import hooks](https://nodejs.org/api/module.html#customization-hooks) to:

1. Intercept TypeScript file imports
2. Transpile them using the TypeScript compiler
3. Cache transpiled modules with mtime validation
4. Resolve path aliases from tsconfig.json

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

- **Caching** - Transpiled modules are cached with modification time validation
- **Lazy resolution** - Path aliases are pre-processed for O(1) exact lookups
- **Skip JS files** - JavaScript files bypass TypeScript processing entirely

## License

ISC
