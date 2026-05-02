// 統一API呼び出しヘルパー
// DEMO_MODE の時は /api/demo に、通常時は各APIに振り分け

// IS_DEMO の判定は lib/demo.ts と同期させる（Supabase URL 未設定で自動 fallback）
const IS_DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function demoCall(action: string, params: Record<string, any> = {}) {
  const res = await fetch('/api/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  return res
}

export async function apiLoginUser(empId: string, password: string) {
  if (IS_DEMO) return demoCall('login-user', { empId, password })
  return fetch('/api/auth/login-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empId, password }) })
}

export async function apiLoginAdmin(password: string, id?: string) {
  if (IS_DEMO) return demoCall('login-admin', { password, id })
  return fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, id }) })
}

export async function apiLogout() {
  if (IS_DEMO) return demoCall('logout')
  return fetch('/api/auth/logout', { method: 'POST' })
}

export async function apiGetSession() {
  if (IS_DEMO) return demoCall('get-session')
  // 通常モードではSupabaseセッションを使うため不要
  return new Response(JSON.stringify({ session: null }))
}

export async function apiGetEmployee(empId: string) {
  if (IS_DEMO) return demoCall('get-employee', { empId })
  return new Response(JSON.stringify({ data: null }))
}

export async function apiGetEmployees(status?: string) {
  if (IS_DEMO) return demoCall('get-employees', { status })
  return new Response(JSON.stringify({ data: [] }))
}

export async function apiClock(empId: string, type: string) {
  if (IS_DEMO) return demoCall('clock', { empId, type })
  return fetch('/api/attendance/clock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) })
}

export async function apiCancelClock(empId: string, type: string) {
  if (IS_DEMO) return demoCall('cancel', { empId, type })
  return fetch('/api/attendance/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) })
}

export async function apiGetAttendance(empId: string, startDate: string, endDate: string) {
  if (IS_DEMO) return demoCall('get-attendance', { empId, startDate, endDate })
  return new Response(JSON.stringify({ data: [] }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiSubmitCorrection(params: any) {
  if (IS_DEMO) return demoCall('submit-correction', params)
  return new Response(JSON.stringify({ success: true }))
}

export async function apiGetCorrections(empId?: string, status?: string) {
  if (IS_DEMO) return demoCall('get-corrections', { empId, status })
  return new Response(JSON.stringify({ data: [] }))
}

export async function apiWithdrawCorrection(id: string) {
  if (IS_DEMO) return demoCall('withdraw-correction', { id })
  return new Response(JSON.stringify({ success: true }))
}

export async function apiApproveCorrection(id: string) {
  if (IS_DEMO) return demoCall('approve-correction', { id })
  return new Response(JSON.stringify({ success: true }))
}

export async function apiRejectCorrection(id: string, reason: string) {
  if (IS_DEMO) return demoCall('reject-correction', { id, reason })
  return new Response(JSON.stringify({ success: true }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiSubmitLeave(params: any) {
  if (IS_DEMO) return demoCall('submit-leave', params)
  return new Response(JSON.stringify({ success: true }))
}

export async function apiGetLeaves(empId?: string, status?: string) {
  if (IS_DEMO) return demoCall('get-leaves', { empId, status })
  return new Response(JSON.stringify({ data: [] }))
}

export async function apiWithdrawLeave(id: string) {
  if (IS_DEMO) return demoCall('withdraw-leave', { id })
  return new Response(JSON.stringify({ success: true }))
}

export async function apiApproveLeave(id: string) {
  if (IS_DEMO) return demoCall('approve-leave', { id })
  return new Response(JSON.stringify({ success: true }))
}

export async function apiRejectLeave(id: string, reason: string) {
  if (IS_DEMO) return demoCall('reject-leave', { id, reason })
  return new Response(JSON.stringify({ success: true }))
}

export async function apiGetSettings() {
  if (IS_DEMO) return demoCall('get-settings')
  return new Response(JSON.stringify({ data: null }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiUpdateSettings(updates: any) {
  if (IS_DEMO) return demoCall('update-settings', { updates })
  return new Response(JSON.stringify({ success: true }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiCreateEmployee(employee: any, password: string) {
  if (IS_DEMO) return demoCall('create-employee', { employee, password })
  return new Response(JSON.stringify({ success: true }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiUpdateEmployee(empId: string, updates: any) {
  if (IS_DEMO) return demoCall('update-employee', { empId, updates })
  return new Response(JSON.stringify({ success: true }))
}

export async function apiResetPassword(empId: string, newPassword: string) {
  if (IS_DEMO) return demoCall('reset-password', { empId, newPassword })
  return new Response(JSON.stringify({ success: true }))
}

export async function apiChangePassword(empId: string, currentPassword: string, newPassword: string) {
  if (IS_DEMO) return demoCall('change-password', { empId, currentPassword, newPassword })
  return new Response(JSON.stringify({ success: true }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiUpdateAttendance(params: any) {
  if (IS_DEMO) return demoCall('update-attendance', params)
  return new Response(JSON.stringify({ success: true }))
}

export { IS_DEMO }
