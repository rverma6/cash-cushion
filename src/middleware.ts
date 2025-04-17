import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Create an unmodified response object
  let response = NextResponse.next({
    request: {
      headers: request.headers, // Pass original headers
    },
  })

  // Create the Supabase client using the request & response context
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY!,
    {
      cookies: {
        // Define how to get cookies from the request
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        // Define how to set cookies on the response
        set(name: string, value: string, options: CookieOptions) {
          // Ensure the request cookies are updated for subsequent operations in the same request flow
          request.cookies.set({ name, value, ...options })
          // Update the response object to send the cookie back to the browser
          response = NextResponse.next({ // Recreate response to apply updated cookies
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        // Define how to remove cookies from the response
        remove(name: string, options: CookieOptions) {
           // Ensure the request cookies are updated for subsequent operations
          request.cookies.set({ name, value: '', ...options })
           // Update the response object to remove the cookie
          response = NextResponse.next({ // Recreate response to apply updated cookies
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // IMPORTANT: Refresh session - required for Server Components
  // Calling getUser() ensures the session is updated automatically based on cookies
  // It also returns the user data, but we often just need the side effect here.
  // If there's an error (e.g., invalid session), getUser() handles it gracefully.
  await supabase.auth.getUser()

  // Return the potentially modified response object (with updated cookies)
  return response
}

// Configure the middleware path matching
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - /auth/ (authentication specific routes - login, callback, etc.) Adjust as needed.
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/).*)',
  ],
}
