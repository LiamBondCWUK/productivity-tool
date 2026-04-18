import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'auth_session'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

async function verifyCookie(value: string | undefined): Promise<boolean> {
  const password = process.env.SITE_PASSWORD
  if (!password || !value) return false
  const parts = value.split('.')
  if (parts.length !== 2) return false
  const [tsStr, provided] = parts
  const ts = parseInt(tsStr, 10)
  if (isNaN(ts)) return false
  const age = Date.now() - ts
  if (age < 0 || age > THIRTY_DAYS_MS) return false
  // Use Web Crypto API (Edge Runtime compatible)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(tsStr))
  const expected = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
  // Constant-time comparison
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

const PUBLIC_PATHS = ['/login', '/api/login', '/favicon.ico']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }
  const cookie = request.cookies.get(COOKIE_NAME)?.value
  if (!(await verifyCookie(cookie))) {
    // Use x-forwarded-host so redirect works behind Replit's reverse proxy
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const origin = appUrl ?? (host ? `${proto}://${host}` : new URL(request.url).origin)
    return NextResponse.redirect(`${origin}/login`)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
