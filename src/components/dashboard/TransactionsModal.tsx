'use client';

import React, { useEffect, useState } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Search, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';

interface Transaction {
  transaction_id: string;
  date: string;
  name: string;
  amount: number;
  category?: string[];
}

interface TransactionsModalProps {
  onClose: () => void;
  itemId: string;
}

const TransactionsModal: React.FC<TransactionsModalProps> = ({ onClose, itemId }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch transactions 
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/plaid/get-transactions');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch transactions: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success && Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
          console.log('🔍 Fetched raw transactions:', data.transactions);
        } else {
          setError(data.message || 'Failed to fetch transactions');
        }
      } catch (err) {
        console.error('Error fetching transactions:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [itemId]);

  // Filter transactions based on search term
  const filteredTransactions = transactions.filter(transaction => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      transaction.name.toLowerCase().includes(term) ||
      (transaction.category?.join(' ').toLowerCase().includes(term))
    );
  });

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(Math.abs(amount));
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return dayjs(dateStr).format('MMM D, YYYY');
  };

  // Refresh transactions
  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/plaid/refresh-transactions', {
        method: 'POST',
      });
      if (response.ok) {
        // Fetch the updated transactions
        const updatedResponse = await fetch('/api/plaid/get-transactions');
        if (updatedResponse.ok) {
          const data = await updatedResponse.json();
          if (data.success && Array.isArray(data.transactions)) {
            setTransactions(data.transactions);
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh transactions');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold">Your Transactions</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 border-b flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search transactions..."
              className="pl-10 pr-4 py-2 border rounded-md w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm text-gray-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600">Loading transactions...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-md text-red-700">
              <p className="font-medium">Error loading transactions</p>
              <p className="text-sm">{error}</p>
              <button 
                onClick={handleRefresh}
                className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm"
              >
                Try again
              </button>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              {searchTerm ? 'No transactions match your search' : 'No transactions found'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTransactions.map(transaction => (
                  <tr key={transaction.transaction_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {formatDate(transaction.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {transaction.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {transaction.category?.join(' › ')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-right">
                      <div className="flex items-center justify-end">
                        {transaction.amount < 0 ? (
                          <ArrowDownLeft className="mr-1 h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowUpRight className="mr-1 h-4 w-4 text-red-500" />
                        )}
                        <span className={transaction.amount < 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(transaction.amount)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 text-center text-xs text-gray-500">
          Note: In Plaid, transaction amounts are positive for outflows (debits) and negative for inflows (credits).
        </div>
      </div>
    </div>
  );
};

export default TransactionsModal; 