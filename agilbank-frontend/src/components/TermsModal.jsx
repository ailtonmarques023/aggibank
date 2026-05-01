import React, { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import Modal, { ModalBody, ModalFooter } from './Modal';
import Button from './Button';
import { termsService } from '../services/api';

const TermsModal = ({ isOpen, onClose, onAccept }) => {
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadTerms();
    }
  }, [isOpen]);

  const loadTerms = async () => {
    try {
      setLoading(true);
      setError(null);
      const termsData = await termsService.getTerms();
      setTerms(termsData);
    } catch (err) {
      setError('Erro ao carregar termos de uso');
      console.error('Erro ao carregar termos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!accepted || !terms) return;

    try {
      setLoading(true);
      await termsService.acceptTerms(terms.version);
      
      // Salvar localmente
      localStorage.setItem('agilbank_terms_accepted', terms.version);
      localStorage.setItem('agilbank_terms_accepted_at', new Date().toISOString());
      
      onAccept(terms.version);
      onClose();
    } catch (err) {
      setError('Erro ao aceitar termos de uso');
      console.error('Erro ao aceitar termos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!accepted) {
      // Não permitir fechar sem aceitar
      return;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Termos de Uso"
      size="2xl"
      showCloseButton={accepted}
      closeOnOverlayClick={accepted}
    >
      <ModalBody>
        {loading && !terms ? (
          <div className="space-y-4">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-32 w-full" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={loadTerms} variant="secondary">
              Tentar novamente
            </Button>
          </div>
        ) : terms ? (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-800">
                <CheckIcon className="h-5 w-5" />
                <span className="font-medium">Versão {terms.version}</span>
              </div>
              <p className="text-blue-700 text-sm mt-1">
                Última atualização: {new Date(terms.lastUpdated).toLocaleDateString('pt-BR')}
              </p>
            </div>

            <div 
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: terms.html }}
            />

            <div className="border-t border-gray-200 pt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 text-agilbank-primary focus:ring-agilbank-primary border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">
                  Li e aceito os termos de uso do AgilBank. Entendo que ao aceitar, 
                  estou concordando com todas as condições estabelecidas neste documento.
                </span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
          </div>
        ) : null}
      </ModalBody>

      <ModalFooter>
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={!accepted}
        >
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={handleAccept}
          disabled={!accepted || loading}
          loading={loading}
        >
          Aceitar Termos
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default TermsModal;
