import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../hooks/useAuth.jsx';
import Button from '../../components/Button';
import Input from '../../components/Input';
import './Register.css';

const STEP = {
  WELCOME: 0,
  CPF: 1,
  PERSONAL: 2,
  ADDRESS: 3,
  PROFESSIONAL: 4,
  PASSWORD: 5,
  TERMS: 6
};

const PROGRESS_TOTAL = 6;

/** Evita exibir detalhes técnicos acidentais no fluxo de cadastro. */
function sanitizeUserFacingError(message) {
  if (message == null || typeof message !== 'string') return '';
  const t = message.trim();
  if (!t) return '';
  if (/prisma|p2002|postgresql|unique constraint|stack trace|internal server error/i.test(t)) {
    return 'Não foi possível concluir o cadastro. Tente novamente em instantes.';
  }
  return t;
}

const Register = () => {
  const [currentStep, setCurrentStep] = useState(STEP.WELCOME);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const registeringRef = useRef(false);
  const scrollAreaRef = useRef(null);

  const { register: registerUser } = useAuth();
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
      nomeCompleto: '',
      cpf: '',
      email: '',
      telefone: '',
      dataNascimento: '',
      senha: '',
      confirmarSenha: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: '',
      profissao: '',
      empresa: '',
      cargo: '',
      rendaMensal: '',
      aceitaTermos: false,
      aceitaComunicacoes: false
    }
  });

  const watchedValues = watch();

  const cpfForErrorClear = watch('cpf');
  const emailForErrorClear = watch('email');
  const senhaForErrorClear = watch('senha');

  useEffect(() => {
    setError('');
  }, [cpfForErrorClear, emailForErrorClear, senhaForErrorClear]);

  /* Nova etapa: topo rolável ajuda navegação; reduz campo “atrás” do rodapé no mobile */
  useEffect(() => {
    scrollAreaRef.current?.scrollTo({ top: 0 });
  }, [currentStep]);

  const fetchCep = async (cep) => {
    if (cep.length === 8) {
      try {
        setCepLoading(true);
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (!data.erro) {
          setValue('logradouro', data.logradouro);
          setValue('bairro', data.bairro);
          setValue('cidade', data.localidade);
          setValue('estado', data.uf);
        }
      } catch (fetchErr) {
        if (import.meta.env.DEV) console.error('Erro ao buscar CEP:', fetchErr);
      } finally {
        setCepLoading(false);
      }
    }
  };

  const validateCPF = (cpfRaw) => {
    const cpf = cpfRaw.replace(/[^\d]/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf.charAt(i), 10) * (10 - i);
    }
    let remainder = 11 - (sum % 11);
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(9), 10)) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf.charAt(i), 10) * (11 - i);
    }
    remainder = 11 - (sum % 11);
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(10), 10)) return false;

    return true;
  };

  const formatCPF = (value) =>
    value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .slice(0, 14);

  const formatPhone = (value) =>
    value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(\d{4})-(\d)(\d{4})/, '$1$2-$3')
      .slice(0, 15);

  const formatCEP = (value) =>
    value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 9);

  const getFieldsForStep = (step) => {
    switch (step) {
      case STEP.CPF:
        return ['cpf', 'dataNascimento'];
      case STEP.PERSONAL:
        return ['nomeCompleto', 'email', 'telefone'];
      case STEP.ADDRESS:
        return ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'];
      case STEP.PROFESSIONAL:
        return ['profissao'];
      case STEP.PASSWORD:
        return ['senha', 'confirmarSenha'];
      case STEP.TERMS:
        return ['aceitaTermos'];
      default:
        return [];
    }
  };

  const applyErrorMessage = (raw) => {
    const s = sanitizeUserFacingError(raw);
    setError(s || 'Erro ao criar conta. Tente novamente.');
  };

  const nextStep = async () => {
    const fieldsToValidate = getFieldsForStep(currentStep);
    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, STEP.TERMS));
      setError('');
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, STEP.WELCOME));
    setError('');
  };

  const onSubmit = async (data) => {
    if (registeringRef.current || loading) return;
    registeringRef.current = true;
    setLoading(true);
    setError('');

    try {
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
        }, 3500);
      } else {
        const raw =
          (typeof result.message === 'string' && result.message) ||
          (typeof result.error === 'string' && result.error) ||
          '';
        applyErrorMessage(raw);
      }
    } catch (err) {
      const payload = err.response?.data;
      const validationJoin = Array.isArray(payload?.errors)
        ? payload.errors
            .map((e) => (typeof e?.message === 'string' ? e.message : ''))
            .filter(Boolean)
            .join(' ')
            .trim()
        : '';
      const raw =
        (typeof payload?.message === 'string' && payload.message.trim() && payload.message.trim()) ||
        validationJoin ||
        '';
      applyErrorMessage(raw || 'Erro ao criar conta. Tente novamente.');
      if (!raw && import.meta.env.DEV) console.error('Erro inesperado no registro (sem payload útil da API):', err);
    } finally {
      setLoading(false);
      registeringRef.current = false;
    }
  };

  const progressIndex = Math.max(1, Math.min(currentStep, PROGRESS_TOTAL));

  const scrollPaddingBottom =
    currentStep === STEP.WELCOME
      ? 'calc(9.75rem + env(safe-area-inset-bottom, 0px))'
      : currentStep === STEP.TERMS && error
        ? 'calc(14rem + env(safe-area-inset-bottom, 0px))'
        : currentStep === STEP.TERMS
          ? 'calc(11.5rem + env(safe-area-inset-bottom, 0px))'
          : 'calc(10rem + env(safe-area-inset-bottom, 0px))';

  const EstadoOptions = (
    <>
      <option value="">UF</option>
      <option value="AC">AC</option>
      <option value="AL">AL</option>
      <option value="AP">AP</option>
      <option value="AM">AM</option>
      <option value="BA">BA</option>
      <option value="CE">CE</option>
      <option value="DF">DF</option>
      <option value="ES">ES</option>
      <option value="GO">GO</option>
      <option value="MA">MA</option>
      <option value="MT">MT</option>
      <option value="MS">MS</option>
      <option value="MG">MG</option>
      <option value="PA">PA</option>
      <option value="PB">PB</option>
      <option value="PR">PR</option>
      <option value="PE">PE</option>
      <option value="PI">PI</option>
      <option value="RJ">RJ</option>
      <option value="RN">RN</option>
      <option value="RS">RS</option>
      <option value="RO">RO</option>
      <option value="RR">RR</option>
      <option value="SC">SC</option>
      <option value="SP">SP</option>
      <option value="SE">SE</option>
      <option value="TO">TO</option>
    </>
  );

  const renderWelcome = () => (
    <div className="flex flex-1 flex-col px-6 pb-6 pt-[calc(2rem+env(safe-area-inset-top,0))] sm:pt-12">
      <div className="mb-10 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-agilbank-primary shadow-lg shadow-agilbank-primary/25">
          <span className="text-3xl font-bold text-white">A</span>
        </div>
      </div>
      <h1 className="mb-4 text-[1.65rem] font-bold leading-[1.2] tracking-tight text-gray-900 sm:text-[1.85rem] text-balance">
        Seu AgilBank começa agora.
      </h1>
      <p className="mb-12 text-[0.975rem] leading-relaxed text-gray-600 text-balance">
        Abra sua conta em poucos passos, com segurança e transparência.
      </p>
    </div>
  );

  const renderCpfStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">
        Boas-vindas! Digite seu CPF
      </h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-gray-600">
        Usamos seu CPF para criar seu cadastro com segurança.
      </p>

      <div className="space-y-5">
        <Input
          label="CPF"
          required
          placeholder="000.000.000-00"
          autoComplete="off"
          inputMode="numeric"
          className="py-3.5 text-[1rem]"
          {...register('cpf', {
            required: 'CPF é obrigatório',
            validate: (value) => validateCPF(value) || 'CPF inválido'
          })}
          error={errors.cpf?.message}
          onChange={(e) => setValue('cpf', formatCPF(e.target.value))}
        />
        <Input
          label="Data de nascimento"
          required
          type="date"
          className="py-3.5 text-[1rem]"
          {...register('dataNascimento', {
            required: 'Informe sua data de nascimento'
          })}
          helperText="Necessário para cumprir regras de idade na abertura de conta."
          error={errors.dataNascimento?.message}
        />
      </div>
    </>
  );

  const renderPersonalStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">
        Agora, seus dados pessoais
      </h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-gray-600">
        Esses dados identificam você no aplicativo e nas comunicações oficiais.
      </p>
      <div className="space-y-5">
        <Input
          label="Nome completo"
          required
          placeholder="Como no documento"
          className="py-3.5 text-[1rem]"
          {...register('nomeCompleto', {
            required: 'Nome completo é obrigatório',
            minLength: { value: 2, message: 'Nome deve ter pelo menos 2 caracteres' },
            pattern: {
              value: /^[a-zA-ZÀ-ÿ\s]+$/,
              message: 'Nome deve conter apenas letras e espaços'
            }
          })}
          error={errors.nomeCompleto?.message}
        />
        <Input
          label="E-mail"
          required
          type="email"
          placeholder="seuemail@provedor.com"
          autoComplete="email"
          className="py-3.5 text-[1rem]"
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
          label="Celular"
          required
          placeholder="(11) 99999-9999"
          autoComplete="tel"
          inputMode="tel"
          className="py-3.5 text-[1rem]"
          {...register('telefone', {
            required: 'Telefone é obrigatório'
          })}
          error={errors.telefone?.message}
          onChange={(e) => setValue('telefone', formatPhone(e.target.value))}
        />
      </div>
    </>
  );

  const renderAddressStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Onde você mora?</h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-gray-600">
        Seu endereço será usado no cadastro e no envio de produtos físicos, quando solicitado.
      </p>
      <div className="space-y-5">
        <Input
          label="CEP"
          required
          placeholder="00000-000"
          inputMode="numeric"
          autoComplete="postal-code"
          className="py-3.5 text-[1rem]"
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
          helperText={cepLoading ? 'Buscando endereço...' : ''}
        />
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input
              label="Número"
              required
              placeholder="123"
              className="py-3.5 text-[1rem]"
              {...register('numero', {
                required: 'Número é obrigatório'
              })}
              error={errors.numero?.message}
            />
          </div>
          <Input
            label="Comp."
            placeholder="Apto"
            className="py-3.5 text-[1rem]"
            {...register('complemento')}
            error={errors.complemento?.message}
          />
        </div>
        <Input
          label="Logradouro"
          required
          placeholder="Rua, avenida..."
          className="py-3.5 text-[1rem]"
          {...register('logradouro', {
            required: 'Logradouro é obrigatório'
          })}
          error={errors.logradouro?.message}
        />
        <Input
          label="Bairro"
          required
          placeholder="Bairro"
          className="py-3.5 text-[1rem]"
          {...register('bairro', {
            required: 'Bairro é obrigatório'
          })}
          error={errors.bairro?.message}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Cidade"
            required
            placeholder="Cidade"
            className="py-3.5 text-[1rem]"
            {...register('cidade', {
              required: 'Cidade é obrigatória'
            })}
            error={errors.cidade?.message}
          />
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="register-estado">
              Estado <span className="text-red-500">*</span>
            </label>
            <select
              id="register-estado"
              className={`input min-h-[2.875rem] w-full rounded-xl py-3 text-[1rem] focus:ring-agilbank-primary ${errors.estado ? 'border-red-300 bg-red-50/30' : 'border-gray-300 bg-gray-50'}`}
              aria-invalid={errors.estado ? 'true' : 'false'}
              aria-describedby={errors.estado ? 'register-estado-erro' : undefined}
              {...register('estado', {
                required: 'Estado é obrigatório'
              })}
            >
              {EstadoOptions}
            </select>
            {errors.estado ? (
              <p id="register-estado-erro" className="mt-1 text-sm text-red-600" role="alert">
                {errors.estado.message}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  const renderProfessionalStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">
        Conte um pouco sobre sua profissão
      </h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-gray-600">
        Isso nos ajuda a alinhar ofertas ao seu perfil.
      </p>
      <div className="space-y-5">
        <Input
          label="Profissão ou ocupação"
          required
          placeholder="Ex.: Analista, autônomo, aposentado..."
          className="py-3.5 text-[1rem]"
          {...register('profissao', {
            required: 'Profissão é obrigatória'
          })}
          error={errors.profissao?.message}
        />
        <Input
          label="Empresa"
          placeholder="Opcional"
          className="py-3.5 text-[1rem]"
          {...register('empresa')}
          error={errors.empresa?.message}
        />
        <Input
          label="Cargo"
          placeholder="Opcional"
          className="py-3.5 text-[1rem]"
          {...register('cargo')}
          error={errors.cargo?.message}
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Renda mensal aproximada</label>
          <select className="input min-h-[2.875rem] w-full rounded-xl border-gray-300 bg-gray-50 py-3 text-[1rem] focus:ring-agilbank-primary" {...register('rendaMensal')}>
            <option value="">Prefiro não informar</option>
            <option value="1000">Até R$ 1.000</option>
            <option value="3000">R$ 1.000 a R$ 3.000</option>
            <option value="5000">R$ 3.000 a R$ 5.000</option>
            <option value="10000">R$ 5.000 a R$ 10.000</option>
            <option value="20000">Mais de R$ 10.000</option>
          </select>
        </div>
      </div>
    </>
  );

  const renderPasswordStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">
        Crie sua senha de acesso
      </h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-gray-600">
        Escolha uma senha segura para proteger sua conta — 6 dígitos numéricos.
      </p>
      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="register-senha">
            Senha (6 dígitos)
          </label>
          <div className="relative">
            <input
              id="register-senha"
              type={showPassword ? 'text' : 'password'}
              placeholder="●●●●●●"
              maxLength={6}
              inputMode="numeric"
              autoComplete="new-password"
              className="input min-h-[2.875rem] w-full rounded-xl border-gray-300 bg-gray-50 py-3 pr-11 text-[1.1rem] tracking-widest focus:ring-agilbank-primary"
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
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.senha ? <p className="mt-2 text-sm text-red-600">{errors.senha.message}</p> : null}
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="register-confirmar-senha">
            Confirmar senha
          </label>
          <div className="relative">
            <input
              id="register-confirmar-senha"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="●●●●●●"
              maxLength={6}
              inputMode="numeric"
              autoComplete="new-password"
              className="input min-h-[2.875rem] w-full rounded-xl border-gray-300 bg-gray-50 py-3 pr-11 text-[1.1rem] tracking-widest focus:ring-agilbank-primary"
              {...register('confirmarSenha', {
                required: 'Confirme sua senha',
                validate: (value) => value === watchedValues.senha || 'Senhas não coincidem'
              })}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500"
              onClick={() => setShowConfirmPassword((s) => !s)}
              aria-label={showConfirmPassword ? 'Ocultar confirmação' : 'Mostrar confirmação'}
            >
              {showConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.confirmarSenha ? (
            <p className="mt-2 text-sm text-red-600">{errors.confirmarSenha.message}</p>
          ) : null}
        </div>
      </div>
    </>
  );

  const renderTermsStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">
        Antes de finalizar
      </h1>
      <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">
        Revise e aceite para concluir a abertura da sua conta.
      </p>
      <div className="mb-8 rounded-2xl border border-gray-200 bg-gray-50/90 p-4 text-sm leading-relaxed text-gray-700">
        <dl className="space-y-2">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">Nome</dt>
            <dd className="max-w-[60%] text-right font-medium text-gray-900">{watchedValues.nomeCompleto || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">E-mail</dt>
            <dd className="max-w-[60%] break-all text-right font-medium text-gray-900">{watchedValues.email || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">CPF</dt>
            <dd className="font-medium text-gray-900">{watchedValues.cpf || '—'}</dd>
          </div>
        </dl>
      </div>
      <div className="space-y-5 pt-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-agilbank-primary focus:ring-agilbank-primary"
            {...register('aceitaTermos', {
              required: 'Aceite dos termos e condições é obrigatório'
            })}
          />
          <span className="text-[0.9rem] text-gray-700">
            Li e aceito os{' '}
            <Link to="/terms" className="font-medium text-agilbank-primary underline-offset-4 hover:underline">
              termos e condições
            </Link>{' '}
            para abertura de conta.
          </span>
        </label>
        {errors.aceitaTermos ? (
          <p className="-mt-3 text-sm text-red-600">{errors.aceitaTermos.message}</p>
        ) : null}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-agilbank-primary focus:ring-agilbank-primary"
            {...register('aceitaComunicacoes')}
          />
          <span className="text-[0.9rem] text-gray-600">
            Aceito receber comunicações sobre produtos e serviços AgilBank.
          </span>
        </label>
      </div>
    </>
  );

  const renderStepBody = () => {
    switch (currentStep) {
      case STEP.WELCOME:
        return renderWelcome();
      case STEP.CPF:
        return renderCpfStep();
      case STEP.PERSONAL:
        return renderPersonalStep();
      case STEP.ADDRESS:
        return renderAddressStep();
      case STEP.PROFESSIONAL:
        return renderProfessionalStep();
      case STEP.PASSWORD:
        return renderPasswordStep();
      case STEP.TERMS:
        return renderTermsStep();
      default:
        return null;
    }
  };

  /* --- Layout shell (mobile-first, max 430px no desktop) --- */
  const showProgress = currentStep >= STEP.CPF && currentStep <= STEP.TERMS;

  const footerPrimaryActions = () => {
    if (currentStep >= STEP.TERMS) {
      return (
        <Button
          type="submit"
          form="register-flow-form"
          variant="primary"
          size="lg"
          className="h-13 w-full rounded-xl py-4 text-[1rem] font-semibold shadow-lg shadow-agilbank-primary/20"
          loading={loading}
          disabled={loading}
        >
          Criar conta
        </Button>
      );
    }
    return (
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="h-13 w-full rounded-xl py-4 text-[1rem] font-semibold shadow-lg shadow-agilbank-primary/20"
        onClick={nextStep}
        disabled={loading}
      >
        Continuar
      </Button>
    );
  };

  if (success) {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200/80 px-3 py-6 sm:bg-zinc-100 sm:py-10">
        <div className="register-hero-bg relative flex w-full max-w-[430px] flex-col rounded-3xl shadow-2xl sm:rounded-[2rem] sm:border sm:border-white/70">
          <div className="flex flex-1 flex-col px-8 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-24 text-center">
            <div className="mx-auto mb-10 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <CheckIcon className="h-11 w-11 text-agilbank-success" />
            </div>
            <h1 className="mb-4 text-2xl font-bold leading-snug tracking-tight text-gray-900 sm:text-[1.75rem]">
              Agora é com a gente!
            </h1>
            <p className="mb-2 text-[0.975rem] leading-relaxed text-gray-600">
              Sua conta foi criada com sucesso. Você já pode acessar o AgilBank.
            </p>
            <p className="mb-12 text-[0.8rem] text-gray-500">Redirecionando ao login...</p>
            <Link to="/login" className="text-sm font-semibold text-agilbank-primary hover:underline">
              Ir ao login agora
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const shellOuter = (
    <div className={`flex min-h-[100dvh] justify-center ${currentStep === STEP.WELCOME ? 'bg-agilbank-primary/[0.04]' : 'bg-zinc-200/75'} px-3 py-0 sm:py-10`}>
      <div className={`relative flex w-full max-w-[430px] flex-col min-h-[100dvh] sm:min-h-0 shadow-2xl sm:rounded-[2rem] sm:border border-white/40 overflow-hidden bg-white ${currentStep === STEP.WELCOME ? 'register-hero-bg' : ''}`}>
        {/* Header + progress */}
        {currentStep !== STEP.WELCOME ? (
          <header className="sticky top-0 z-20 border-b border-gray-100/90 bg-white/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0)+0.875rem)] backdrop-blur">
            <div className="relative mb-5 flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label="Voltar"
                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-700 hover:bg-gray-100 active:bg-gray-200"
                onClick={prevStep}
              >
                <ArrowLeftIcon className="h-6 w-6" />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-agilbank-primary shadow-sm">
                <span className="text-sm font-bold text-white">A</span>
              </div>
              <Link
                to="/login"
                className="absolute right-0 text-xs font-medium text-agilbank-primary hover:underline sm:text-[0.8rem]"
                aria-label="Tenho conta: ir para o login"
              >
                Tenho conta
              </Link>
            </div>
            {showProgress ? (
              <div className="space-y-2">
                <div
                  role="progressbar"
                  aria-valuenow={progressIndex}
                  aria-valuemin={1}
                  aria-valuemax={PROGRESS_TOTAL}
                  aria-valuetext={`Etapa ${progressIndex} de ${PROGRESS_TOTAL}`}
                  className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
                >
                  <div
                    className="h-full rounded-full bg-agilbank-primary transition-all duration-500 ease-out"
                    style={{ width: `${(progressIndex / PROGRESS_TOTAL) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  <span>Etapa</span>
                  <span aria-live="polite">
                    {progressIndex} / {PROGRESS_TOTAL}
                  </span>
                </div>
              </div>
            ) : null}
          </header>
        ) : null}

        {/* Conteúdo rolável */}
        <div
          ref={scrollAreaRef}
          role="region"
          aria-label="Formulário de cadastro"
          className={`register-scroll-area flex-1 overflow-y-auto overscroll-y-contain scrollbar-hide ${currentStep === STEP.WELCOME ? '' : 'px-5 pt-5'}`}
          style={{ paddingBottom: scrollPaddingBottom }}
        >
          <form
            id="register-flow-form"
            onSubmit={handleSubmit(onSubmit)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (loading) {
                e.preventDefault();
                return;
              }
              if (currentStep < STEP.TERMS) {
                e.preventDefault();
              }
            }}
          >
            {/* Enter só envia na etapa final (termos) */}
            <fieldset className={currentStep === STEP.WELCOME ? 'min-h-0 sm:min-h-[50vh]' : 'min-h-[50vh]'} disabled={loading}>
              {renderStepBody()}
            </fieldset>
          </form>
        </div>

        {/* Barra inferior fixa */}
        <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center">
          <div className="pointer-events-auto flex w-full max-w-[430px] flex-col gap-3 rounded-t-[1.25rem] border-t border-gray-100 bg-white/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_40px_rgba(0,36,71,0.08)] backdrop-blur-md">
            {currentStep === STEP.WELCOME ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full rounded-xl py-4 text-[1rem] font-semibold shadow-lg shadow-agilbank-primary/25"
                  onClick={() => {
                    setCurrentStep(STEP.CPF);
                    setError('');
                  }}
                >
                  Criar minha conta
                </Button>
                <Link
                  to="/login"
                  className="w-full pb-3 text-center text-[0.95rem] font-medium text-agilbank-primary underline-offset-2 hover:underline"
                  aria-label="Já tenho uma conta — ir para o login"
                >
                  Já tenho uma conta
                </Link>
              </>
            ) : (
              <>
                {currentStep === STEP.TERMS && error ? (
                  <div
                    className="flex gap-3 rounded-xl border border-red-200/90 bg-red-50 p-4 text-[0.875rem]"
                    role="alert"
                    aria-live="assertive"
                  >
                    <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-semibold text-red-900">Algo deu errado</p>
                      <p className="break-words text-red-800/95">{sanitizeUserFacingError(error)}</p>
                    </div>
                  </div>
                ) : null}
                {footerPrimaryActions()}
              </>
            )}
          </div>
        </footer>

        {/* Loading fullscreen */}
        {loading ? (
          <div
            className="register-loading-bg fixed inset-0 z-[200] flex flex-col items-center justify-center px-10 text-white"
            role="status"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="mx-auto mb-10 h-12 w-12 animate-spin rounded-full border-[3px] border-white/35 border-t-white" aria-hidden />
            <p className="text-center text-lg font-semibold tracking-tight">Salvando seus dados...</p>
            <p className="mt-4 text-center text-sm text-blue-100/90">Um instante, estamos criando sua conta com segurança.</p>
          </div>
        ) : null}
      </div>
    </div>
  );

  return shellOuter;
};

export default Register;
