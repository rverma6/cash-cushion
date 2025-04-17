'use client'; // This directive is needed for components using hooks like useState, useEffect

import React, { useState, useEffect, useCallback } from 'react';
import {
  usePlaidLink,
  PlaidLinkOptions,
  PlaidLinkOnSuccess,
  PlaidLinkError,
  PlaidLinkOnExitMetadata,
} from 'react-plaid-link';
import { useAuth } from '@/context/AuthContext';

interface PlaidLinkConnectorProps {
  onConnectionSuccess: (itemId: string) => void;
  currentItemId: string | null;
}

/* ------------------------------------------------------------------ */
/* LinkButton – declared once so React preserves its identity.        */
/* ------------------------------------------------------------------ */
interface LinkButtonProps {
  token: string;
  exchangeLoading: boolean;
  onSuccess: PlaidLinkOnSuccess;
  onExitError: (msg: string) => void;
}
const LinkButton: React.FC<LinkButtonProps> = ({
  token,
  exchangeLoading,
  onSuccess,
  onExitError,
}) => {
  const handleExit = (
    err: PlaidLinkError | null,
    metadata: PlaidLinkOnExitMetadata,
  ) => {
    console.log('🚪 onExit fired', { err, metadata });
    if (err) {
      console.error('Plaid Link explicit error:', err);
      onExitError(
        err.display_message ?? err.error_message ?? 'Unknown error',
      );
    }
  };

  const config: PlaidLinkOptions = { token, onSuccess, onExit: handleExit };
  const { open, ready, exit, error } = usePlaidLink(config);

  /* surface hook‑level errors */
  useEffect(() => {
    if (error) onExitError(error.message);
  }, [error, onExitError]);

  /* clean up Plaid iframe when component unmounts */
  useEffect(() => () => exit(), [exit]);

  const disabled = !ready || exchangeLoading;

  return (
    <button
      onClick={() => open()}
      disabled={disabled}
      className={`w-full px-4 py-2 rounded font-medium text-white transition-colors ${
        disabled
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-blue-600 hover:bg-blue-700'
      }`}
    >
      {exchangeLoading ? 'Processing…' : 'Connect Bank Account'}
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* PlaidLinkConnector – fetches link_token and renders LinkButton     */
/* ------------------------------------------------------------------ */
const PlaidLinkConnector: React.FC<PlaidLinkConnectorProps> = ({
  onConnectionSuccess,
  currentItemId,
}) => {
  const { user, isLoading: isAuthLoading } = useAuth();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loadingLinkToken, setLoadingLinkToken] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeSuccess, setExchangeSuccess] = useState(false);

  /* --------------- Fetch a new link_token when needed --------------- */
  useEffect(() => {
    if (isAuthLoading || !user) {
      setLinkToken(null);
      setLoadingLinkToken(false);
      return;
    }

    if (currentItemId === null) {
      (async () => {
        try {
          setLoadingLinkToken(true);
          const res = await fetch('/api/plaid/create-link-token', {
            method: 'POST',
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || `HTTP ${res.status}`);
          }
          const data = await res.json();
          if (!data.link_token) throw new Error('No link_token in response');
          setLinkToken(data.link_token);
        } catch (e: any) {
          setApiError(e.message);
          setLinkToken(null);
        } finally {
          setLoadingLinkToken(false);
        }
      })();
    }
  }, [user, isAuthLoading, currentItemId]);

  /* --------------- Success handler passed to LinkButton ------------- */
  const handleSuccess: PlaidLinkOnSuccess = async (publicToken) => {
    console.log('✅ onSuccess fired', { publicToken });
    if (!user) {
      setApiError('No user session');
      return;
    }
    setExchangeLoading(true);
    setExchangeSuccess(false);
    setApiError(null);
    try {
      const res = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token: publicToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.item_id)
        throw new Error(data.message || 'Token exchange failed');

      onConnectionSuccess(data.item_id);
      setExchangeSuccess(true);
    } catch (e: any) {
      setApiError(e.message);
    } finally {
      setExchangeLoading(false);
    }
  };

  /* --------------- Auth guard -------------------------------------- */
  if (!isAuthLoading && !user) {
    return (
      <div className="text-center text-gray-600 p-4 border rounded bg-gray-50">
        Please log in to connect your bank account.
      </div>
    );
  }

  /* --------------- Render ------------------------------------------ */
  return (
    <div className="p-4 max-w-md mx-auto bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold text-gray-700 mb-4">
        Connect Your Bank
      </h2>
      <p className="text-gray-600 mb-4">
        Securely link your bank account using Plaid to automatically track your
        cash cushion.
      </p>

      {apiError && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 border rounded">
          Error: {apiError}
        </div>
      )}

      {exchangeSuccess && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 border rounded">
          Account connected successfully!
        </div>
      )}

      {!linkToken ? (
        <button
          disabled
          className="w-full px-4 py-2 rounded font-medium text-white bg-gray-400 cursor-not-allowed"
        >
          {loadingLinkToken ? 'Initializing…' : 'Connect Bank Account'}
        </button>
      ) : (
        <LinkButton
          token={linkToken}
          exchangeLoading={exchangeLoading}
          onSuccess={handleSuccess}
          onExitError={setApiError}
        />
      )}

      {!loadingLinkToken && linkToken && (
        <p className="text-xs text-center text-gray-500 mt-2">Powered by Plaid</p>
      )}
    </div>
  );
};

export default PlaidLinkConnector;
