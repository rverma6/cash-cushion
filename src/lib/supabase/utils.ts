import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'; // For type safety if needed, often inferred

/**
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers where cookie manipulation (read/write) is needed.
 */
export async function createServerActionClient() {
  // cookies() must be called within a Server Component, Action, or Route Handler
  const cookieStore = await cookies() // <-- Added await

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // The `set` method is called automatically by Supabase JS
            // libraries when session changes occur.
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
            console.warn(`Supabase Server Client: Failed to set cookie '${name}' from a Server Component context. This is often safe if middleware is running. Error: ${error}`);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
             // The `remove` method is called automatically by Supabase JS
             // libraries when session changes occur (e.g., sign out).
            cookieStore.set({ name, value: '', ...options }) // Use set with empty value for removal
          } catch (error) {
            // The `delete/remove` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
             console.warn(`Supabase Server Client: Failed to remove cookie '${name}' from a Server Component context. This is often safe if middleware is running. Error: ${error}`);
          }
        },
      },
    }
  )
}

/**
 * Creates a Supabase client primarily for *reading* data in Server Components
 * where cookie writing isn't expected or needed.
 */
export async function createServerComponentClient() {
    const cookieStore: ReadonlyRequestCookies = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                // NOTE: No 'set' or 'remove' methods provided. If the client
                // attempts an operation that requires setting/removing cookies,
                // it might not persist the auth state correctly without middleware.
            },
        }
    );
}

// Define a no-op cookie handler for the service role client
const noopCookieMethods = {
  get(_name: string) {
    return undefined;
  },
  // Provide getAll for compatibility if needed by the type
  getAll() {
    return [];
  },
  set(_name: string, _value: string, _options: CookieOptions) {
    // No-op
  },
  remove(_name: string, _options: CookieOptions) {
    // No-op (in some older versions, this might be `delete`)
  },
};

/**
 * Creates a Supabase client using the Service Role Key.
 * WARNING: Use only in secure server environments (Route Handlers, Server Actions).
 * This client bypasses Row Level Security (RLS). NEVER expose this client
 * or the SERVICE_ROLE_KEY to the browser.
 */
export function createServiceRoleClient() {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.");
    }
    // Uses the Service Role Key - bypasses RLS
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                // Avoid interfering with user sessions
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
            // Pass the no-op cookie handler to satisfy the type
            cookies: noopCookieMethods,
        }
    );
}
