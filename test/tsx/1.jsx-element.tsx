// Fixture: a .tsx file that uses JSX.
// With `jsx: "react-jsx"` and `jsxImportSource: "preact"` (see tsconfig.json),
// this transpiles to an import from "preact/jsx-runtime". preact is the only
// JSX runtime installed, so a successful run proves both that JSX is enabled and
// that `jsxImportSource` is honored from tsconfig.
const el = <div id="app">hello</div>
console.log(el.type)
