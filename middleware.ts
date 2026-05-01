import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { jwtVerify } from 'jose'

const ADMIN_COOKIE_NAME = 'b-attendance-admin'
// IS_DEMO の判定は lib/demo.ts と同期。Supabase URL が無いと middleware が
// クラッシュするため、未設定時は強制的にデモモード扱いにする。
const IS_DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // DEMO_MODE: auth チェックをスキップ（クライアント側でセッション管理）
  if (IS_DEMO) {
    return NextResponse.next()
  }

  // Supabase session refresh（全リクエストで必要）
  const response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // セッション更新
  const { data: { session } } = await supabase.auth.getSession()

  // /admin/* → admin cookie 必須
  if (pathname.startsWith('/admin')) {
    const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value
    if (!adminToken) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    try {
      const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)
      await jwtVerify(adminToken, secret)
    } catch {
      // 無効なトークン → ログインへ
      const res = NextResponse.redirect(new URL('/login', request.url))
      res.cookies.delete(ADMIN_COOKIE_NAME)
      return res
    }
    return response
  }

  // /home, /history, /requests, /leaves, /profile → Supabase session 必須
  const userPaths = ['/home', '/history', '/requests', '/leaves', '/profile']
  if (userPaths.some(p => pathname.startsWith(p))) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
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
