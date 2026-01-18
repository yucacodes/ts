import { ts1 } from "tsdir/ts1";
import { ts2 } from "tsdir/ts2";
// Test that the wildcard alias "tsdir/*" resolves correctly
console.log(ts1 === 'ts1' && ts2 === 'ts2' ? 'wildcard-resolved' : 'failed');

