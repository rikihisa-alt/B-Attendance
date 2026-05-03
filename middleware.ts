import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const ADMIN_COOKIE_NAME = 'b-attendance-admin'
const USER_COOKIE_NAME = 'b-attendance-user'
// IS_DEMO の判定は lib/demo.ts と同期。Supabase URL 未設定時はデモ扱い。
const IS_DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // DEMO_MODE: auth チェックをスキップ（クライアント側でセッション管理）
  if (IS_DEMO) {
    return NextResponse.next()
  }

  const response = NextResponse.next({ request: { headers: request.headers } })
  const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

  // /admin/* → admin cookie 必須
  if (pathname.startsWith('/admin')) {
    const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value
    if (!adminToken) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    try {
      await jwtVerify(adminToken, secret)
    } catch {
      const res = NextResponse.redirect(new URL('/login', request.url))
      res.cookies.delete(ADMIN_COOKIE_NAME)
      return res
    }
    return response
  }

  // /home, /history, /requests, /leaves, /profile → user cookie 必須
  const userPaths = ['/home', '/history', '/requests', '/leaves', '/profile']
  if (userPaths.some(p => pathname.startsWith(p))) {
    const userToken = request.cookies.get(USER_COOKIE_NAME)?.value
    if (!userToken) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    try {
      await jwtVerify(userToken, secret)
    } catch {
      const res = NextResponse.redirect(new URL('/login', request.url))
      res.cookies.delete(USER_COOKIE_NAME)
      return res
    }
    return response
  }

  return response
}

export const config = {
  matcher: [
    '/home/:path*',
    '/history/:path*',
    '/requests/:path*',
    '/leaves/:path*',
    '/profile/:path*',
    '/admin/:path*',
  ],
}
