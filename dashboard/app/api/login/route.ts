import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const COOKIE_NAME = 'auth_session'
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60

/** Resolve the public origin, handling reverse proxies (e.g. Replit). */
function getPublicOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  // Browser sends 'origin' header on form POSTs — most reliable for Replit
  const browserOrigin = request.headers.get('origin')
  if (browserOrigin && browserOrigin !== 'null' && !browserOrigin.includes('0.0.0.0')) {
    return browserOrigin
  }
  // Referer header as fallback
  const referer = request.headers.get('referer')
  if (referer) {
    try { return new URL(referer).origin } catch { /* ignore */ }
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (host && !host.startsWith('0.0.0.0')) return `${proto}://${host}`
  return new URL(request.url).origin
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const password = formData.get('password')?.toString() ?? ''

  const sitePassword = process.env.SITE_PASSWORD
  if (!sitePassword) {
    return NextResponse.json({ error: 'SITE_PASSWORD not configured' }, { status: 500 })
  }

  const origin = getPublicOrigin(request)

  if (password !== sitePassword) {
    return NextResponse.redirect(`${origin}/login?error=1`)
  }

  const ts = Date.now().toString()
  const sig = createHmac('sha256', sitePassword).update(ts).digest('hex')
  const cookieValue = `${ts}.${sig}`
  const isProd = process.env.NODE_ENV === 'production'

  const response = NextResponse.redirect(`${origin}/`)
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: THIRTY_DAYS_SECONDS,
    path: '/',
  })
  return response
}
