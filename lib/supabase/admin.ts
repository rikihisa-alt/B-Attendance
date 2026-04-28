import { createClient, SupabaseClient } from '@supabase/supabase-js'

// service_role キーを使用する管理者用クライアント
// RLS をバイパスするため、Server Component / Route Handler のみで使用すること
// 絶対にクライアントサイドに露出させないこと

let _admin: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }
  return _admin
}
