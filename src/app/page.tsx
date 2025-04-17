'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import PlaidLinkConnector from '@/components/PlaidLinkConnector';
import TransactionList from '@/components/TransactionList';
import LoginButton from '@/components/LoginButton'; // Assuming you have this

// Renamed function from DashboardPage to Home
export default function Home() {
    const { user, isLoading: isAuthLoading, signOut } = useAuth();
    const [currentItemId, setCurrentItemId] = useState<string | null>(null);
    const [isCheckingItemId, setIsCheckingItemId] = useState(true); // Loading state for item ID check
    const [fetchError, setFetchError] = useState<string | null>(null); // State for fetch errors

    // Effect to fetch the user's Plaid item ID from the backend
    useEffect(() => {
        // Only run if auth is loaded and user is logged in
        if (!isAuthLoading && user) {
            const fetchItemId = async () => {
                console.log("Auth loaded, user found. Fetching Plaid item ID from backend...");
                setIsCheckingItemId(true); // Start loading
                setFetchError(null); // Clear previous errors
                try {
                    const response = await fetch('/api/user/plaid-items'); // Use GET request

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
                    }

                    const data = await response.json();

                    if (data.success) {
                        console.log("Fetched item_id:", data.item_id);
                        setCurrentItemId(data.item_id); // Set state with fetched item_id (null if none)
                    } else {
                         // Handle cases where success is false but response was ok (less common)
                         console.error("API call successful but returned success: false", data);
                         throw new Error(data.message || 'Failed to retrieve Plaid item status.');
                    }
                } catch (error: any) {
                    console.error("Error fetching Plaid item ID:", error);
                    setFetchError(`Failed to load account connection status: ${error.message}`);
                    setCurrentItemId(null); // Ensure state is cleared on error
                } finally {
                    setIsCheckingItemId(false); // Finished loading
                }
            };
            fetchItemId();
        } else if (!isAuthLoading && !user) {
            // If auth loaded and no user, clear state and stop loading
            setIsCheckingItemId(false);
            setCurrentItemId(null);
            setFetchError(null);
        }
        // This effect depends on the user object and auth loading state
    }, [user, isAuthLoading]);


    // Callback for PlaidLinkConnector upon successful connection - WRAPPED IN useCallback
    const handlePlaidSuccess = useCallback((newItemId: string) => {
        // user is added as a dependency for useCallback
        if (!user) return;
        console.log("Dashboard received new item ID via callback:", newItemId);
        // Directly update the state. The next page load will fetch this from backend.
        setCurrentItemId(newItemId);
        setFetchError(null); // Clear any previous fetch errors
        // Removed localStorage.setItem - state updated directly
    }, [user]); // Dependency array for useCallback

    // Handler for the demo disconnect button
    const handleDisconnect = useCallback(() => { // Also wrap this for consistency if needed elsewhere
        if (!user) return;
        // TODO: Implement a backend call to delete/deactivate the item in DB
        console.log("Disconnecting item ID:", currentItemId);
        // Remove from state immediately for UI update
        setCurrentItemId(null);
        setFetchError(null);
         // Removed localStorage.removeItem
    }, [user, currentItemId]); // Added dependencies

    // --- Render Logic ---

    // Show main loading state while auth is checking
    if (isAuthLoading) {
        return <div className="flex justify-center items-center min-h-screen"><p>Loading authentication...</p></div>;
    }

    // If not loading and no user, show Login prompt
    if (!user) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center p-12">
                <h1 className="text-2xl font-bold mb-4">Welcome to Cash Cushion</h1>
                <p className="mb-6 text-gray-600">Please log in to manage your account.</p>
                <LoginButton />
            </main>
        );
    }

    // User is logged in, show dashboard content
    return (
        <main className="flex min-h-screen flex-col items-center p-4 md:p-12">
            <div className="w-full max-w-4xl flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Cash Cushion Dashboard</h1>
                <button
                   onClick={signOut}
                   className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                >
                    Sign Out ({user.email})
                </button>
            </div>

            {/* Display error if fetching item ID failed */}
             {fetchError && (
                 <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded w-full max-w-md">
                   Error checking account connection: {fetchError}
                 </div>
             )}


            {/* === Conditional Rendering Logic === */}
            {isCheckingItemId ? (
                // 1. Show loading state while checking for existing connection
                <p>Checking account connection...</p>
            ) : currentItemId ? (
                // 2. If check complete and item exists, show transactions
                <>
                    <TransactionList itemId={currentItemId} />
                    <button
                        onClick={handleDisconnect}
                        className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                    >
                        Disconnect Account (Demo)
                    </button>
                </>
            ) : (
                // 3. If check complete and NO item exists (and no fetch error), show connector
                //    We only reach here if isCheckingItemId is false and currentItemId is null/undefined
                !fetchError && (
                    <>
                        <p className="mb-4 text-gray-600">Connect your bank account to get started.</p>
                        <PlaidLinkConnector 
                            onConnectionSuccess={handlePlaidSuccess} 
                            currentItemId={currentItemId}
                        />
                    </>
                )
            )}
            {/* End Conditional Rendering Logic */}

        </main>
    );
}
