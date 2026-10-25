'use strict';
const {spawn,fork}=require('child_process');
const path=require('path');
const root=path.resolve(__dirname,'..');const nodePath=require('./node-runtime.cjs').executable();
require('dotenv').config({path:path.join(root,'.env'),quiet:true});
const command=process.argv[2]||'dev';
// Password-free mode is local to this device. Never accept a hostname override
// while it is enabled, even if extra Next CLI arguments are supplied.
process.env.LEADGEN_LOCAL_ONLY??='1';
if(!['0','1'].includes(process.env.LEADGEN_LOCAL_ONLY))throw new Error('LEADGEN_LOCAL_ONLY must be 0 or 1');
if(process.env.LEADGEN_LOCAL_ONLY==='1'&&process.argv.slice(3).some(arg=>arg.startsWith('-H')||arg==='--hostname'||arg.startsWith('--hostname=')))throw new Error('Local-only mode binds to 127.0.0.1; hostname overrides are not allowed.');
// Dashboard startup also starts protection, never the email sender.
const monitor=['dev','start'].includes(command)?fork(path.join(root,'runtime/monitor-service.js'),[],{cwd:root,execPath:nodePath,execArgv:['--experimental-sqlite'],windowsHide:true,stdio:['ignore','inherit','inherit','ipc']}):null;
const child=spawn(nodePath,['--experimental-sqlite',path.join(root,'dashboard/node_modules/next/dist/bin/next'),command,...(command==='dev'?['--webpack','--hostname','127.0.0.1']:command==='start'?['--hostname','127.0.0.1']:command==='build'?['--webpack']:[]),...process.argv.slice(3)],{cwd:path.join(root,'dashboard'),stdio:'inherit',windowsHide:true,env:{...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS||'','--experimental-sqlite'].join(' ')}});
child.on('exit',code=>{monitor?.kill('SIGTERM');process.exitCode=code||0;});
monitor?.on('error',()=>console.error('Account monitor could not start; live sending stays blocked without its heartbeat.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.kill(signal);monitor?.kill(signal);});
