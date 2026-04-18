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
    const html = `<html><head><meta http-equiv="refresh" content="0;url=/login?error=1"><script>window.location.replace('/login?error=1')</script></head></html>`
    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
  }

  const ts = Date.now().toString()
  const sig = createHmac('sha256', sitePassword).update(ts).digest('hex')
  const cookieValue = `${ts}.${sig}`

  const html = `<html><head><meta http-equiv="refresh" content="0;url=/"><script>window.location.replace('/')</script></head></html>`
  const response = new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: THIRTY_DAYS_SECONDS,
    path: '/',
  })
  return response
}
