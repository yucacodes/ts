# @yucacodes/ts

A lightweight TypeScript runtime loader for Node.js using custom import hooks. Run TypeScript files directly without pre-compilation.

## Features

- **Direct execution** - Run `.ts` files without building
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

## How It Works

The package uses Node.js [custom import hooks](https://nodejs.org/api/module.html#customization-hooks) to:

1. Intercept TypeScript file imports
2. Transpile them using the TypeScript compiler
3. Cache transpiled modules with mtime validation
4. Resolve path aliases from tsconfig.json

## Supported Features

- TypeScript transpilation (`.ts` files)
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
