'use strict';
const fs=require('fs'),path=require('path');
function executable(){const portable=path.resolve(__dirname,'../.runtime/node-v22.23.4-win-x64/node.exe');if(process.platform==='win32'&&fs.existsSync(portable))return portable;const [major,minor,patch]=process.versions.node.split('.').map(Number);if(major>22||major===22&&(minor>23||minor===23&&patch>=4))return process.execPath;throw new Error('Use a patched Node runtime: run scripts/setup-node.ps1 on Windows, or install Node 22.23.4 or a current supported patched LTS.');}
module.exports={executable};
