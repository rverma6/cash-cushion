'use client';

import React from 'react';
// Import useAuth to get the Supabase client instance
import { useAuth } from '@/context/AuthContext';
import { Provider } from '@supabase/supabase-js'; // Import Provider type

interface LoginButtonProps {
    provider?: Provider; // Make provider optional, default to Google
    redirectPath?: string; // Optional path to redirect to after successful login
}

const LoginButton: React.FC<LoginButtonProps> = ({
    provider = 'google', // Default to Google provider
    redirectPath = '/', // Default redirect path
}) => {
    // Get the supabase client from the Auth context
    const { supabase } = useAuth();

    const handleLogin = async () => {
        if (!supabase) {
            console.error("Supabase client not available");
            // Optionally show an error message to the user
            return;
        }

        console.log(`Attempting OAuth login with provider: ${provider}`);

        // Construct the redirect URL based on the current location
        // This ensures Supabase redirects back correctly after OAuth flow
        const redirectTo = `${window.location.origin}/auth/callback`; // Standard callback route

        const { error } = await supabase.auth.signInWithOAuth({
            provider: provider,
            options: {
                // Ensure Supabase redirects back to your app after authentication
                // The path should match where your app handles the auth callback
                 redirectTo: redirectTo,
                // You can add scopes here if needed, e.g.,
                // scopes: 'https://www.googleapis.com/auth/calendar.readonly',
            },
        });

        if (error) {
            console.error(`Error logging in with ${provider}:`, error.message);
            // TODO: Display error message to the user
        } else {
            console.log(`Redirecting to ${provider} for authentication...`);
            // Redirect happens automatically via Supabase
        }
    };

    // Capitalize provider name for button text
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

    return (
        <button
            onClick={handleLogin}
            className="px-6 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
        >
            Login with {providerName}
        </button>
    );
};

export default LoginButton;
