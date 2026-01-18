import { a, ts1, ts2 } from "tsdir";
// Test that the directory alias "tsdir" resolves to index.ts
console.log(a === 5 && ts1 === 'ts1' && ts2 === 'ts2' ? 'tsdir-resolved' : 'failed');
