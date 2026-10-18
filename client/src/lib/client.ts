import { createBrowserClient } from '@supabase/ssr'

export function readOAuthCallback() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return {
    present: query.has('code') || query.has('error') || hash.has('access_token') || hash.has('error'),
    error: query.get('error_description') || hash.get('error_description'),
  };
}

export function createClient() {
  return createBrowserClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
  )
}
