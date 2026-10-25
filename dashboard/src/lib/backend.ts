import sharedRuntime from '@leadgen/runtime';
import {localOnlyEnabled,trustedLocalRequest} from './local-access';
type Data = Record<string, unknown>;
interface Backend {
  call(endpoint: string, method: string, input?: Data, query?: Record<string,string>): Promise<unknown>;
  auth: { session(request: Request): unknown; revoke(request:Request):void; validOrigin(request: Request): boolean; login(password: unknown): string | null; verify(token: string): {type?:string; email?:string; url?:string} | null };
  store: { connection(): { exec(sql:string): void; prepare(sql:string): {run(...args:unknown[]): unknown; get(...args:unknown[]): Data | undefined} }; transaction<T>(fn:()=>T):T; record(type:string,data:Data):void };
  models: { suppress(email:string,reason:string):void };
}
export const backend = sharedRuntime as Backend;
export function authorized(request:Request):boolean {
  return localOnlyEnabled()?trustedLocalRequest(request):Boolean(backend.auth.session(request));
}
function limit(key:string, maximum:number, windowMs:number) {
  const db=backend.store.connection();
  db.exec('CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
  return backend.store.transaction(()=>{
    db.prepare('DELETE FROM request_limits WHERE reset_at < ?').run(Date.now());
    const row=db.prepare('SELECT * FROM request_limits WHERE key=?').get(key);
    if(row&&Number(row.count)>=maximum)return false;
    db.prepare('INSERT INTO request_limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,1,Date.now()+windowMs);
    return true;
  });
}
export async function api(request:Request, endpoint:string):Promise<Response> {
  try {
    if(!authorized(request))return Response.json({error:localOnlyEnabled()?'This workspace is available only on this device.':'Sign in to continue'},{status:localOnlyEnabled()?403:401});
    if(!['GET','HEAD'].includes(request.method)&&!backend.auth.validOrigin(request))return Response.json({error:'Request origin was rejected'},{status:403});
    if(!limit('admin:'+endpoint,endpoint.includes('health-check')||endpoint==='inbox'?30:120,60000))return Response.json({error:'Too many requests. Try again shortly.'},{status:429});
    let body:Data={};
    if(!['GET','HEAD'].includes(request.method)){
      const raw=await request.text();if(raw.length>6*1024*1024)return Response.json({error:'Request is too large'},{status:413});
      if(raw){body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Expected a JSON object');}
    }
    const query=Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await backend.call(endpoint,request.method,body,query),{headers:{'Cache-Control':'no-store'}});
  }catch(error){const message=error instanceof Error?error.message:'Request failed';console.error('API request failed',endpoint,message.replace(/(?:password|secret|token)\s*[:=]\s*\S+/gi,'[redacted]'));return Response.json({error:message.startsWith('Missing ')||message.includes('SQLITE')?'Storage is unavailable. Check the server logs.':message},{status:400});}
}
export async function login(request:Request):Promise<Response>{
  if(localOnlyEnabled())return authorized(request)&&backend.auth.validOrigin(request)?Response.json({success:true,localOnly:true},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Request origin was rejected'},{status:403});
  if(!backend.auth.validOrigin(request))return Response.json({error:'Invalid origin'},{status:403});
  if(!limit('login',10,15*60000))return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429});
  try{const body=await request.json();const token=backend.auth.login(body.password);if(!token)return Response.json({error:'Password was not accepted'},{status:401});return Response.json({success:true},{headers:{'Set-Cookie':`leadgen_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(request.url).protocol==='https:'?'; Secure':''}`,'Cache-Control':'no-store'}});}catch{return Response.json({error:'Invalid login request'},{status:400});}
}
