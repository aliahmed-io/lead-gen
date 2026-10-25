import {backend} from '@/lib/backend';
export async function POST(request:Request){if(!backend.auth.session(request)||!backend.auth.validOrigin(request))return Response.json({error:'Invalid session'},{status:403});backend.auth.revoke(request);return Response.json({success:true},{headers:{'Set-Cookie':'leadgen_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}});}
