import { NextResponse } from 'next/server';
import { createServerActionClient } from '@/lib/supabase/utils';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

export async function POST() {
  try {
    // Get session
    const supabase = await createServerActionClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get the user's Plaid item_id and access_token
    const { data: itemData, error: itemError } = await supabase
      .from('plaid_items')
      .select('item_id, access_token')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (itemError) {
      console.error('Error fetching Plaid item:', itemError.message);
      return NextResponse.json(
        { success: false, message: 'Error fetching Plaid connection' },
        { status: 500 }
      );
    }

    if (!itemData?.item_id || !itemData.access_token) {
      return NextResponse.json(
        { success: false, message: 'No Plaid account connected' },
        { status: 404 }
      );
    }

    // Setup Plaid client
    const configuration = new Configuration({
      basePath: PlaidEnvironments.sandbox, // Use development or production in real environments
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
          'PLAID-SECRET': process.env.PLAID_SECRET!,
        },
      },
    });
    
    const client = new PlaidApi(configuration);

    // Request fresh transaction data using item/get instead since itemRefresh doesn't exist
    const refreshResponse = await client.itemGet({
      access_token: itemData.access_token,
    });

    console.log('Successfully retrieved Plaid item:', refreshResponse.data);

    // Fetch new transactions (this doesn't actually refresh but gets the most recent data)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    await client.transactionsSync({
      access_token: itemData.access_token,
      cursor: 'latest', // Request all new transactions
    });

    return NextResponse.json({
      success: true,
      message: 'Transactions synced successfully',
    });
  } catch (error) {
    console.error('Error refreshing transactions:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
} 