import { NextResponse } from 'next/server';

const INTERNAL = ['/dashboard', '/jobs', '/candidates', '/pipeline', '/reports', '/assistant', '/ai-screening', '/cv-checker', '/payments', '/ats-cv-filter', '/settings'];
const AUTH_PAGES = ['/login', '/forgot-password'];
// Job seeker area: its own session cookie, separate from staff sign-in
const SEEKER_AUTH_PAGES = ['/my/login', '/my/signup'];

const under = (pathname, p) => pathname === p || pathname.startsWith(`${p}/`);

// Fast cookie-presence check; the API is the real authority and rejects invalid sessions.
export function middleware(req) {
  const { pathname, search } = req.nextUrl;

  if (under(pathname, '/my')) {
    const seeker = Boolean(req.cookies.get('seeker_token')?.value);
    if (seeker && SEEKER_AUTH_PAGES.includes(pathname)) return NextResponse.redirect(new URL('/my', req.url));
    if (!seeker && !SEEKER_AUTH_PAGES.includes(pathname)) return NextResponse.redirect(new URL('/my/login', req.url));
    return NextResponse.next();
  }

  const signedIn = Boolean(req.cookies.get('ats_token')?.value);
  if (!signedIn && INTERNAL.some((p) => under(pathname, p))) {
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
  matcher: ['/dashboard/:path*', '/jobs/:path*', '/candidates/:path*', '/pipeline/:path*', '/reports/:path*', '/assistant/:path*', '/ai-screening/:path*', '/cv-checker/:path*', '/payments/:path*', '/ats-cv-filter/:path*', '/settings/:path*', '/login', '/forgot-password', '/my/:path*'],
};
