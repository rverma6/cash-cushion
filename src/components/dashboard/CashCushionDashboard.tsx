'use client';

import React, { useState, useEffect } from 'react';
import BalanceChart from './BalanceChart';
import { AlertCircle, BellRing, PiggyBank, Link as LinkIcon, X, List } from 'lucide-react';
import AlertThresholdModal from './AlertThresholdModal';
import PlaidLinkConnector from '@/components/PlaidLinkConnector';
import { useForecast } from '@/hooks/useForecast';
import TransactionsModal from './TransactionsModal';

const CashCushionDashboard: React.FC = () => {
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isConnectBankOpen, setIsConnectBankOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  
  // Use our forecast hook for real data
  const { 
    forecastData, 
    accountData, 
    isLoadingForecast,
    threshold,
    updateThreshold
  } = useForecast();
  
  // Check for existing Plaid connection
  useEffect(() => {
    const checkPlaidConnection = async () => {
      try {
        const response = await fetch('/api/user/plaid-items');
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.item_id) {
            setCurrentItemId(data.item_id);
          }
        }
      } catch (error) {
        console.error('Error checking Plaid connection:', error);
      }
    };
    
    checkPlaidConnection();
  }, []);
  
  // Handle threshold update
  const handleUpdateThreshold = (newThreshold: number) => {
    updateThreshold(newThreshold);
    setIsAlertModalOpen(false);
  };

  // Handle successful Plaid connection
  const handlePlaidSuccess = (itemId: string) => {
    setCurrentItemId(itemId);
    setIsConnectBankOpen(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center">
              <PiggyBank className="mr-2 h-6 w-6 text-blue-500" />
              Cash Cushion Dashboard
            </h1>
            
            <div className="flex space-x-3">
              {currentItemId && (
                <>
                  <button 
                    onClick={() => setIsAlertModalOpen(true)}
                    className="flex items-center text-blue-500 hover:text-blue-700"
                  >
                    <BellRing className="h-5 w-5 mr-1" />
                    Set Alerts
                  </button>
                  <button 
                    onClick={() => setIsTransactionsModalOpen(true)}
                    className="flex items-center text-blue-500 hover:text-blue-700"
                  >
                    <List className="h-5 w-5 mr-1" />
                    View Transactions
                  </button>
                </>
              )}
              <button 
                onClick={() => setIsConnectBankOpen(true)}
                className="flex items-center text-blue-500 hover:text-blue-700"
              >
                <LinkIcon className="h-5 w-5 mr-1" />
                {currentItemId ? 'Manage Bank Account' : 'Connect Bank'}
              </button>
            </div>
          </div>
          
          {!currentItemId ? (
            // No Bank Account Connected View
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <PiggyBank className="h-8 w-8 text-blue-500" />
              </div>
              <h2 className="text-xl font-medium text-gray-800 mb-2">
                Connect Your Bank Account
              </h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Link your bank account to get personalized balance predictions and
                avoid overdraft fees.
              </p>
              <button
                onClick={() => setIsConnectBankOpen(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm"
              >
                Connect Your Bank
              </button>
            </div>
          ) : (
            // Bank Account Connected View
            <>
              {isLoadingForecast ? (
                // Loading state
                <div className="p-8 text-center">
                  <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
                  </div>
                </div>
              ) : forecastData.length === 0 ? (
                // No data state
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="h-8 w-8 text-gray-400" />
                  </div>
                  <h2 className="text-xl font-medium text-gray-800 mb-2">
                    No Forecast Data Available
                  </h2>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    We don't have enough transaction history to generate a forecast yet.
                    Check back in a few days.
                  </p>
                </div>
              ) : (
                // Data available state
                <>
                  {/* Alert if balance is predicted to go below threshold */}
                  {accountData.predictedLowBalance < threshold && (
                    <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <AlertCircle className="h-5 w-5 text-amber-500" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-amber-700">
                            Your balance is predicted to fall below ${accountData.predictedLowBalance.toFixed(2)} in {accountData.daysUntilLow} days.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-sm text-gray-500 mb-1">Current Balance</h3>
                      <p className="text-2xl font-semibold">${accountData.currentBalance.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-sm text-gray-500 mb-1">Predicted Low</h3>
                      <p className="text-2xl font-semibold">${accountData.predictedLowBalance.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-sm text-gray-500 mb-1">Days Until Low</h3>
                      <p className="text-2xl font-semibold">{accountData.daysUntilLow} days</p>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-4">Balance Forecast</h2>
                    <BalanceChart data={forecastData} threshold={threshold} />
                  </div>
                  
                  <div className="text-sm text-gray-500">
                    This forecast is based on your historical spending patterns and scheduled transactions.
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Alert Threshold Modal */}
      {isAlertModalOpen && (
        <AlertThresholdModal 
          onClose={() => setIsAlertModalOpen(false)}
          onSave={handleUpdateThreshold}
          currentThreshold={threshold}
        />
      )}

      {/* Bank Connection Dialog */}
      {isConnectBankOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Connect Your Bank Account</h2>
              <button
                onClick={() => setIsConnectBankOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <PlaidLinkConnector 
              onConnectionSuccess={handlePlaidSuccess}
              currentItemId={currentItemId}
            />
          </div>
        </div>
      )}

      {/* Transactions Modal */}
      {isTransactionsModalOpen && (
        <TransactionsModal
          onClose={() => setIsTransactionsModalOpen(false)}
          itemId={currentItemId || ''}
        />
      )}
    </div>
  );
};

export default CashCushionDashboard;
