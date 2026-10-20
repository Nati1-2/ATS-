import { NextResponse } from 'next/server';

const INTERNAL = ['/dashboard', '/jobs', '/candidates', '/pipeline', '/reports', '/assistant', '/ai-screening', '/cv-checker', '/settings'];
const AUTH_PAGES = ['/login', '/forgot-password'];

// Fast cookie-presence check; the API is the real authority and rejects invalid sessions.
export function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const signedIn = Boolean(req.cookies.get('ats_token')?.value);

  if (!signedIn && INTERNAL.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/jobs/:path*', '/candidates/:path*', '/pipeline/:path*', '/reports/:path*', '/assistant/:path*', '/ai-screening/:path*', '/cv-checker/:path*', '/settings/:path*', '/login', '/forgot-password'],
};
