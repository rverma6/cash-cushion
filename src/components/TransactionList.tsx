'use client';

import React, { useState, useEffect } from 'react';
import type { Transaction, AccountBase } from 'plaid'; // Import Plaid types
import { useAuth } from '@/context/AuthContext';

// Define a simple interface for the expected API response structure
interface GetTransactionsResponse {
  success: boolean;
  transactions?: Transaction[];
  accounts?: AccountBase[];
  item?: { item_id: string; /* other item props */ };
  message?: string;
  details?: string;
}

interface TransactionListProps {
  itemId: string | null; // Pass the item_id for which to fetch transactions
}

const TransactionList: React.FC<TransactionListProps> = ({ itemId }) => {
  const { isLoading: isAuthLoading } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<AccountBase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading || !itemId) {
      setTransactions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const fetchTransactions = async () => {
      setIsLoading(true);
      setError(null);
      setTransactions([]);
      setAccounts([]);

      try {
        const response = await fetch('/api/plaid/get-transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: itemId }),
        });

        const data: GetTransactionsResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || data.details || 'Failed to fetch transactions');
        }

        if (data.transactions) {
          setTransactions(data.transactions);
        }
        if (data.accounts) {
            setAccounts(data.accounts); // Store account info if needed
        }

      } catch (err: any) {
        console.error("Transaction fetch error:", err);
        setError(`Error fetching transactions: ${err.message}`);
        setTransactions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [itemId, isAuthLoading]);

  // Helper to find account name
  const getAccountName = (accountId: string | null | undefined): string => {
      if (!accountId) return 'N/A';
      const account = accounts.find(acc => acc.account_id === accountId);
      return account?.name || accountId;
  }

  if (isAuthLoading || isLoading) {
    return <div className="text-center text-blue-500 py-6">Loading...</div>;
  }

  if (!itemId) {
    return <div className="text-center text-gray-500">Please connect an account first.</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 p-4 border border-red-300 bg-red-100 rounded">{error}</div>;
  }

  if (transactions.length === 0) {
    return <div className="text-center text-gray-500">No transactions found for the last 30 days.</div>;
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-4 mt-6 w-full max-w-2xl mx-auto">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Recent Transactions (Last 30 Days)</h3>
      <ul className="divide-y divide-gray-200">
        {transactions.map((transaction) => (
          <li key={transaction.transaction_id} className="py-3 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-gray-900 truncate w-60 md:w-auto" title={transaction.name}>
                {transaction.merchant_name || transaction.name}
              </p>
              <p className="text-xs text-gray-500">
                {transaction.date} ・ {getAccountName(transaction.account_id)} ・ Cat: {transaction.personal_finance_category?.primary || 'N/A'}
              </p>
            </div>
            <div className={`text-sm font-semibold ${transaction.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {transaction.amount > 0 ? '-' : ''}${Math.abs(transaction.amount).toFixed(2)}
              <span className="text-xs text-gray-400 ml-1">{transaction.iso_currency_code}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TransactionList;
