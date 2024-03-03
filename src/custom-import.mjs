import { register } from 'node:module';

register('./custom-import-hooks.mjs', import.meta.url);