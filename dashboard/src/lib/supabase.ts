import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_KEY
    if (!url || !key) {
      throw new Error(
        `Supabase env vars missing: URL=${url ? 'ok' : 'MISSING'}, KEY=${key ? 'ok' : 'MISSING'}`
      )
    }
    _supabase = createClient(url, key)
  }
  return _supabase
}

// Re-export as lazy getter for import compatibility
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
