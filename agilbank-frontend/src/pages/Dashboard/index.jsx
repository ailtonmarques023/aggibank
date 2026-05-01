import React, { useState, useEffect } from 'react';
import { 
  CurrencyDollarIcon, 
  ArrowUpIcon, 
  ArrowDownIcon,
  ClockIcon,
  PlusIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApi } from '../../hooks/useApi.jsx';
import { accountService, transactionsService } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Button from '../../components/Button';
import TransferModal from '../../components/TransferModal';
import { useModal } from '../../hooks/useModal.jsx';

const Dashboard = () => {
  const { user } = useAuth();
  const { execute: executeApi } = useApi();
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showBalance, setShowBalance] = useState(true);
  const [loading, setLoading] = useState(true);
  
  const { isOpen: isTransferModalOpen, open: openTransferModal, close: closeTransferModal } = useModal();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    
    try {
      // Carregar saldo e transações em paralelo
      const [balanceResult, transactionsResult] = await Promise.all([
        executeApi(() => accountService.getBalance()),
        executeApi(() => transactionsService.getTransactions({ limit: 5 }))
      ]);

      if (balanceResult.success) {
        setBalance(balanceResult.data);
      }

      if (transactionsResult.success) {
        setTransactions(transactionsResult.data.transactions || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransferSuccess = (transaction) => {
    // Atualizar saldo e adicionar nova transação
    loadDashboardData();
    
    // Mostrar notificação de sucesso
    // Aqui você pode implementar um sistema de toast/notificação
    console.log('Transferência realizada com sucesso:', transaction);
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'transfer':
        return <ArrowUpIcon className="h-5 w-5 text-red-500" />;
      case 'deposit':
        return <ArrowDownIcon className="h-5 w-5 text-green-500" />;
      case 'payment':
        return <CurrencyDollarIcon className="h-5 w-5 text-blue-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'transfer':
        return 'text-red-600';
      case 'deposit':
        return 'text-green-600';
      case 'payment':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Skeleton para saldo */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="skeleton h-8 w-48 mb-2" />
            <div className="skeleton h-12 w-32" />
          </div>
          
          {/* Skeleton para transações */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="skeleton h-6 w-32 mb-4" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3">
                  <div className="skeleton h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <div className="skeleton h-4 w-32 mb-1" />
                    <div className="skeleton h-3 w-24" />
                  </div>
                  <div className="skeleton h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Olá, {user?.nomeCompleto?.split(' ')[0] || 'Usuário'}!
        </h1>
        <p className="text-gray-600 mt-1">
          Aqui está um resumo da sua conta
        </p>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-r from-agilbank-primary to-blue-600 rounded-2xl shadow-lg p-6 mb-8 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-blue-100">Saldo disponível</h2>
            <div className="flex items-center space-x-2">
              {showBalance ? (
                <span className="text-3xl font-bold">
                  {formatCurrency(balance?.balance || 0)}
                </span>
              ) : (
                <span className="text-3xl font-bold">••••••</span>
              )}
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="text-blue-200 hover:text-white transition-colors"
              >
                {showBalance ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
          <div className="text-right">
            <p className="text-blue-100 text-sm">Conta</p>
            <p className="font-medium">{user?.numeroConta || 'N/A'}</p>
          </div>
        </div>

        <div className="flex space-x-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={openTransferModal}
            className="text-agilbank-primary"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Transferir
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-white border-white hover:bg-white hover:text-agilbank-primary"
          >
            Ver extrato
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <button className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <ArrowDownIcon className="h-6 w-6 text-green-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Depositar</span>
        </button>

        <button className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <ArrowUpIcon className="h-6 w-6 text-blue-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">PIX</span>
        </button>

        <button className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <CurrencyDollarIcon className="h-6 w-6 text-purple-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Pagar</span>
        </button>

        <button className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <ClockIcon className="h-6 w-6 text-orange-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Agendado</span>
        </button>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Transações recentes
            </h3>
            <Button variant="ghost" size="sm">
              Ver todas
            </Button>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {transactions.length > 0 ? (
            transactions.map((transaction) => (
              <div key={transaction.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(transaction.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {transaction.description}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDate(transaction.date)}
                    </p>
                  </div>
                  
                  <div className="flex-shrink-0">
                    <p className={`text-sm font-medium ${getTransactionColor(transaction.type)}`}>
                      {transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {transaction.status}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-gray-500">
              <ClockIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhuma transação encontrada</p>
            </div>
          )}
        </div>
      </div>

      {/* Transfer Modal */}
      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={closeTransferModal}
        onSuccess={handleTransferSuccess}
      />
    </div>
  );
};

export default Dashboard;
