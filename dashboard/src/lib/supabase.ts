import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    `Supabase env vars missing: URL=${supabaseUrl ? 'ok' : 'MISSING'}, KEY=${supabaseKey ? 'ok' : 'MISSING'}`
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
