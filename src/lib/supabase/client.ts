import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates a Supabase client for use in Client Components.
 * This client uses the public keys and interacts with the browser's context.
 * IMPORTANT: This should only be imported into Client Components.
 */
export function createClient() {
  // Uses environment variables directly available to the client browser
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY!
  )
} 