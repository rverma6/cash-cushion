import { NextRequest, NextResponse } from 'next/server';
import { createServerActionClient } from '@/lib/supabase/utils';

export async function GET(request: NextRequest) {
    console.log("GET /api/user/plaid-items called");

    // Create Supabase client within the handler
    const supabase = await createServerActionClient();

    try {
        // 1. Get authenticated user from Supabase session
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            console.error("Get Plaid Item ID: Unauthorized user", userError);
            // Return success: false but maybe not a 401 unless the action requires login
            // For fetching, maybe just return null item_id if no user? Or 401 if required.
            // Let's assume login is required to view connection status.
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }
        const userId = user.id;
        console.log(`Fetching Plaid item ID for authenticated user: ${userId}`);

        // 2. Query the plaid_items table for the user's item_id
        // We only need the latest one if multiple could exist, but typically it's one per user.
        // If your RLS allows users to select their own items, this is fine.
        // Otherwise, you might need createServiceRoleClient if RLS blocks reads.
        const { data: itemData, error: dbError } = await supabase
            .from('plaid_items') // Ensure this is your table name
            .select('item_id')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }) // Get the latest item if multiple exist
            .limit(1); // We only need one item ID

        if (dbError) {
            console.error(`Supabase DB Error fetching item_id for user ${userId}:`, dbError);
            throw new Error(`Database error fetching Plaid item: ${dbError.message}`);
        }

        const currentItemId = itemData?.[0]?.item_id ?? null;
        console.log(`Found item_id for user ${userId}: ${currentItemId}`);

        // 3. Return the found item_id (or null if none exists)
        return NextResponse.json({ success: true, item_id: currentItemId }, { status: 200 });

    } catch (error: any) {
        console.error("Error in GET /api/user/plaid-items:", error);
        return NextResponse.json(
            { success: false, message: "Internal Server Error fetching Plaid item ID", details: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}

// Optional: Add error handling for specific scenarios like database errors vs others.
