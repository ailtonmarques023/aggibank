import React, { useState, useEffect } from 'react';
import { 
  FunnelIcon, 
  MagnifyingGlassIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CurrencyDollarIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { useApi } from '../../hooks/useApi.jsx';
import { transactionsService } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Button from '../../components/Button';
import Input from '../../components/Input';

const Transactions = () => {
  const { execute: executeApi } = useApi();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: '',
    startDate: '',
    endDate: '',
    search: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    loadTransactions();
  }, [filters, pagination.page]);

  const loadTransactions = async () => {
    setLoading(true);
    
    try {
      const result = await executeApi(() => 
        transactionsService.getTransactions({
          ...filters,
          page: pagination.page,
          limit: pagination.limit
        })
      );

      if (result.success) {
        setTransactions(result.data.transactions || []);
        setPagination(prev => ({
          ...prev,
          total: result.data.total || 0,
          totalPages: result.data.totalPages || 0
        }));
      }
    } catch (error) {
      console.error('Erro ao carregar transações:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const clearFilters = () => {
    setFilters({
      type: '',
      startDate: '',
      endDate: '',
      search: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
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

  const getTransactionTypeLabel = (type) => {
    switch (type) {
      case 'transfer':
        return 'Transferência';
      case 'deposit':
        return 'Depósito';
      case 'payment':
        return 'Pagamento';
      default:
        return 'Outros';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed':
        return 'Concluída';
      case 'pending':
        return 'Pendente';
      case 'failed':
        return 'Falhou';
      default:
        return status;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Transações</h1>
        <p className="text-gray-600 mt-1">
          Histórico completo das suas movimentações financeiras
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <FunnelIcon className="h-5 w-5 mr-2" />
              Filtros
            </h2>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Input
                label="Buscar"
                placeholder="Descrição, destinatário..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo
              </label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-agilbank-primary focus:border-transparent"
              >
                <option value="">Todos os tipos</option>
                <option value="transfer">Transferência</option>
                <option value="deposit">Depósito</option>
                <option value="payment">Pagamento</option>
              </select>
            </div>

            <div>
              <Input
                label="Data inicial"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>

            <div>
              <Input
                label="Data final"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Histórico de Transações
          </h2>
        </div>

        {loading ? (
          <div className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="skeleton h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <div className="skeleton h-4 w-32 mb-2" />
                    <div className="skeleton h-3 w-24" />
                  </div>
                  <div className="skeleton h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ) : transactions.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(transaction.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {transaction.description}
                      </p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                        {getStatusLabel(transaction.status)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{getTransactionTypeLabel(transaction.type)}</span>
                      <span>•</span>
                      <span>{formatDate(transaction.date)}</span>
                      {transaction.recipient && (
                        <>
                          <span>•</span>
                          <span>Para: {transaction.recipient}</span>
                        </>
                      )}
                      {transaction.sender && (
                        <>
                          <span>•</span>
                          <span>De: {transaction.sender}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-sm font-medium ${getTransactionColor(transaction.type)}`}>
                      {transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            <ClockIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Nenhuma transação encontrada</p>
            <p className="text-sm mt-1">
              Tente ajustar os filtros ou verifique se há transações no período selecionado.
            </p>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Mostrando {((pagination.page - 1) * pagination.limit) + 1} a{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} de{' '}
                {pagination.total} transações
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                >
                  Anterior
                </Button>
                
                <span className="text-sm text-gray-700">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page === pagination.totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;
