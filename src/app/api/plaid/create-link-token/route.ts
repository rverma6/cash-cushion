import { NextRequest, NextResponse } from 'next/server';
import {
    PlaidApi,
    Configuration,
    PlaidEnvironments,
    LinkTokenCreateRequest,
    Products,
    CountryCode,
} from 'plaid';
// Import the server client utility
import { createServerActionClient } from '@/lib/supabase/utils';

// --- Plaid Client Setup (Can still be defined outside if config is static) ---
const plaidConfig = new Configuration({
    basePath: PlaidEnvironments.sandbox, // Adjust for environment
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
            'PLAID-SECRET': process.env.PLAID_SANDBOX_SECRET!, // Adjust for environment
        },
    },
});

if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SANDBOX_SECRET) {
    console.error("Plaid client ID or secret not configured in environment variables.");
}
const plaidClient = new PlaidApi(plaidConfig);
// --- End Plaid Client Setup ---


// --- API Handler ---
export async function POST(request: NextRequest) {
    console.log("POST /api/plaid/create-link-token called");

    // Create Supabase client within the handler
    const supabase = await createServerActionClient(); // <<< Added await
    try {
        // 1. Get authenticated user from Supabase session
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            console.error("Create Link Token: Unauthorized user", userError);
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }
        const userId = user.id; // Use the authenticated user's ID
        console.log(`Creating link token for authenticated user: ${userId}`);

        // NOTE: We no longer get userId from the request body

        // 2. Prepare the request for Plaid's /link/token/create endpoint
        const linkTokenRequest: LinkTokenCreateRequest = {
            user: {
                // Use the authenticated user's ID
                client_user_id: userId,
            },
            client_name: 'Cash Cushion App',
            products: [Products.Auth, Products.Transactions],
            country_codes: [CountryCode.Us],
            language: 'en',
        };

        // 3. Call Plaid to create the link token
        const response = await plaidClient.linkTokenCreate(linkTokenRequest);
        const link_token = response.data.link_token;
        const expiration = response.data.expiration;

        console.log(`Link token created successfully for user ${userId}, expires: ${expiration}`);

        // 4. Return the link_token to the frontend
        return NextResponse.json({ success: true, link_token: link_token }, { status: 200 });

    } catch (error: any) {
        console.error("Error creating link token:", error);
        // Handle Plaid specific errors
        if (error?.response?.data?.error_code) {
            const plaidErrorData = error.response.data;
            return NextResponse.json(
                { success: false, message: "Plaid API error creating link token", details: plaidErrorData.error_message || 'Unknown Plaid error' },
                { status: error.response?.status || 500 }
            );
        }
        // Generic error handler
        return NextResponse.json(
            { success: false, message: "Internal Server Error creating link token", details: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}
