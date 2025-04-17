import { NextRequest, NextResponse } from 'next/server';
import { PlaidApi, Configuration, PlaidEnvironments, ItemPublicTokenExchangeRequest, PlaidError } from 'plaid';
import { createClient } from '@supabase/supabase-js'; // Import Supabase client
import crypto from 'crypto'; // Node.js crypto module

// --- Encryption Helpers ---
// IMPORTANT: Use a strong, unique key stored securely (e.g., env var)
// Use a fixed IV length for AES-256-GCM
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // GCM recommended IV size
const AUTH_TAG_LENGTH = 16; // GCM recommended auth tag size
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64'); // Ensure key is base64 encoded in env

if (encryptionKey.length !== 32) {
  throw new Error('Invalid ENCRYPTION_KEY length. Must be a 32-byte base64 encoded string.');
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  // Prepend IV and authTag for decryption (hex encoded)
  return iv.toString('hex') + authTag.toString('hex') + encrypted;
}

// Note: Decryption function would be needed when you READ the token to use it
// function decrypt(encryptedText: string): string {
//   const iv = Buffer.from(encryptedText.substring(0, IV_LENGTH * 2), 'hex');
//   const authTag = Buffer.from(encryptedText.substring(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2), 'hex');
//   const encrypted = encryptedText.substring((IV_LENGTH + AUTH_TAG_LENGTH) * 2);
//   const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
//   decipher.setAuthTag(authTag);
//   let decrypted = decipher.update(encrypted, 'hex', 'utf8');
//   decrypted += decipher.final('utf8');
//   return decrypted;
// }
// --- End Encryption Helpers ---


// --- Plaid Client Setup ---
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments.sandbox, // Or PlaidEnvironments.development / PlaidEnvironments.production
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SANDBOX_SECRET, // Use appropriate secret
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);
// --- End Plaid Client Setup ---


// --- Supabase Client Setup ---
// Use Service Role Key for server-side operations
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase URL or Service Role Key is missing from environment variables.');
}

// Create a single supabase client instance for server-side operations
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        // We are using the Service Role key, so no need to persist session or auto-refresh
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    }
});
// --- End Supabase Client Setup ---


export async function POST(request: NextRequest) {
  console.log("POST /api/plaid/exchange-token called");

  try {
    // 1. Get public_token and user_id from request body
    const { public_token, user_id } = await request.json();

    if (!public_token) {
      return NextResponse.json({ success: false, message: "Missing public_token" }, { status: 400 });
    }
    if (!user_id) {
      console.warn("Missing user_id in request body");
      return NextResponse.json({ success: false, message: "Missing user identifier" }, { status: 400 });
    }

    // 2. Exchange public token for access token with Plaid
    const exchangeRequest: ItemPublicTokenExchangeRequest = { public_token };
    console.log("Exchanging public token...");
    const exchangeResponse = await plaidClient.itemPublicTokenExchange(exchangeRequest);
    const access_token = exchangeResponse.data.access_token;
    const item_id = exchangeResponse.data.item_id;
    console.log("Token exchanged successfully. Item ID:", item_id);

    // 3. Encrypt the access token
    console.log("Encrypting access token...");
    const encrypted_access_token = encrypt(access_token);
    console.log("Access token encrypted.");

    // 4. Store encrypted token and item_id in Supabase
    // Ensure you have a table named 'plaid_items' (or similar) in Supabase
    // with columns like: id (uuid, primary key), user_id (uuid/text, foreign key?), item_id (text, unique), access_token (text), created_at (timestamp)
    console.log("Saving item to Supabase...");
    const { data, error: dbError } = await supabase
      .from('plaid_items') // <<< Your table name here
      .insert([
        {
          user_id: user_id, // Ensure this matches your user identifier type in Supabase
          item_id: item_id,
          access_token: encrypted_access_token, // Storing the encrypted token
        },
      ])
      .select(); // Optional: Select to confirm insertion or get inserted data

    if (dbError) {
        console.error("Supabase DB Error:", dbError);
        // Throw the error to be caught by the outer catch block
        throw new Error(`Database error saving Plaid item: ${dbError.message}`);
    }

    console.log("Item saved successfully to Supabase:", data);

    // 5. Send success response
    return NextResponse.json({ success: true, message: "Token exchanged and stored successfully" }, { status: 200 });

  } catch (error: any) {
    console.error("Error during token exchange:", error);

    // Handle Plaid specific errors
    if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response && error.response.data && typeof error.response.data === 'object' && 'error_code' in error.response.data) {
        // It looks like a PlaidError, proceed with logging Plaid-specific details
        const plaidErrorData = error.response.data;
        console.error("Plaid Error:", {
          error_code: plaidErrorData.error_code,
          error_message: plaidErrorData.error_message,
          error_type: plaidErrorData.error_type,
          request_id: plaidErrorData.request_id,
          status: error.response?.status // Keep original status if available
        });
      return NextResponse.json(
        { success: false, message: "Plaid API error", details: plaidErrorData.error_message || 'Unknown Plaid error' },
        { status: error.response?.status || 500 }
      );
    }

    // Handle Database errors (now specifically checking for Supabase errors if needed, or generic)
     if (error.message.includes('Database error')) {
         console.error("Database Operation Error:", error.message);
         return NextResponse.json({ success: false, message: "Database error storing token." }, { status: 500 });
     }

    // Handle encryption errors
    if (error instanceof Error && error.message.includes('encryption')) {
        console.error("Encryption Error:", error.message);
        return NextResponse.json({ success: false, message: "Encryption error." }, { status: 500 });
    }

    // Generic error handler
    return NextResponse.json(
        { success: false, message: "Internal Server Error", details: error.message || 'An unexpected error occurred' },
        { status: 500 }
    );
  }
}

