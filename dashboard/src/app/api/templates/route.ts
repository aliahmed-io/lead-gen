import {api} from '@/lib/backend';
export const dynamic='force-dynamic';
export async function GET(request:Request){return api(request,'templates');}
export async function POST(request:Request){return api(request,'templates');}
