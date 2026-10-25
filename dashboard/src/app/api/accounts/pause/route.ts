import {api} from '@/lib/backend';
export const dynamic='force-dynamic';
export async function POST(request:Request){return api(request,'accounts/pause');}
