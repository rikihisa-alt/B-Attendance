import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const ADMIN_COOKIE_NAME = 'b-attendance-admin'

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret) throw new Error('ADMIN_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

/** 管理者ログイン成功時にJWTを発行してcookieに保存 */
export async function setAdminSession() {
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret())

  const cookieStore = cookies()
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  })
}

/** 管理者cookieを検証 */
export async function verifyAdminSession(): Promise<boolean> {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value
    if (!token) return false
    await jwtVerify(token, getSecret())
    return true
  } catch {
    return false
  }
}

/** 管理者セッション削除 */
export async function clearAdminSession() {
  const cookieStore = cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
}

export { ADMIN_COOKIE_NAME }
