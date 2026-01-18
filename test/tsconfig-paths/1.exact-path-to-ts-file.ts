import { generate } from "tsfile";
// Test that the exact path alias "tsfile" resolves correctly
console.log(typeof generate === 'function' ? 'tsfile-resolved' : 'failed');
