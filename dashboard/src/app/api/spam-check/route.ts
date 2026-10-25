import {api} from '@/lib/backend';
export async function POST(request:Request){return api(request,'spam-check');}
