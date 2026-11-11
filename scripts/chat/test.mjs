import {build} from 'esbuild';
await build({entryPoints:['src/lib/server/chat.test.ts'],outfile:'.tools/chat-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',alias:{$lib:process.cwd()+'/src/lib'},plugins:[{name:'isolated-db',setup(b){
 b.onResolve({filter:/\$env\/dynamic\/private/},()=>({path:'env',namespace:'stub'}));
 b.onResolve({filter:/server\/db$|^\.\/db$/},()=>({path:'db',namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='env'?'export const env={};':`import sqlite3 from 'sqlite3';export const db=new sqlite3.Database(':memory:');`,loader:'js',resolveDir:process.cwd()}));
}}]});
await import('../../.tools/chat-test.mjs');


