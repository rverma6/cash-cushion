// src/app/api/plaid/exchange-token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  PlaidApi,
  Configuration,
  PlaidEnvironments,
  ItemPublicTokenExchangeRequest,
} from 'plaid';
import crypto from 'crypto';
import {
  createServerActionClient,
  createServiceRoleClient,
} from '@/lib/supabase/utils';

/* ------------------------------------------------------------------ */
/* Encryption helpers                                                 */
/* ------------------------------------------------------------------ */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');
if (encryptionKey.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (base64‑encoded)');
}
function encrypt(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString('hex');
}

/* ------------------------------------------------------------------ */
/* Plaid client                                                       */
/* ------------------------------------------------------------------ */
const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SANDBOX_SECRET,
      },
    },
  }),
);

/* ------------------------------------------------------------------ */
/* POST handler                                                       */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  console.log('🔄  POST /api/plaid/exchange-token');

  /* 1.  Validate session */
  const supabaseUser = await createServerActionClient();
  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();
  if (userErr || !user) {
    console.error('⛔  Unauthorized', userErr);
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = user.id;
  console.log('👤  Auth user:', userId);

  /* 2.  Parse body */
  const { public_token } = await req.json();
  if (!public_token) {
    return NextResponse.json({ success: false, message: 'Missing public_token' }, { status: 400 });
  }

  try {
    /* 3.  Exchange token with Plaid */
    console.log('🔁  Exchanging public_token with Plaid …');
    const plaidRes = await plaidClient.itemPublicTokenExchange({ public_token } as ItemPublicTokenExchangeRequest);
    const { access_token, item_id } = plaidRes.data;
    console.log('✅  Plaid exchange returned item_id:', item_id);

    /* 4.  Encrypt access_token */
    const encrypted = encrypt(access_token);

    /* 5.  Store encrypted token and item_id in Supabase using Service Role Client */
    console.log("Saving item to Supabase (upsert on item_id)...");
    const supabaseAdmin = createServiceRoleClient(); 
    // Use upsert based on the item_id column
    const { data, error: dbError } = await supabaseAdmin
      .from('plaid_items')
      .upsert(
        {
          user_id: userId, // Will be inserted if item_id is new
          item_id: item_id, // The conflict target
          access_token: encrypted, // Will be updated if item_id exists
          // Add other columns you might want to update on conflict if necessary,
          // e.g., updated_at: new Date().toISOString()
        },
        {
          onConflict: 'item_id' // Specify the column(s) with the unique constraint
          // ignoreDuplicates: false // Default is false, ensures update happens
        }
      )
      .select('item_id'); // Select the item_id after upsert

    if (dbError) {
      // No longer need the specific 23505 check, upsert handles it.
      // Log the specific error for debugging.
      console.error(`Supabase DB Error upserting item ${item_id} for user ${userId}:`, dbError);
      throw new Error(`Database error saving Plaid item: ${dbError.message}`);
    }
    // If successful, data should contain [{ item_id: '...' }]
    console.log("Item upserted successfully to Supabase:", data);

    /* 6.  Success */
    return NextResponse.json(
      { success: true, item_id, message: 'Stored successfully' },
      { status: 200 },
    );
  } catch (err: any) {
    /* ------------- Error handling ------------- */
    if (err.response?.data?.error_code) {
      /* Plaid SDK error */
      console.error('🐛  Plaid error:', err.response.data);
      return NextResponse.json(
        { success: false, message: 'Plaid error', details: err.response.data },
        { status: err.response.status || 500 },
      );
    }
    console.error('🐛  Server error:', err);
    return NextResponse.json(
      { success: false, message: err.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}
