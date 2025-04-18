import { NextRequest, NextResponse } from 'next/server';
import { PlaidApi, Configuration, PlaidEnvironments, TransactionsGetRequest } from 'plaid';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dayjs from 'dayjs'; // For date manipulation
// Import Supabase client utilities
import { createServerActionClient } from '@/lib/supabase/utils';
import { fetchPlaidTransactions } from '@/lib/plaid/server';

// --- Encryption Helpers ---
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');

if (encryptionKey.length !== 32) {
  throw new Error('Invalid ENCRYPTION_KEY length. Must be a 32-byte base64 encoded string.');
}

// Decryption function (needed now)
function decrypt(encryptedText: string): string {
  try {
    // Extract IV, authTag, and encrypted data (all hex encoded)
    const iv = Buffer.from(encryptedText.substring(0, IV_LENGTH * 2), 'hex');
    const authTag = Buffer.from(encryptedText.substring(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2), 'hex');
    const encrypted = encryptedText.substring((IV_LENGTH + AUTH_TAG_LENGTH) * 2);

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag); // Set the authentication tag

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8'); // Finalize decryption and check auth tag
    return decrypted;
  } catch (error: unknown) {
      console.error("Decryption failed:", error);
      // Throw a specific error type or message for better handling
      const message = error instanceof Error ? error.message : 'Unknown decryption error';
      throw new Error(`Decryption failed: ${message}`);
  }
}
// --- End Encryption Helpers ---

// --- Plaid Client Setup ---
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments.sandbox, // Adjust for environment
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SANDBOX_SECRET, // Adjust for environment
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);
// --- End Plaid Client Setup ---

// --- Supabase Client Setup ---
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase URL or Service Role Key is missing from environment variables.');
}
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
// --- End Supabase Client Setup ---

// --- API Handler ---
export async function POST(request: NextRequest) {
  console.log("POST /api/plaid/get-transactions called");

  // Create Supabase client for user auth check
  const supabase = await createServerActionClient(); // Use action client

  try {
    // 1. Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Get Transactions: Unauthorized user", userError);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    console.log(`Get transactions request for authenticated user: ${userId}`);

    // 2. Get item_id from request body
    const { item_id } = (await request.json()) as { item_id: string };
    if (!item_id) {
      return NextResponse.json({ success: false, message: "Missing item_id" }, { status: 400 });
    }

    // 3. Retrieve encrypted access_token from Supabase, ensuring user owns the item
    // Using the standard server client assumes RLS is set up to allow users
    // to read their own plaid_items. If not, switch to createServiceRoleClient.
    console.log(`Fetching access token for item_id: ${item_id} owned by user: ${userId}`);
    const { data: itemData, error: dbError } = await supabase // Use user client
      .from('plaid_items') // Your table name
      .select('access_token')
      .eq('item_id', item_id)
      .eq('user_id', userId) // <<< Ensure the item belongs to the authenticated user
      .single();

    if (dbError) {
      console.error(`Supabase DB Error fetching token for user ${userId}, item ${item_id}:`, dbError);
      throw new Error(`Database error fetching token: ${dbError.message}`);
    }

    if (!itemData || !itemData.access_token) {
      console.error(`No access token found for item_id: ${item_id} owned by user: ${userId}`);
      // Return 404 - Not Found, as the specific item for this user doesn't exist
      return NextResponse.json({ success: false, message: "Plaid item not found for this user." }, { status: 404 });
    }

    const encryptedAccessToken = itemData.access_token;
    console.log("Encrypted token retrieved.");

    // 4. Decrypt the access token
    console.log("Decrypting access token...");
    let accessToken: string;
    try {
      accessToken = decrypt(encryptedAccessToken);
      console.log("Access token decrypted successfully.");
    } catch (decryptionError: unknown) {
      console.error("Decryption failed for item_id:", item_id, decryptionError);
      const message = decryptionError instanceof Error ? decryptionError.message : 'Unknown decryption error';
      return NextResponse.json({ success: false, message: `Failed to process access token: ${message}` }, { status: 500 });
    }

    // 5. Fetch transactions from Plaid
    const startDate = dayjs().subtract(30, 'days').format('YYYY-MM-DD');
    const endDate = dayjs().format('YYYY-MM-DD');

    const transactionsRequest: TransactionsGetRequest = {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: 500, // Max allowed is 500, adjust as needed
        offset: 0,
      },
    };

    console.log(`Fetching transactions from ${startDate} to ${endDate}...`);
    // Start latency timer
    console.time(`Plaid TransactionsGet Latency - Item ${item_id}`);

    const response = await plaidClient.transactionsGet(transactionsRequest);

    // End latency timer
    console.timeEnd(`Plaid TransactionsGet Latency - Item ${item_id}`);

    const transactions = response.data.transactions;
    const accounts = response.data.accounts;
    const item = response.data.item; // Contains item metadata
    console.log(`Fetched ${transactions.length} transactions.`);

    // 6. Return transactions to the frontend
    return NextResponse.json({ success: true, transactions, accounts, item }, { status: 200 });

  } catch (error: unknown) {
    console.error("Error in /api/plaid/get-transactions:", error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';

    // Handle Plaid specific errors
    let plaidErrorData: unknown = null;
    let plaidStatusCode = 500;
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const responseError = error.response as unknown;
        if (typeof responseError === 'object' && responseError !== null && 'data' in responseError) {
            const data = responseError.data as unknown;
            if (typeof data === 'object' && data !== null && 'error_code' in data) {
                plaidErrorData = data;
                const status = ('status' in responseError && typeof responseError.status === 'number') ? responseError.status : 500;
                plaidStatusCode = status;
                console.error("Plaid Error:", plaidErrorData);

                interface PlaidErrorData {
                    error_message?: string;
                }
                const typedPlaidErrorData = plaidErrorData as PlaidErrorData;
                const errorMessage = typedPlaidErrorData.error_message || 'Unknown Plaid error';

                return NextResponse.json(
                    { success: false, message: "Plaid API error", details: errorMessage },
                    { status: plaidStatusCode }
                );
            }
        }
    }

     // Handle Database errors explicitly if needed
     if (message.includes('Database error')) {
         console.error("Database Operation Error:", message);
         return NextResponse.json({ success: false, message: message }, { status: 500 });
     }

    // Generic error handler
    return NextResponse.json(
      { success: false, message: "Internal Server Error", details: message },
      { status: 500 }
    );
  }
}

export async function GET() {
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

    // Get the user's Plaid item_id
    const { data: itemData, error: itemError } = await supabase
      .from('plaid_items')
      .select('item_id')
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

    if (!itemData?.item_id) {
      return NextResponse.json(
        { success: false, message: 'No Plaid account connected' },
        { status: 404 }
      );
    }

    // Fetch transactions
    const transactions = await fetchPlaidTransactions(userId, itemData.item_id);

    if (!transactions) {
      return NextResponse.json(
        { success: false, message: 'No transactions found' },
        { status: 404 }
      );
    }

    // Sort transactions by date (newest first)
    const sortedTransactions = [...transactions].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({
      success: true,
      transactions: sortedTransactions,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}