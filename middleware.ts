import { NextResponse, type NextRequest } from "next/server";
export function middleware(request: NextRequest){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key=(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  const configured=Boolean(url&&key&&url.startsWith("https://")&&!key.includes("replace-with"));
  if(!configured&&request.nextUrl.pathname!=="/setup"){const next=request.nextUrl.clone();next.pathname="/setup";next.search="";return NextResponse.redirect(next);}
  if(configured&&request.nextUrl.pathname==="/setup"){const next=request.nextUrl.clone();next.pathname="/login";return NextResponse.redirect(next);}
  return NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]};
