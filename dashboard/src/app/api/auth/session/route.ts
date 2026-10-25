import {authorized} from '@/lib/backend';
import {localOnlyEnabled} from '@/lib/local-access';
export async function GET(request:Request){const authenticated=authorized(request);return Response.json({authenticated,localOnly:localOnlyEnabled()},{status:authenticated?200:localOnlyEnabled()?403:401,headers:{'Cache-Control':'no-store'}});}
