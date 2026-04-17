import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'auth_session'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function verifyCookie(value: string | undefined): boolean {
  if (!value) return false
  const parts = value.split('.')
  if (parts.length !== 2) return false
  const [tsStr, provided] = parts
  const ts = parseInt(tsStr, 10)
  if (isNaN(ts)) return false
  const age = Date.now() - ts
  if (age < 0 || age > THIRTY_DAYS_MS) return false
  const password = process.env.SITE_PASSWORD ?? ''
  const expected = createHmac('sha256', password).update(tsStr).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

const PUBLIC_PATHS = ['/login', '/api/login', '/favicon.ico']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }
  const cookie = request.cookies.get(COOKIE_NAME)?.value
  if (!verifyCookie(cookie)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
