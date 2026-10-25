'use strict';
function parseCsv(text) {
  const rows=[]; let row=[],value='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) { const c=text[i];
    if(c==='"') { if(quoted&&text[i+1]==='"'){value+='"';i++;}else if(quoted||value==='')quoted=!quoted;else throw new Error('Unexpected quote in CSV'); }
    else if(!quoted&&(c===','||c==='\n'||c==='\r')) {row.push(value);value='';if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x.trim()))rows.push(row);row=[];}}
    else value+=c;
  }
  if(quoted)throw new Error('Unclosed CSV quote'); if(value||row.length){row.push(value);rows.push(row);}return rows;
}
function encodeCsv(rows) {return rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
module.exports={parseCsv,encodeCsv};
