import {api} from '@/lib/backend';
export const dynamic='force-dynamic';
export async function GET(request:Request){return api(request,'leads');}
export async function POST(request:Request){return api(request,'leads');}
export async function DELETE(request:Request){return api(request,'leads');}
