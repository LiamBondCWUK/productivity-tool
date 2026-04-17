import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const COOKIE_NAME = 'auth_session'
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const password = formData.get('password')?.toString() ?? ''

  const sitePassword = process.env.SITE_PASSWORD
  if (!sitePassword) {
    return NextResponse.json({ error: 'SITE_PASSWORD not configured' }, { status: 500 })
  }

  if (password !== sitePassword) {
    return NextResponse.redirect(new URL('/login?error=1', request.url))
  }

  const ts = Date.now().toString()
  const sig = createHmac('sha256', sitePassword).update(ts).digest('hex')
  const cookieValue = `${ts}.${sig}`
  const isProd = process.env.NODE_ENV === 'production'

  const response = NextResponse.redirect(new URL('/', request.url))
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: THIRTY_DAYS_SECONDS,
    path: '/',
  })
  return response
}
