import {NextRequest,NextResponse} from 'next/server';
import {localOnlyEnabled,trustedLocalRequest} from './lib/local-access';
export function proxy(request:NextRequest){
 if(localOnlyEnabled()){
  if(!trustedLocalRequest(request))return new NextResponse('This workspace is available only on this device.',{status:403,headers:{'Cache-Control':'no-store'}});
  if(request.nextUrl.pathname==='/login')return NextResponse.redirect(new URL('/',request.url));
  return NextResponse.next();
 }
 if(request.nextUrl.pathname.startsWith('/api/')||request.nextUrl.pathname==='/login')return NextResponse.next();
 if(!request.cookies.has('leadgen_session')){const url=new URL('/login',request.url);url.searchParams.set('next',request.nextUrl.pathname);return NextResponse.redirect(url);}
 return NextResponse.next();
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)']};
