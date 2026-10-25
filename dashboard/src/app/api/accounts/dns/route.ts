import {api} from '@/lib/backend';
export async function GET(request:Request){return api(request,'accounts/dns');}
