'use strict';
const {spawn}=require('child_process');
const executable=require('./node-runtime.cjs').executable();
const child=spawn(executable,['--experimental-sqlite',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true,env:{...process.env,LEADGEN_NODE:executable}});
child.on('error',()=>{console.error('Project Node runtime could not start.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
