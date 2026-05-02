import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, 
  EyeIcon, 
  EyeSlashIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  HomeIcon,
  BriefcaseIcon,
  CameraIcon
} from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../hooks/useAuth.jsx';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Modal from '../../components/Modal';

const Register = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cepData, setCepData] = useState(null);
  const [documents, setDocuments] = useState({
    identidade: null,
    comprovante: null,
    rosto: null
  });
  
  const { register: registerUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    trigger
  } = useForm({
    defaultValues: {
      // Dados pessoais
      nomeCompleto: '',
      cpf: '',
      email: '',
      telefone: '',
      dataNascimento: '',
      senha: '',
      confirmarSenha: '',
      
      // Endereço
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: '',
      
      // Dados profissionais
      profissao: '',
      empresa: '',
      cargo: '',
      rendaMensal: '',
      
      // Termos
      aceitaTermos: false,
      aceitaComunicacoes: false
    }
  });

  const watchedValues = watch();

  // Buscar CEP
  const fetchCep = async (cep) => {
    if (cep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setCepData(data);
          setValue('logradouro', data.logradouro);
          setValue('bairro', data.bairro);
          setValue('cidade', data.localidade);
          setValue('estado', data.uf);
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
      }
    }
  };

  // Validação de CPF
  const validateCPF = (cpf) => {
    cpf = cpf.replace(/[^\d]/g, '');
    if (cpf.length !== 11) return false;
    
    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    
    // Validar dígitos verificadores
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let remainder = 11 - (sum % 11);
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(9))) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    remainder = 11 - (sum % 11);
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(10))) return false;
    
    return true;
  };

  // Formatação de CPF
  const formatCPF = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .slice(0, 14);
  };

  // Formatação de telefone
  const formatPhone = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(\d{4})-(\d)(\d{4})/, '$1$2-$3')
      .slice(0, 15);
  };

  // Formatação de CEP
  const formatCEP = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 9);
  };

  const nextStep = async () => {
    const fieldsToValidate = getFieldsForStep(currentStep);
    const isValid = await trigger(fieldsToValidate);
    
    if (isValid) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
      setError('');
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError('');
  };

  const getFieldsForStep = (step) => {
    switch (step) {
      case 1:
        return ['nomeCompleto', 'cpf', 'email', 'telefone', 'dataNascimento', 'senha', 'confirmarSenha'];
      case 2:
        return ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'];
      case 3:
        return ['profissao'];
      case 4:
        return ['aceitaTermos'];
      default:
        return [];
    }
  };

  const handleFileUpload = (type, file) => {
    setDocuments(prev => ({
      ...prev,
      [type]: file
    }));
  };

  const onSubmit = async (data) => {
    setLoading(true);
    setError('');

    try {
      // Preparar dados para o backend
      const userData = {
        nomeCompleto: data.nomeCompleto,
        email: data.email,
        cpf: data.cpf.replace(/\D/g, ''),
        telefone: data.telefone.replace(/\D/g, ''),
        dataNascimento: data.dataNascimento,
        senha: data.senha,
        endereco: {
          cep: data.cep.replace(/\D/g, ''),
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento || '',
          bairro: data.bairro,
          cidade: data.cidade,
          estado: data.estado
        },
        dadosProfissionais: {
          profissao: data.profissao,
          empresa: data.empresa || '',
          cargo: data.cargo || '',
          rendaMensal: data.rendaMensal || ''
        }
      };

      const result = await registerUser(userData);
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError('Erro ao criar conta. Tente novamente.');
      console.error('Erro no registro:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Dados Pessoais</h2>
        <p className="text-gray-600">Preencha suas informações básicas</p>
      </div>

      <Input
        label="Nome Completo *"
        placeholder="João Silva Santos"
        {...register('nomeCompleto', {
          required: 'Nome completo é obrigatório',
          minLength: { value: 2, message: 'Nome deve ter pelo menos 2 caracteres' }
        })}
        error={errors.nomeCompleto?.message}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="CPF *"
          placeholder="000.000.000-00"
          {...register('cpf', {
            required: 'CPF é obrigatório',
            validate: (value) => validateCPF(value) || 'CPF inválido'
          })}
          error={errors.cpf?.message}
          onChange={(e) => {
            const formatted = formatCPF(e.target.value);
            setValue('cpf', formatted);
          }}
        />

        <Input
          label="Data de Nascimento *"
          type="date"
          {...register('dataNascimento', {
            required: 'Data de nascimento é obrigatória'
          })}
          error={errors.dataNascimento?.message}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="E-mail *"
          type="email"
          placeholder="joao@email.com"
          {...register('email', {
            required: 'E-mail é obrigatório',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'E-mail inválido'
            }
          })}
          error={errors.email?.message}
        />

        <Input
          label="Telefone *"
          placeholder="(11) 99999-9999"
          {...register('telefone', {
            required: 'Telefone é obrigatório'
          })}
          error={errors.telefone?.message}
          onChange={(e) => {
            const formatted = formatPhone(e.target.value);
            setValue('telefone', formatted);
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Senha (6 dígitos) *
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="input w-full pr-10"
              placeholder="123456"
              maxLength="6"
              {...register('senha', {
                required: 'Senha é obrigatória',
                minLength: { value: 6, message: 'Senha deve ter 6 dígitos' },
                maxLength: { value: 6, message: 'Senha deve ter 6 dígitos' },
                pattern: {
                  value: /^\d{6}$/,
                  message: 'Senha deve conter apenas números'
                }
              })}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
          {errors.senha && (
            <p className="mt-1 text-sm text-red-600">{errors.senha.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirmar Senha *
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className="input w-full pr-10"
              placeholder="123456"
              maxLength="6"
              {...register('confirmarSenha', {
                required: 'Confirmação de senha é obrigatória',
                validate: (value) => value === watchedValues.senha || 'Senhas não coincidem'
              })}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? (
                <EyeSlashIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
          {errors.confirmarSenha && (
            <p className="mt-1 text-sm text-red-600">{errors.confirmarSenha.message}</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Endereço</h2>
        <p className="text-gray-600">Informe seu endereço residencial</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="CEP *"
          placeholder="00000-000"
          {...register('cep', {
            required: 'CEP é obrigatório',
            pattern: {
              value: /^\d{5}-?\d{3}$/,
              message: 'CEP inválido'
            }
          })}
          error={errors.cep?.message}
          onChange={(e) => {
            const formatted = formatCEP(e.target.value);
            setValue('cep', formatted);
            if (formatted.length === 9) {
              fetchCep(formatted.replace(/\D/g, ''));
            }
          }}
        />

        <Input
          label="Número *"
          placeholder="123"
          {...register('numero', {
            required: 'Número é obrigatório'
          })}
          error={errors.numero?.message}
        />

        <Input
          label="Complemento"
          placeholder="Apto 45, Bloco B"
          {...register('complemento')}
        />
      </div>

      <Input
        label="Logradouro *"
        placeholder="Rua das Flores"
        {...register('logradouro', {
          required: 'Logradouro é obrigatório'
        })}
        error={errors.logradouro?.message}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Bairro *"
          placeholder="Centro"
          {...register('bairro', {
            required: 'Bairro é obrigatório'
          })}
          error={errors.bairro?.message}
        />

        <Input
          label="Cidade *"
          placeholder="São Paulo"
          {...register('cidade', {
            required: 'Cidade é obrigatória'
          })}
          error={errors.cidade?.message}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estado *
          </label>
          <select
            className="input w-full"
            {...register('estado', {
              required: 'Estado é obrigatório'
            })}
          >
            <option value="">Selecione</option>
            <option value="AC">Acre</option>
            <option value="AL">Alagoas</option>
            <option value="AP">Amapá</option>
            <option value="AM">Amazonas</option>
            <option value="BA">Bahia</option>
            <option value="CE">Ceará</option>
            <option value="DF">Distrito Federal</option>
            <option value="ES">Espírito Santo</option>
            <option value="GO">Goiás</option>
            <option value="MA">Maranhão</option>
            <option value="MT">Mato Grosso</option>
            <option value="MS">Mato Grosso do Sul</option>
            <option value="MG">Minas Gerais</option>
            <option value="PA">Pará</option>
            <option value="PB">Paraíba</option>
            <option value="PR">Paraná</option>
            <option value="PE">Pernambuco</option>
            <option value="PI">Piauí</option>
            <option value="RJ">Rio de Janeiro</option>
            <option value="RN">Rio Grande do Norte</option>
            <option value="RS">Rio Grande do Sul</option>
            <option value="RO">Rondônia</option>
            <option value="RR">Roraima</option>
            <option value="SC">Santa Catarina</option>
            <option value="SP">São Paulo</option>
            <option value="SE">Sergipe</option>
            <option value="TO">Tocantins</option>
          </select>
          {errors.estado && (
            <p className="mt-1 text-sm text-red-600">{errors.estado.message}</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Dados Profissionais</h2>
        <p className="text-gray-600">Informe sua situação profissional</p>
      </div>

      <Input
        label="Profissão/Ocupação *"
        placeholder="Analista de Sistemas"
        {...register('profissao', {
          required: 'Profissão é obrigatória'
        })}
        error={errors.profissao?.message}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Empresa"
          placeholder="Tech Solutions Ltda"
          {...register('empresa')}
        />

        <Input
          label="Cargo"
          placeholder="Desenvolvedor Sênior"
          {...register('cargo')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Renda Mensal
        </label>
        <select className="input w-full" {...register('rendaMensal')}>
          <option value="">Selecione sua renda mensal</option>
          <option value="1000">Até R$ 1.000</option>
          <option value="3000">R$ 1.000 a R$ 3.000</option>
          <option value="5000">R$ 3.000 a R$ 5.000</option>
          <option value="10000">R$ 5.000 a R$ 10.000</option>
          <option value="20000">Mais de R$ 10.000</option>
        </select>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirmação</h2>
        <p className="text-gray-600">Revise seus dados e aceite os termos</p>
      </div>

      {/* Resumo dos dados */}
      <div className="bg-gray-50 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Dados Pessoais</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Nome:</span>
            <p className="font-medium">{watchedValues.nomeCompleto}</p>
          </div>
          <div>
            <span className="text-gray-600">CPF:</span>
            <p className="font-medium">{watchedValues.cpf}</p>
          </div>
          <div>
            <span className="text-gray-600">E-mail:</span>
            <p className="font-medium">{watchedValues.email}</p>
          </div>
          <div>
            <span className="text-gray-600">Telefone:</span>
            <p className="font-medium">{watchedValues.telefone}</p>
          </div>
        </div>

        <h3 className="font-semibold text-gray-900 mt-4">Endereço</h3>
        <div className="text-sm">
          <p className="font-medium">
            {watchedValues.logradouro}, {watchedValues.numero}
            {watchedValues.complemento && `, ${watchedValues.complemento}`}
          </p>
          <p className="text-gray-600">
            {watchedValues.bairro} - {watchedValues.cidade}/{watchedValues.estado}
          </p>
          <p className="text-gray-600">CEP: {watchedValues.cep}</p>
        </div>

        <h3 className="font-semibold text-gray-900 mt-4">Dados Profissionais</h3>
        <div className="text-sm">
          <p className="font-medium">{watchedValues.profissao}</p>
          {watchedValues.empresa && <p className="text-gray-600">{watchedValues.empresa}</p>}
          {watchedValues.cargo && <p className="text-gray-600">{watchedValues.cargo}</p>}
        </div>
      </div>

      {/* Termos e condições */}
      <div className="space-y-4">
        <div className="flex items-start">
          <input
            type="checkbox"
            id="aceitaTermos"
            className="mt-1 h-4 w-4 text-agilbank-primary focus:ring-agilbank-primary border-gray-300 rounded"
            {...register('aceitaTermos', {
              required: 'Você deve aceitar os termos de uso'
            })}
          />
          <label htmlFor="aceitaTermos" className="ml-2 text-sm text-gray-700">
            Li e aceito os{' '}
            <Link to="/terms" className="text-agilbank-primary hover:text-blue-700 underline">
              termos e condições
            </Link>{' '}
            para abertura de conta *
          </label>
        </div>
        {errors.aceitaTermos && (
          <p className="text-sm text-red-600">{errors.aceitaTermos.message}</p>
        )}

        <div className="flex items-start">
          <input
            type="checkbox"
            id="aceitaComunicacoes"
            className="mt-1 h-4 w-4 text-agilbank-primary focus:ring-agilbank-primary border-gray-300 rounded"
            {...register('aceitaComunicacoes')}
          />
          <label htmlFor="aceitaComunicacoes" className="ml-2 text-sm text-gray-700">
            Aceito receber comunicações sobre produtos e serviços
          </label>
        </div>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckIcon className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Conta criada com sucesso!</h2>
      <p className="text-gray-600 mb-6">
        Enviamos um email de confirmação para <strong>{watchedValues.email}</strong>
      </p>
      <p className="text-sm text-gray-500">
        Você será redirecionado para o login em alguns segundos...
      </p>
    </div>
  );

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
          {renderSuccess()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/login" className="inline-flex items-center text-agilbank-primary hover:text-blue-700 mb-4">
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Voltar ao login
          </Link>
          <div className="w-16 h-16 bg-agilbank-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">A</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Criar Conta</h1>
          <p className="text-gray-600">Abra sua conta no AgilBank em poucos passos</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`flex items-center ${
                  step <= currentStep ? 'text-agilbank-primary' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step <= currentStep
                      ? 'bg-agilbank-primary text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {step}
                </div>
                {step < 4 && (
                  <div
                    className={`w-16 h-1 mx-2 ${
                      step < currentStep ? 'bg-agilbank-primary' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="text-center text-sm text-gray-600">
            Passo {currentStep} de 4
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow p-8">
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mt-0.5" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Erro</h3>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8">
              <Button
                type="button"
                variant="secondary"
                onClick={prevStep}
                disabled={currentStep === 1}
              >
                Anterior
              </Button>

              {currentStep < 4 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={nextStep}
                >
                  Próximo
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  loading={loading}
                  disabled={loading}
                >
                  Criar Conta
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-agilbank-primary hover:text-blue-700 font-medium">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
