import {build} from 'esbuild';import {mkdirSync} from 'node:fs';mkdirSync('.tools',{recursive:true});
await build({entryPoints:['src/lib/server/sos-ingest.test.ts'],outfile:'.tools/sos-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
await import('../../.tools/sos-test.mjs');
