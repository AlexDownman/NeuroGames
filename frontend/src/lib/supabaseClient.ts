import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars are missing. Copy frontend/.env.example to frontend/.env and fill in VITE_SUPABASE_ANON_KEY. ' +
      'Falling back to a placeholder client so pages that don\'t need Supabase still render; any real call will fail until it\'s set.',
  )
}

// Fall back to placeholders rather than letting createClient throw: a
// missing key would otherwise crash the whole React tree at import time,
// including pages (like the landing page) that never touch Supabase.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)

export type AccountRole = 'teacher' | 'student'
