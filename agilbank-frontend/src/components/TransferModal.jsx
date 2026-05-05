import React, { useState, useEffect } from 'react';
import { ArrowsRightLeftIcon, UserIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';
import Modal, { ModalBody, ModalFooter } from './Modal';
import Button from './Button';
import Input from './Input';
import { accountService } from '../services/accountService';

const TransferModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    chavePix: '',
    valor: '',
    descricao: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(1); // 1: Formulário, 2: Confirmação

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData({ chavePix: '', valor: '', descricao: '' });
      setErrors({});
      setStep(1);
    }
  }, [isOpen]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.chavePix.trim()) {
      newErrors.chavePix = 'Informe a chave PIX do destinatário';
    }

    if (!formData.valor) {
      newErrors.valor = 'Informe o valor';
    } else {
      const valor = parseFloat(formData.valor.replace(',', '.'));
      if (isNaN(valor) || valor <= 0) {
        newErrors.valor = 'Valor deve ser maior que zero';
      } else if (valor > 10000) {
        newErrors.valor = 'Valor máximo por transferência: R$ 10.000,00';
      }
    }

    if (!formData.descricao.trim()) {
      newErrors.descricao = 'Informe uma descrição';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleNext = () => {
    if (validateForm()) {
      setStep(2);
    }
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      const transferData = {
        chavePix: formData.chavePix.trim(),
        valor: parseFloat(formData.valor.replace(',', '.')),
        descricao: formData.descricao
      };

      const result = await accountService.transfer(transferData);
      
      if (result.success) {
        onSuccess(result.data?.transacao || result.transaction);
        onClose();
      } else {
        setErrors({ submit: 'Erro ao realizar transferência' });
      }
    } catch (error) {
      setErrors({ submit: error.message || 'Erro ao realizar transferência' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transferência"
      size="md"
      showCloseButton={step === 1}
      closeOnOverlayClick={step === 1}
    >
      <ModalBody>
        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-agilbank-primary mb-4">
              <ArrowsRightLeftIcon className="h-5 w-5" />
              <span className="font-medium">Nova Transferência</span>
            </div>

            <Input
              label="Chave PIX do destinatário *"
              type="text"
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              value={formData.chavePix}
              onChange={(e) => handleInputChange('chavePix', e.target.value)}
              error={errors.chavePix}
              helperText="Use a chave PIX real do destinatário"
            />

            {/* Valor */}
            <Input
              label="Valor *"
              type="text"
              placeholder="0,00"
              value={formData.valor}
              onChange={(e) => {
                // Format currency input
                let value = e.target.value.replace(/\D/g, '');
                if (value) {
                  value = (parseInt(value) / 100).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  });
                }
                handleInputChange('valor', value);
              }}
              error={errors.valor}
              helperText="Valor máximo: R$ 10.000,00"
            />

            {/* Descrição */}
            <Input
              label="Descrição *"
              type="text"
              placeholder="Ex: Pagamento de serviços"
              value={formData.descricao}
              onChange={(e) => handleInputChange('descricao', e.target.value)}
              error={errors.descricao}
              helperText="Descreva o motivo da transferência"
            />

            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{errors.submit}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-agilbank-primary mb-4">
              <CurrencyDollarIcon className="h-5 w-5" />
              <span className="font-medium">Confirmar Transferência</span>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <UserIcon className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Chave PIX do destinatário</p>
                  <p className="font-medium break-all">{formData.chavePix}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Valor</span>
                  <span className="text-lg font-semibold text-gray-900">
                    R$ {formData.valor}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3">
                <p className="text-sm text-gray-600 mb-1">Descrição</p>
                <p className="text-sm text-gray-900">{formData.descricao}</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-800 text-sm">
                <strong>Importante:</strong> Esta operação não pode ser desfeita. 
                Verifique os dados antes de confirmar.
              </p>
            </div>

            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{errors.submit}</p>
              </div>
            )}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {step === 1 ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleNext}>
              Continuar
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={handleBack} disabled={loading}>
              Voltar
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={loading}
              disabled={loading}
            >
              Confirmar Transferência
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
};

export default TransferModal;
