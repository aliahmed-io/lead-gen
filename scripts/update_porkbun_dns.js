'use strict';
// Provider DNS must be reviewed against the actual provider values before changes.
async function addPorkbunDns(){throw new Error('Automatic DNS mutation is retired. Configure SPF, DKIM and DMARC in your provider, then run authenticated Accounts diagnostics. No provider change was made.');}
module.exports={addPorkbunDns};
if(require.main===module){console.log('Use your provider console to review DNS records. This helper performs no writes.');}
