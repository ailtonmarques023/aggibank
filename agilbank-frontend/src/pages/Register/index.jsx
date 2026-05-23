import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../hooks/useAuth.jsx';
import Button from '../../components/Button';
import Input from '../../components/Input';
import './Register.css';
import { BRAND_MEDIA } from '../../constants/brandMedia';
import {
  KYC_ALLOWED_MIME_TYPES,
  KYC_ALLOWED_VIDEO_MIME_TYPES,
  KYC_MAX_FILE_BYTES,
  KYC_VIDEO_MAX_FILE_BYTES,
  fetchKycStatus,
  presignKycUpload,
  confirmKycUpload,
  submitKycForReview,
  putFileToPresignedUrl,
  sha256HexFromFile,
} from '../../services/kycService';
import {
  isOnboardingLinearSubmitEnabled,
  isOnboardingRegisterEnabled,
  submitFullOnboardingApplication,
  createApplication,
  updateCurrentApplication,
  getCurrentApplicationStatus,
  logoutOnboarding,
  getOnboardingKycStatus,
  presignOnboardingKycArtifact,
  confirmOnboardingKycUpload,
  submitOnboardingKycForReview,
  finalizeOnboarding,
} from '../../services/onboardingService';
import { resolveRegisterFailure } from '../../services/registerMessage';
import FaceVideoCapture from '../KycVerification/FaceVideoCapture';

const ONBOARDING_LINEAR = isOnboardingLinearSubmitEnabled();
const ONBOARDING_REGISTER = isOnboardingRegisterEnabled() && !ONBOARDING_LINEAR;
const ONBOARDING_FLAT = ONBOARDING_LINEAR || ONBOARDING_REGISTER;

const LINEAR_REQUIRES_FACE_VIDEO =
  String(import.meta.env.VITE_FEATURE_KYC_REQUIRE_FACE_VIDEO || '').toLowerCase().trim() === 'true';

const ONBOARDING_SESSION_ERROR_CODES = new Set([
  'ONBOARDING_SESSION_REQUIRED',
  'ONBOARDING_SESSION_INVALID',
  'ONBOARDING_SESSION_EXPIRED',
  'ONBOARDING_SESSION_INACTIVE',
]);

const ONBOARDING_SESSION_LOST_MESSAGE =
  'Sua sessão de proposta expirou. Reinicie o cadastro para continuar com segurança.';

const ONBOARDING_KYC_START_FAILED_MESSAGE =
  'Não conseguimos iniciar sua verificação. Tente novamente.';

function isOnboardingSessionLostError(err) {
  return Boolean(err?.code && ONBOARDING_SESSION_ERROR_CODES.has(err.code));
}

const STEP = {
  WELCOME: 0,
  CPF: 1,
  PERSONAL: 2,
  ADDRESS: 3,
  PROFESSIONAL: 4,
  PASSWORD: 5,
  TERMS: 6,
  DOC_FRONT: 7,
  DOC_BACK: 8,
  SELFIE: 9,
  KYC_REVIEW: 10,
  FACE_VIDEO: 11,
  PENDING_REVIEW: 12,
  FINAL_TERMS: 13,
  FINALIZE_SUCCESS: 14,
  RESUBMISSION: 15,
  REJECTED: 16,
  /** Legado (fluxo /auth/register + login silencioso) */
  EMAIL_NOTICE: 17,
  ALL_DONE: 18,
};

const JOURNEY_TOTAL = 10;

function journeyNumerator(step) {
  switch (step) {
    case STEP.WELCOME:
      return 0;
    case STEP.CPF:
      return 1;
    case STEP.PERSONAL:
      return 2;
    case STEP.ADDRESS:
      return 3;
    case STEP.PROFESSIONAL:
      return 4;
    case STEP.PASSWORD:
      return 5;
    case STEP.TERMS:
      return 6;
    case STEP.DOC_FRONT:
    case STEP.DOC_BACK:
      return 7;
    case STEP.SELFIE:
    case STEP.FACE_VIDEO:
    case STEP.KYC_REVIEW:
      return 8;
    case STEP.PENDING_REVIEW:
    case STEP.FINAL_TERMS:
      return 9;
    case STEP.FINALIZE_SUCCESS:
    case STEP.EMAIL_NOTICE:
    case STEP.ALL_DONE:
      return 10;
    default:
      return 0;
  }
}

function parseKycFacingError(err, fallback) {
  const body = err?.response?.data;
  const msg =
    typeof body?.message === 'string' && body.message.trim()
      ? body.message.trim()
      : typeof err?.message === 'string'
        ? err.message.trim()
        : '';
  const sanitized = sanitizeUserFacingError(msg || fallback || '');
  const out = new Error(sanitized || fallback || 'Erro ao processar solicitação.');
  out.code = typeof body?.code === 'string' ? body.code : '';
  out.httpStatus = err?.response?.status;
  return out;
}

function mimeAllowed(file) {
  const m = (file.type || '').trim().toLowerCase();
  if (m && KYC_ALLOWED_MIME_TYPES.includes(m)) return { ok: true, mime: m };
  const ext = String(file.name || '')
    .split('.')
    .pop()
    ?.toLowerCase();
  const guess =
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : '';
  if (guess && KYC_ALLOWED_MIME_TYPES.includes(guess)) return { ok: true, mime: guess };
  return { ok: false, mime: '' };
}

/** Evita exibir detalhes técnicos acidentais no fluxo de cadastro. */
function sanitizeUserFacingError(message) {
  if (message == null || typeof message !== 'string') return '';
  const t = message.trim();
  if (!t) return '';
  if (/prisma|p2002|postgresql|unique constraint|stack trace|internal server error/i.test(t)) {
    return 'Não foi possível concluir o cadastro. Tente novamente em instantes.';
  }
  if (/objectkey|signedurl|x-amz|presigned|r2\.cloudflarestorage|amazonaws\.com/i.test(t)) {
    return '';
  }
  return t;
}

const KYC_UPLOAD_ERROR_DEFAULT =
  'Não conseguimos enviar sua foto. Verifique sua conexão e tente novamente.';

/** Mensagem amigável por falha HTTP no pipeline KYC sem alterar a API */
function pipelineErrorMessage(err, fallback) {
  const bodyMsg =
    typeof err?.response?.data?.message === 'string'
      ? sanitizeUserFacingError(err.response.data.message)
      : '';
  if (bodyMsg && bodyMsg.length > 3) return bodyMsg;

  const status = err?.response?.status;
  const storageHint = /armazenamento|O armazenamento/i.test(String(err?.message || ''));
  if (storageHint) {
    if (status === 403 || status === 401) {
      return 'Não conseguimos salvar sua imagem (acesso negado pelo armazenamento). Use \"Tentar novamente\" ou conclua em Verificação de identidade.';
    }
    return 'O armazenamento não aceitou esta imagem. Verifique sua conexão Wi-Fi ou dados móveis e tente novamente.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Servidores ocupados neste momento. Aguarde um instante e toque em \"Tentar novamente\".';
  }
  if (status === 408 || status === 429 || err?.code === 'ECONNABORTED') {
    return 'A conexão expirou ou houve excesso de pedidos. Espere poucos segundos e tente de novo.';
  }
  const url =
    typeof err?.config?.url === 'string' ? err.config.url : typeof err?.request?.responseURL === 'string' ? err.request.responseURL : '';
  if (/confirm-upload/i.test(url) || /confirm-upload/i.test(String(err?.message || ''))) {
    const fb = sanitizeUserFacingError(fallback || '');
    return fb || 'Não confirmamos o arquivo no servidor. Selecione a foto novamente.';
  }
  if (/presign|\/me\/kyc\/presign/i.test(url)) {
    return 'Não foi possível preparar o envio. Tente novamente em instantes.';
  }
  if (status >= 400 && status < 500 && fallback) {
    return sanitizeUserFacingError(fallback) || 'Não foi possível concluir este passo. Tente de novo.';
  }
  const fb = sanitizeUserFacingError(fallback || '');
  return fb || 'Erro ao processar. Use \"Tentar novamente\" ou concluir mais tarde em Verificação de identidade.';
}

const REGISTER_LOADING_MESSAGES = {
  /**
   * Passo 6 (termos) → passo 7 (documento): overlay temporário.
   * Não comunica conclusão da jornada — só continuidade até os próximos passos.
   */
  intermediate: {
    title: 'Salvando seus dados iniciais…',
    detail: 'Estamos preparando os próximos passos.',
  },
  /** Último instante após login silencioso antes de exibir a captura de documento. */
  afterKyc: {
    title: 'Carregando próximos passos…',
    detail: 'Só um instante para abrir a etapa de documento e selfie.',
  },
};

const Register = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(STEP.WELCOME);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  /** Após POST /register + sessão por login silencioso (register não devolve JWT). */
  const [accountCreated, setAccountCreated] = useState(false);
  const [kycStatus, setKycStatus] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [kycStepError, setKycStepError] = useState('');
  const [reviewError, setReviewError] = useState('');
  /** Conta já criada (POST OK) mas login silencioso falhou — oferecer retry SEM novo register. */
  const [needsSilentLoginRetry, setNeedsSilentLoginRetry] = useState(false);
  const [registrationLoadingCopy, setRegistrationLoadingCopy] = useState(REGISTER_LOADING_MESSAGES.intermediate);
  const [featureDisabledHint, setFeatureDisabledHint] = useState('');
  const [localPreviewUrlByType, setLocalPreviewUrlByType] = useState({});
  /** Overlay KYC granular: checksum | presign | put | confirm | refresh */
  const [uploadPhaseCopy, setUploadPhaseCopy] = useState(null);
  const [submitOverlayCopy, setSubmitOverlayCopy] = useState(null);

  const registeringRef = useRef(false);
  /** POST /register já retornou sucesso nesta página; próximo submit só tenta login silencioso. */
  const registrationPostSucceededRef = useRef(false);
  /** Bloqueia GET status/KYC após reinício ou enquanto estado local ainda não reflete proposta ativa. */
  const skipOnboardingApiProbeRef = useRef(false);
  /** true somente após GET /applications/current/status 200 nesta sessão de cadastro. */
  const onboardingSessionReadyRef = useRef(false);
  const scrollAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewRegistry = useRef([]);
  /** Arquivos KYC mantidos no dispositivo até o envio final (fluxo linear). */
  const linearLocalFilesRef = useRef({
    documentFront: null,
    documentBack: null,
    selfiePortrait: null,
    faceVideo: null,
  });

  const REGISTER_FORM_DEFAULTS = {
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
    aceitaComunicacoes: false,
    aceitaConsentimentoBiometrico: false,
    aceitaPoliticaPrivacidade: false,
    aceitaTermosFinais: false,
  };

  const { register: registerUser, login } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset: resetRegisterForm,
    formState: { errors },
    trigger,
  } = useForm({
    defaultValues: REGISTER_FORM_DEFAULTS,
  });

  const [applicationStatus, setApplicationStatus] = useState(null);
  const [onboardingSessionLost, setOnboardingSessionLost] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeMessage, setFinalizeMessage] = useState('');
  const [linearProtocolNumber, setLinearProtocolNumber] = useState('');
  const [linearSubmitMessage, setLinearSubmitMessage] = useState('');

  const watchedValues = watch();
  const requiresFaceVideo = ONBOARDING_LINEAR
    ? LINEAR_REQUIRES_FACE_VIDEO
    : Boolean(kycStatus?.requiredArtifacts?.includes('FACE_VIDEO'));

  const cpfForErrorClear = watch('cpf');
  const emailForErrorClear = watch('email');
  const senhaForErrorClear = watch('senha');

  useEffect(() => {
    setError('');
  }, [cpfForErrorClear, emailForErrorClear, senhaForErrorClear]);

  useEffect(() => {
    if (!ONBOARDING_REGISTER || ONBOARDING_LINEAR || skipOnboardingApiProbeRef.current) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await getCurrentApplicationStatus();
        if (cancelled || skipOnboardingApiProbeRef.current) return;
        const st = res?.data?.status;
        setApplicationStatus(st || null);
        setAccountCreated(true);
        setOnboardingSessionLost(false);
        onboardingSessionReadyRef.current = true;
        if (st === 'DOCUMENTS_APPROVED') {
          setCurrentStep(STEP.FINAL_TERMS);
        } else if (st === 'DOCUMENTS_PENDING' || st === 'DATA_RECEIVED') {
          try {
            const kyc = await getOnboardingKycStatus().then((r) => r.data);
            if (cancelled || skipOnboardingApiProbeRef.current) return;
            setKycStatus(kyc);
            if (kyc?.identityStatus === 'READY_FOR_REVIEW' || kyc?.identityStatus === 'UNDER_MANUAL_REVIEW') {
              setCurrentStep(STEP.PENDING_REVIEW);
            } else if (kyc?.submittedArtifacts?.length) {
              setCurrentStep(STEP.KYC_REVIEW);
            } else {
              setCurrentStep(STEP.DOC_FRONT);
            }
          } catch (err) {
            if (cancelled || skipOnboardingApiProbeRef.current) return;
            if (isOnboardingSessionLostError(err)) {
              setAccountCreated(false);
              setOnboardingSessionLost(true);
            } else {
              setCurrentStep(STEP.DOC_FRONT);
            }
          }
        } else if (st === 'RESUBMISSION_REQUIRED') {
          setCurrentStep(STEP.RESUBMISSION);
        } else if (st === 'REJECTED') {
          setCurrentStep(STEP.REJECTED);
        } else if (st === 'FINALIZED') {
          setCurrentStep(STEP.FINALIZE_SUCCESS);
        }
      } catch (err) {
        if (cancelled || skipOnboardingApiProbeRef.current) return;
        if (isOnboardingSessionLostError(err)) {
          setAccountCreated(false);
          setOnboardingSessionLost(false);
          setCurrentStep(STEP.CPF);
        }
        /* sem cookie — fluxo novo: permanece em WELCOME/CPF */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ONBOARDING_REGISTER || ONBOARDING_LINEAR || skipOnboardingApiProbeRef.current) return undefined;
    if (!onboardingSessionReadyRef.current) return undefined;
    if (!accountCreated || onboardingSessionLost) return undefined;
    if (currentStep < STEP.DOC_FRONT || currentStep > STEP.KYC_REVIEW) return undefined;

    let cancelled = false;
    (async () => {
      try {
        await getCurrentApplicationStatus();
      } catch (err) {
        if (!cancelled && !skipOnboardingApiProbeRef.current && isOnboardingSessionLostError(err)) {
          setAccountCreated(false);
          onboardingSessionReadyRef.current = false;
          setOnboardingSessionLost(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStep, accountCreated, onboardingSessionLost]);

  /* Nova etapa: topo rolável ajuda navegação; reduz campo “atrás” do rodapé no mobile */
  useEffect(() => {
    scrollAreaRef.current?.scrollTo({ top: 0 });
  }, [currentStep]);

  const registerObjectUrl = useCallback((url) => {
    previewRegistry.current.push(url);
    return url;
  }, []);

  const revokePreviewForType = useCallback((artifactType) => {
    setLocalPreviewUrlByType((prev) => {
      const cur = prev[artifactType];
      if (cur) {
        try {
          URL.revokeObjectURL(cur);
        } catch (_) {
          /* ignore */
        }
      }
      const next = { ...prev };
      delete next[artifactType];
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      previewRegistry.current.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {
          /* ignore */
        }
      });
    };
  }, []);

  const hasActiveOnboardingProposal = useCallback(
    () =>
      ONBOARDING_REGISTER &&
      onboardingSessionReadyRef.current &&
      accountCreated &&
      !onboardingSessionLost &&
      !skipOnboardingApiProbeRef.current,
    [accountCreated, onboardingSessionLost]
  );

  const refreshKycStatus = useCallback(async () => {
    if (ONBOARDING_REGISTER && !hasActiveOnboardingProposal()) {
      return null;
    }
    try {
      const data = ONBOARDING_REGISTER ? await getOnboardingKycStatus().then((r) => r.data) : await fetchKycStatus();
      setKycStatus(data);
      setFeatureDisabledHint('');
      return data;
    } catch (err) {
      const status = err?.status;
      const code = err?.code;
      if (ONBOARDING_REGISTER && (status === 503 || code === 'FEATURE_KYC_DISABLED' || code === 'ONBOARDING_APPLICATION_DISABLED')) {
        setFeatureDisabledHint(
          'O envio de documentos está temporariamente indisponível. Tente novamente em instantes.'
        );
        throw err;
      }
      const e = parseKycFacingError(err, 'Não foi possível atualizar seu status.');
      if (e.httpStatus === 503 || e.code === 'FEATURE_KYC_DISABLED') {
        setFeatureDisabledHint(
          'O envio de documentos está temporariamente indisponível. Você pode continuar usando o AgilBank e concluir isso mais tarde na área Verificação de identidade.'
        );
      }
      if (ONBOARDING_REGISTER && isOnboardingSessionLostError(err)) {
        setAccountCreated(false);
        onboardingSessionReadyRef.current = false;
        setOnboardingSessionLost(true);
      }
      throw e;
    }
  }, [hasActiveOnboardingProposal]);

  const refreshApplicationStatus = useCallback(async () => {
    if (!ONBOARDING_REGISTER || !hasActiveOnboardingProposal()) return null;
    const res = await getCurrentApplicationStatus();
    const st = res?.data?.status;
    setApplicationStatus(st || null);
    return st;
  }, [hasActiveOnboardingProposal]);

  const routeAfterKycSubmit = useCallback(async () => {
    const appSt = await refreshApplicationStatus();
    if (appSt === 'DOCUMENTS_APPROVED') {
      setCurrentStep(STEP.FINAL_TERMS);
      return;
    }
    if (appSt === 'RESUBMISSION_REQUIRED') {
      setCurrentStep(STEP.RESUBMISSION);
      return;
    }
    if (appSt === 'REJECTED') {
      setCurrentStep(STEP.REJECTED);
      return;
    }
    setCurrentStep(STEP.PENDING_REVIEW);
  }, [refreshApplicationStatus]);

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
        return ONBOARDING_REGISTER
          ? ['aceitaConsentimentoBiometrico']
          : ['aceitaTermos'];
      case STEP.FINAL_TERMS:
        return ['aceitaTermosFinais', 'aceitaPoliticaPrivacidade'];
      default:
        return [];
    }
  };

  const applyErrorMessage = (raw) => {
    const s = sanitizeUserFacingError(raw);
    setError(s || 'Erro ao criar conta. Tente novamente.');
  };

  const resetOnboardingApplicationState = useCallback(() => {
    skipOnboardingApiProbeRef.current = true;
    previewRegistry.current.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch (_) {
        /* ignore */
      }
    });
    previewRegistry.current = [];
    onboardingSessionReadyRef.current = false;
    setAccountCreated(false);
    setOnboardingSessionLost(false);
    setApplicationStatus(null);
    setKycStatus(null);
    setKycStepError('');
    setReviewError('');
    setFeatureDisabledHint('');
    setLocalPreviewUrlByType({});
    setError('');
    setUploadBusy(false);
    setSubmitBusy(false);
    setUploadPhaseCopy(null);
    setSubmitOverlayCopy(null);
    setFinalizeBusy(false);
    setFinalizeMessage('');
    setLoading(false);
    setNeedsSilentLoginRetry(false);
    registeringRef.current = false;
    registrationPostSucceededRef.current = false;
    linearLocalFilesRef.current = {
      documentFront: null,
      documentBack: null,
      selfiePortrait: null,
      faceVideo: null,
    };
    setLinearProtocolNumber('');
    setLinearSubmitMessage('');
    resetRegisterForm(REGISTER_FORM_DEFAULTS);
    setCurrentStep(STEP.CPF);
    window.setTimeout(() => {
      skipOnboardingApiProbeRef.current = false;
    }, 0);
  }, [resetRegisterForm]);

  const handleRestartOnboarding = useCallback(async () => {
    skipOnboardingApiProbeRef.current = true;
    try {
      await logoutOnboarding();
    } catch (_) {
      /* 401 ou sem cookie — ignorar */
    }
    resetOnboardingApplicationState();
    scrollAreaRef.current?.scrollTo({ top: 0 });
  }, [resetOnboardingApplicationState]);

  const nextStep = async () => {
    const fieldsToValidate = getFieldsForStep(currentStep);
    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, STEP.TERMS));
      setError('');
    }
  };

  const advanceLinearCaptureStep = () => {
    if (currentStep === STEP.DOC_FRONT) setCurrentStep(STEP.DOC_BACK);
    else if (currentStep === STEP.DOC_BACK) setCurrentStep(STEP.SELFIE);
    else if (currentStep === STEP.SELFIE) {
      setCurrentStep(requiresFaceVideo ? STEP.FACE_VIDEO : STEP.FINAL_TERMS);
    } else if (currentStep === STEP.FACE_VIDEO) setCurrentStep(STEP.FINAL_TERMS);
  };

  const buildLinearSubmitFormData = (data) => {
    const fd = new FormData();
    fd.append('cpf', String(data.cpf || '').replace(/\D/g, ''));
    fd.append('dataNascimento', data.dataNascimento || '');
    fd.append('nome', data.nomeCompleto || '');
    fd.append('email', String(data.email || '').trim());
    fd.append('telefone', String(data.telefone || '').replace(/\D/g, ''));
    fd.append('senha', data.senha || '');
    fd.append('cep', String(data.cep || '').replace(/\D/g, ''));
    fd.append('rua', data.logradouro || '');
    fd.append('numero', data.numero || '');
    fd.append('complemento', data.complemento || '');
    fd.append('bairro', data.bairro || '');
    fd.append('cidade', data.cidade || '');
    fd.append('estado', data.estado || '');
    fd.append('profissao', data.profissao || '');
    if (data.empresa) fd.append('empresa', data.empresa);
    if (data.cargo) fd.append('cargo', data.cargo);
    if (data.rendaMensal) fd.append('rendaMensal', data.rendaMensal);
    fd.append('aceitaConsentimentoBiometrico', 'true');
    fd.append('acceptedTerms', 'true');
    fd.append('acceptedPrivacyPolicy', 'true');
    fd.append('aceitaComunicacoes', data.aceitaComunicacoes ? 'true' : 'false');
    const files = linearLocalFilesRef.current;
    fd.append('documentFront', files.documentFront, files.documentFront.name || 'document-front.jpg');
    fd.append('documentBack', files.documentBack, files.documentBack.name || 'document-back.jpg');
    fd.append('selfiePortrait', files.selfiePortrait, files.selfiePortrait.name || 'selfie.jpg');
    if (files.faceVideo) {
      fd.append('faceVideo', files.faceVideo, files.faceVideo.name || 'face.webm');
    }
    return fd;
  };

  const handleLinearSubmitProposal = async () => {
    const termsOk = await trigger(['aceitaTermosFinais', 'aceitaPoliticaPrivacidade']);
    if (!termsOk) return;

    const files = linearLocalFilesRef.current;
    if (!files.documentFront || !files.documentBack || !files.selfiePortrait) {
      applyErrorMessage('Envie a frente, o verso do documento e a selfie antes de enviar a proposta.');
      setCurrentStep(STEP.DOC_FRONT);
      return;
    }
    if (requiresFaceVideo && !files.faceVideo) {
      applyErrorMessage('Envie o vídeo facial antes de enviar a proposta.');
      setCurrentStep(STEP.FACE_VIDEO);
      return;
    }

    setFinalizeBusy(true);
    setError('');
    setRegistrationLoadingCopy({
      title: 'Enviando sua proposta com segurança...',
      detail: 'Aguarde enquanto validamos seus dados e documentos.',
    });

    try {
      const result = await submitFullOnboardingApplication(buildLinearSubmitFormData(watchedValues));
      setLinearProtocolNumber(result.protocolNumber || '');
      setLinearSubmitMessage(result.message || '');

      if (result.status === 'FINALIZED') {
        setFinalizeMessage(
          result.message || 'Conta criada com sucesso. Enviamos um e-mail para confirmar seu cadastro.'
        );
        setCurrentStep(STEP.FINALIZE_SUCCESS);
        return;
      }
      if (result.status === 'RESUBMISSION_REQUIRED') {
        setCurrentStep(STEP.RESUBMISSION);
        return;
      }
      setCurrentStep(STEP.PENDING_REVIEW);
    } catch (err) {
      const msg =
        typeof err?.message === 'string' && err.message.trim()
          ? sanitizeUserFacingError(err.message)
          : 'Não foi possível enviar sua proposta. Tente novamente.';
      applyErrorMessage(msg);
    } finally {
      setFinalizeBusy(false);
      setRegistrationLoadingCopy(REGISTER_LOADING_MESSAGES.intermediate);
    }
  };

  const prevStep = () => {
    setKycStepError('');
    setReviewError('');
    if (ONBOARDING_LINEAR) {
      if (currentStep <= STEP.CPF) {
        setCurrentStep(STEP.WELCOME);
        setError('');
        return;
      }
      if (currentStep === STEP.DOC_FRONT) setCurrentStep(STEP.TERMS);
      else if (currentStep === STEP.DOC_BACK) setCurrentStep(STEP.DOC_FRONT);
      else if (currentStep === STEP.SELFIE) setCurrentStep(STEP.DOC_BACK);
      else if (currentStep === STEP.FACE_VIDEO) setCurrentStep(STEP.SELFIE);
      else if (currentStep === STEP.FINAL_TERMS) {
        setCurrentStep(requiresFaceVideo ? STEP.FACE_VIDEO : STEP.SELFIE);
      } else if (currentStep === STEP.PENDING_REVIEW || currentStep === STEP.RESUBMISSION) {
        setCurrentStep(STEP.FINAL_TERMS);
      }
      setError('');
      return;
    }
    if (!accountCreated) {
      if (!ONBOARDING_REGISTER) setNeedsSilentLoginRetry(false);
      setCurrentStep((prev) => Math.max(prev - 1, STEP.WELCOME));
      setError('');
      return;
    }
    if (currentStep === STEP.DOC_FRONT) return;
    if (currentStep === STEP.DOC_BACK) setCurrentStep(STEP.DOC_FRONT);
    else if (currentStep === STEP.SELFIE) setCurrentStep(STEP.DOC_BACK);
    else if (currentStep === STEP.FACE_VIDEO) setCurrentStep(STEP.SELFIE);
    else if (currentStep === STEP.KYC_REVIEW) {
      setCurrentStep(requiresFaceVideo ? STEP.FACE_VIDEO : STEP.SELFIE);
    } else if (currentStep === STEP.FINAL_TERMS) setCurrentStep(STEP.PENDING_REVIEW);
    else if (currentStep === STEP.EMAIL_NOTICE) setCurrentStep(STEP.KYC_REVIEW);
    else if (currentStep === STEP.ALL_DONE || currentStep === STEP.FINALIZE_SUCCESS) {
      setCurrentStep(ONBOARDING_REGISTER ? STEP.FINAL_TERMS : STEP.EMAIL_NOTICE);
    }
  };

  const signInSilentlyThenOpenKyc = async (emailTrim, senhaPlain) => {
    const loginRes = await login(emailTrim, senhaPlain);
    if (!loginRes.success) {
      const raw = typeof loginRes.message === 'string' && loginRes.message.trim() ? loginRes.message.trim() : '';
      applyErrorMessage(
        `${sanitizeUserFacingError(raw) || 'O cadastro pode ter sido criado.'} Use “Tentar abrir sessão novamente” abaixo. Se seguir assim, vá em Entrar manualmente.`
      );
      setNeedsSilentLoginRetry(true);
      return false;
    }

    setNeedsSilentLoginRetry(false);
    setAccountCreated(true);
    setRegistrationLoadingCopy(REGISTER_LOADING_MESSAGES.afterKyc);
    try {
      await refreshKycStatus();
    } catch (_) {
      /* Hint de indisponibilidade pode ficar aplicado pelo refresh */
    }
    setCurrentStep(STEP.DOC_FRONT);
    return true;
  };

  const retrySilentLoginOnly = async () => {
    const emailTrim = watchedValues.email?.trim();
    const senhaPlain = watchedValues.senha;
    if (!emailTrim || typeof senhaPlain !== 'string' || senhaPlain.length !== 6) {
      setError(
        'Precisamos do mesmo e-mail e da sua senha de 6 dígitos. Volte um passo e confira ou use Entrar manualmente.'
      );
      return;
    }
    if (registeringRef.current || loading) return;
    registeringRef.current = true;
    setLoading(true);
    setError('');
    try {
      setRegistrationLoadingCopy(REGISTER_LOADING_MESSAGES.intermediate);
      await signInSilentlyThenOpenKyc(emailTrim, senhaPlain);
    } catch (_) {
      applyErrorMessage(
        'Não foi possível abrir sessão neste momento. Tente novamente ou use login manual pelo menu Entrar.'
      );
      setNeedsSilentLoginRetry(true);
    } finally {
      setLoading(false);
      registeringRef.current = false;
      setRegistrationLoadingCopy(REGISTER_LOADING_MESSAGES.intermediate);
    }
  };

  const buildOnboardingPatchBody = (data) => ({
    nomeCompleto: data.nomeCompleto,
    email: data.email,
    cpf: data.cpf.replace(/\D/g, ''),
    telefone: data.telefone.replace(/\D/g, ''),
    dataNascimento: data.dataNascimento,
    senha: data.senha,
    aceitaComunicacoes: data.aceitaComunicacoes === true,
    aceitaConsentimentoBiometrico: data.aceitaConsentimentoBiometrico === true,
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
  });

  const onSubmitOnboardingTerms = async (data) => {
    setRegistrationLoadingCopy(REGISTER_LOADING_MESSAGES.intermediate);
    onboardingSessionReadyRef.current = false;
    try {
      if (!accountCreated) {
        await createApplication();
      }
      await updateCurrentApplication(buildOnboardingPatchBody(data));

      const statusRes = await getCurrentApplicationStatus();
      const st = statusRes?.data?.status;
      if (!st) {
        throw Object.assign(new Error(ONBOARDING_KYC_START_FAILED_MESSAGE), {
          code: 'ONBOARDING_SESSION_REQUIRED',
          status: 401,
        });
      }

      setApplicationStatus(st);
      setAccountCreated(true);
      setOnboardingSessionLost(false);
      onboardingSessionReadyRef.current = true;

      try {
        const kyc = await getOnboardingKycStatus().then((r) => r.data);
        setKycStatus(kyc);
      } catch (kycErr) {
        if (isOnboardingSessionLostError(kycErr)) {
          setAccountCreated(false);
          onboardingSessionReadyRef.current = false;
          applyErrorMessage(ONBOARDING_KYC_START_FAILED_MESSAGE);
          return;
        }
        if (import.meta.env.DEV) {
          console.warn('[Register] KYC status prefetch skipped', kycErr?.code || kycErr?.message);
        }
      }

      setCurrentStep(STEP.DOC_FRONT);
    } catch (err) {
      setAccountCreated(false);
      onboardingSessionReadyRef.current = false;
      if (isOnboardingSessionLostError(err)) {
        setOnboardingSessionLost(false);
        applyErrorMessage(ONBOARDING_KYC_START_FAILED_MESSAGE);
        return;
      }
      const msg =
        typeof err?.message === 'string' && err.message.trim()
          ? sanitizeUserFacingError(err.message)
          : 'Não foi possível salvar sua proposta. Tente novamente.';
      applyErrorMessage(msg);
      if (err?.code === 'ONBOARDING_APPLICATION_DISABLED') {
        applyErrorMessage(
          'Abertura de conta por proposta está indisponível no momento. Tente mais tarde ou use o cadastro alternativo.'
        );
      }
    }
  };

  const onSubmit = async (data) => {
    if (currentStep !== STEP.TERMS) return;
    if (registeringRef.current || loading) return;
    registeringRef.current = true;
    setLoading(true);
    setError('');
    setRegistrationLoadingCopy(REGISTER_LOADING_MESSAGES.intermediate);

    try {
      if (ONBOARDING_LINEAR) {
        const consentOk = await trigger(['aceitaConsentimentoBiometrico']);
        if (!consentOk) return;
        setCurrentStep(STEP.DOC_FRONT);
        return;
      }

      if (ONBOARDING_REGISTER) {
        await onSubmitOnboardingTerms(data);
        return;
      }

      if (needsSilentLoginRetry) return;
      setNeedsSilentLoginRetry(false);

      if (!registrationPostSucceededRef.current) {
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

        if (!result.success) {
          registrationPostSucceededRef.current = false;
          const raw =
            (typeof result.message === 'string' && result.message) ||
            (typeof result.error === 'string' && result.error) ||
            '';
          applyErrorMessage(raw);
          return;
        }
        registrationPostSucceededRef.current = true;
      }

      setRegistrationLoadingCopy(REGISTER_LOADING_MESSAGES.intermediate);
      const progressed = await signInSilentlyThenOpenKyc(data.email.trim(), data.senha);
      if (progressed) registrationPostSucceededRef.current = false;
      if (!progressed) return;
    } catch (err) {
      applyErrorMessage(resolveRegisterFailure(err).message);
      if (import.meta.env.DEV) console.error('Erro inesperado no registro:', err);
      if (!ONBOARDING_REGISTER) setNeedsSilentLoginRetry(false);
    } finally {
      setLoading(false);
      registeringRef.current = false;
      setRegistrationLoadingCopy(REGISTER_LOADING_MESSAGES.intermediate);
    }
  };

  const artifactForUiStep = (uiStep) => {
    if (uiStep === STEP.DOC_FRONT) return 'DOCUMENT_FRONT';
    if (uiStep === STEP.DOC_BACK) return 'DOCUMENT_BACK';
    if (uiStep === STEP.SELFIE) return 'SELFIE_PORTRAIT';
    if (uiStep === STEP.FACE_VIDEO) return 'FACE_VIDEO';
    return null;
  };

  const mimeAllowedForArtifact = (file, artifactType) => {
    if (artifactType === 'FACE_VIDEO') {
      const m = (file.type || '').trim().toLowerCase();
      if (m && KYC_ALLOWED_VIDEO_MIME_TYPES.includes(m)) return { ok: true, mime: m };
      const ext = String(file.name || '').split('.').pop()?.toLowerCase();
      const guess = ext === 'webm' ? 'video/webm' : ext === 'mp4' ? 'video/mp4' : '';
      if (guess && KYC_ALLOWED_VIDEO_MIME_TYPES.includes(guess)) return { ok: true, mime: guess };
      return { ok: false, mime: '' };
    }
    return mimeAllowed(file);
  };

  const uploadArtifactOnboarding = async (file, at, mime) => {
    if (!hasActiveOnboardingProposal()) {
      setAccountCreated(false);
      setOnboardingSessionLost(true);
      throw Object.assign(new Error(ONBOARDING_SESSION_LOST_MESSAGE), {
        code: 'ONBOARDING_SESSION_REQUIRED',
      });
    }
    const checksum = await sha256HexFromFile(file);
    const presignPayload = await presignOnboardingKycArtifact({
      artifactType: at,
      mimeType: mime,
      byteSize: file.size
    }).then((r) => r.data);
    await putFileToPresignedUrl(presignPayload.uploadUrl, file, presignPayload.headers);
    await confirmOnboardingKycUpload({
      artifactId: presignPayload.artifactId,
      checksumSHA256: checksum
    });
  };

  const handlePickFile = async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    if (ONBOARDING_LINEAR) {
      const atLinear = artifactForUiStep(currentStep);
      if (!atLinear) return;
      setKycStepError('');
      const { ok, mime } = mimeAllowedForArtifact(file, atLinear);
      if (!ok) {
        setKycStepError(atLinear === 'FACE_VIDEO' ? 'Use vídeo WebM ou MP4.' : 'Use JPG, PNG ou WebP.');
        return;
      }
      const maxBytes = atLinear === 'FACE_VIDEO' ? KYC_VIDEO_MAX_FILE_BYTES : KYC_MAX_FILE_BYTES;
      if (file.size <= 0 || file.size > maxBytes) {
        setKycStepError(`O arquivo deve ter até ${Math.round(maxBytes / (1024 * 1024))} MB.`);
        return;
      }
      revokePreviewForType(atLinear);
      const previewUrl = registerObjectUrl(URL.createObjectURL(file));
      setLocalPreviewUrlByType((prev) => ({ ...prev, [atLinear]: previewUrl }));
      const fieldKey =
        atLinear === 'DOCUMENT_FRONT'
          ? 'documentFront'
          : atLinear === 'DOCUMENT_BACK'
            ? 'documentBack'
            : 'selfiePortrait';
      linearLocalFilesRef.current[fieldKey] = file;
      advanceLinearCaptureStep();
      return;
    }

    if (ONBOARDING_REGISTER && !hasActiveOnboardingProposal()) {
      setAccountCreated(false);
      setOnboardingSessionLost(true);
      return;
    }

    const at = artifactForUiStep(currentStep);
    if (!at) return;

    setKycStepError('');
    const { ok, mime } = mimeAllowedForArtifact(file, at);
    if (!ok) {
      setKycStepError(at === 'FACE_VIDEO' ? 'Use vídeo WebM ou MP4.' : 'Use JPG, PNG ou WebP.');
      return;
    }
    const maxBytes = at === 'FACE_VIDEO' ? KYC_VIDEO_MAX_FILE_BYTES : KYC_MAX_FILE_BYTES;
    if (file.size <= 0 || file.size > maxBytes) {
      setKycStepError(`O arquivo deve ter até ${Math.round(maxBytes / (1024 * 1024))} MB.`);
      return;
    }

    revokePreviewForType(at);
    const previewUrl = registerObjectUrl(URL.createObjectURL(file));
    setLocalPreviewUrlByType((prev) => ({ ...prev, [at]: previewUrl }));

    setUploadBusy(true);
    setUploadPhaseCopy({
      title: 'Preparando envio…',
      detail: 'Lemos sua foto e validamos formato antes do envio seguro.',
    });
    try {
      let checksum;
      try {
        checksum = await sha256HexFromFile(file);
      } catch (_) {
        setKycStepError(
          'Não foi possível preparar esta imagem. Escolha outro arquivo JPG, PNG ou WebP bem nítido e tente novamente.'
        );
        revokePreviewForType(at);
        return;
      }

      setUploadPhaseCopy({
        title: 'Reservando espaço para envio…',
        detail: 'Comunicação com servidor AgilBank (pré‑assinatura do arquivo).',
      });
      const isSelfie = at === 'SELFIE_PORTRAIT';
      const isVideo = at === 'FACE_VIDEO';
      setUploadPhaseCopy({
        title: isVideo ? 'Enviando vídeo facial…' : isSelfie ? 'Enviando sua selfie…' : 'Enviando o documento…',
        detail: 'Upload direto para o armazenamento seguro.',
      });

      if (ONBOARDING_REGISTER && accountCreated) {
        await uploadArtifactOnboarding(file, at, mime);
      } else {
        const presignPayload = await presignKycUpload({
          artifactType: at,
          mimeType: mime,
          byteSize: file.size
        });
        await putFileToPresignedUrl(presignPayload.uploadUrl, file, presignPayload.headers);
        setUploadPhaseCopy({
          title: 'Confirmando arquivo…',
          detail: 'Garantimos que sua imagem chegou completa aos nossos servidores.',
        });
        await confirmKycUpload({
          artifactId: presignPayload.artifactId,
          checksumSHA256: checksum
        });
      }

      setUploadPhaseCopy({
        title: 'Atualizando seu progresso…',
        detail: 'Sincronizando as etapas desta abertura de conta.',
      });
      await refreshKycStatus();
      if (currentStep === STEP.DOC_FRONT) setCurrentStep(STEP.DOC_BACK);
      else if (currentStep === STEP.DOC_BACK) setCurrentStep(STEP.SELFIE);
      else if (currentStep === STEP.SELFIE) {
        const status = await refreshKycStatus().catch(() => kycStatus);
        const needVideo = status?.requiredArtifacts?.includes('FACE_VIDEO');
        setCurrentStep(needVideo ? STEP.FACE_VIDEO : STEP.KYC_REVIEW);
      } else if (currentStep === STEP.FACE_VIDEO) setCurrentStep(STEP.KYC_REVIEW);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[Register KYC upload]', err?.code || err?.status, err?.message);
      }
      const parsed = parseKycFacingError(err, '');
      if (ONBOARDING_REGISTER && isOnboardingSessionLostError(err)) {
        setAccountCreated(false);
        setOnboardingSessionLost(true);
        setKycStepError('');
        return;
      }
      const msg = ONBOARDING_REGISTER
        ? sanitizeUserFacingError(parsed.message) || KYC_UPLOAD_ERROR_DEFAULT
        : pipelineErrorMessage(err, parsed.message || 'Não foi possível enviar. Toque em Tentar novamente.');
      setKycStepError(msg);
      if (parsed.code === 'FEATURE_KYC_DISABLED' || parsed.httpStatus === 503) {
        setFeatureDisabledHint(
          ONBOARDING_REGISTER
            ? 'O envio de documentos está temporariamente indisponível. Tente novamente em instantes.'
            : 'O envio de documentos está temporariamente indisponível. Use “Continuar mais tarde” e finalize quando quiser na área Verificação de identidade.'
        );
      }
    } finally {
      setUploadBusy(false);
      setUploadPhaseCopy(null);
    }
  };

  const handleSubmitReviewRegister = async () => {
    if (ONBOARDING_REGISTER && !hasActiveOnboardingProposal()) {
      setAccountCreated(false);
      setOnboardingSessionLost(true);
      return;
    }
    setReviewError('');
    setSubmitBusy(true);
    setSubmitOverlayCopy({
      title: 'Enviando verificação de segurança…',
      detail: 'Confirmamos que é você — documentos e selfie registrados com segurança.',
    });
    try {
      if (ONBOARDING_REGISTER && accountCreated) {
        await submitOnboardingKycForReview();
        await refreshKycStatus();
        await routeAfterKycSubmit();
      } else {
        await submitKycForReview();
        await refreshKycStatus();
        setCurrentStep(STEP.EMAIL_NOTICE);
      }
    } catch (err) {
      if (ONBOARDING_REGISTER && isOnboardingSessionLostError(err)) {
        setOnboardingSessionLost(true);
        setReviewError('');
        return;
      }
      const parsed = parseKycFacingError(err, 'Não foi possível registrar o envio das fotos neste momento.');
      setReviewError(pipelineErrorMessage(err, parsed.message));
      if (parsed.code === 'FEATURE_KYC_DISABLED' || parsed.httpStatus === 503) {
        setFeatureDisabledHint(
          'O envio de documentos está temporariamente indisponível. Use “Continuar mais tarde” e finalize quando quiser na área Verificação de identidade.'
        );
      }
    } finally {
      setSubmitBusy(false);
      setSubmitOverlayCopy(null);
    }
  };

  const handleFinalizeRegister = async () => {
    if (applicationStatus !== 'DOCUMENTS_APPROVED') {
      applyErrorMessage('Aguarde a conclusão da verificação de segurança antes de criar a conta.');
      return;
    }
    const termsOk = await trigger(['aceitaTermosFinais', 'aceitaPoliticaPrivacidade']);
    if (!termsOk) return;

    setFinalizeBusy(true);
    setError('');
    try {
      const res = await finalizeOnboarding({
        acceptedTerms: true,
        acceptedPrivacyPolicy: true
      });
      setFinalizeMessage(res.message || 'Conta criada com sucesso. Enviamos um e-mail para confirmar seu cadastro.');
      setCurrentStep(STEP.FINALIZE_SUCCESS);
    } catch (err) {
      const msg =
        typeof err?.message === 'string' && err.message.trim()
          ? sanitizeUserFacingError(err.message)
          : 'Não foi possível concluir a abertura. Tente novamente.';
      applyErrorMessage(msg);
    } finally {
      setFinalizeBusy(false);
    }
  };

  const handleFaceVideoFile = async (file, mime) => {
    if (ONBOARDING_LINEAR) {
      revokePreviewForType('FACE_VIDEO');
      const previewUrl = registerObjectUrl(URL.createObjectURL(file));
      setLocalPreviewUrlByType((prev) => ({ ...prev, FACE_VIDEO: previewUrl }));
      linearLocalFilesRef.current.faceVideo = file;
      setKycStepError('');
      setCurrentStep(STEP.FINAL_TERMS);
      return;
    }

    if (ONBOARDING_REGISTER && !hasActiveOnboardingProposal()) {
      setAccountCreated(false);
      setOnboardingSessionLost(true);
      return;
    }
    revokePreviewForType('FACE_VIDEO');
    const previewUrl = registerObjectUrl(URL.createObjectURL(file));
    setLocalPreviewUrlByType((prev) => ({ ...prev, FACE_VIDEO: previewUrl }));
    setUploadBusy(true);
    try {
      await uploadArtifactOnboarding(file, 'FACE_VIDEO', mime);
      await refreshKycStatus();
      setCurrentStep(STEP.KYC_REVIEW);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[Register FACE_VIDEO upload]', err?.code || err?.status, err?.message);
      }
      if (ONBOARDING_REGISTER && isOnboardingSessionLostError(err)) {
        setAccountCreated(false);
        setOnboardingSessionLost(true);
        setKycStepError('');
        setUploadPhaseCopy(null);
        return;
      }
      setKycStepError(
        typeof err?.message === 'string'
          ? sanitizeUserFacingError(err.message) || 'Não foi possível enviar o vídeo.'
          : 'Não foi possível enviar o vídeo.'
      );
      revokePreviewForType('FACE_VIDEO');
    } finally {
      setUploadBusy(false);
    }
  };

  const openPicker = () => fileInputRef.current?.click();

  const pgNum = journeyNumerator(currentStep);
  const showProgress = pgNum >= 1 && currentStep !== STEP.ALL_DONE && currentStep !== STEP.WELCOME;

  const progressIndex = pgNum;

  const isOnboardingFlatShell = ONBOARDING_FLAT;

  const isOnboardingKycUi =
    ONBOARDING_REGISTER &&
    isOnboardingFlatShell &&
    accountCreated &&
    currentStep >= STEP.DOC_FRONT &&
    currentStep <= STEP.KYC_REVIEW;

  const primaryFooterBtnClass = `h-13 w-full rounded-xl py-4 text-[1rem] font-semibold${
    isOnboardingFlatShell ? '' : ' shadow-lg shadow-agilbank-primary/20'
  }`;

  const headerExitLabel = ONBOARDING_FLAT ? 'Tenho conta' : accountCreated ? 'Ir ao app' : 'Tenho conta';
  const headerExitTo = ONBOARDING_FLAT ? '/login' : accountCreated ? '/transactions' : '/login';

  const scrollPaddingBottom =
    currentStep === STEP.WELCOME
      ? 'calc(9.75rem + env(safe-area-inset-bottom, 0px))'
      : currentStep === STEP.TERMS && (error || needsSilentLoginRetry)
        ? 'calc(16rem + env(safe-area-inset-bottom, 0px))'
        : currentStep === STEP.TERMS
          ? 'calc(11.5rem + env(safe-area-inset-bottom, 0px))'
          : currentStep === STEP.KYC_REVIEW
            ? reviewError
              ? 'calc(15rem + env(safe-area-inset-bottom, 0px))'
              : 'calc(12.5rem + env(safe-area-inset-bottom, 0px))'
            : isOnboardingKycUi
              ? kycStepError || reviewError
                ? 'calc(18.5rem + env(safe-area-inset-bottom, 0px))'
                : 'calc(15rem + env(safe-area-inset-bottom, 0px))'
              : currentStep >= STEP.DOC_FRONT && currentStep <= STEP.SELFIE
                ? kycStepError
                  ? 'calc(14rem + env(safe-area-inset-bottom, 0px))'
                  : 'calc(12rem + env(safe-area-inset-bottom, 0px))'
              : isOnboardingFlatShell
                ? 'calc(12.5rem + env(safe-area-inset-bottom, 0px))'
              : currentStep === STEP.EMAIL_NOTICE || currentStep === STEP.ALL_DONE
                ? 'calc(12rem + env(safe-area-inset-bottom, 0px))'
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
        <img
          src={BRAND_MEDIA.logoLightBg}
          alt="AgilBank"
          className="h-14 w-auto max-w-[min(280px,85vw)] object-contain drop-shadow-sm"
          width={280}
          height={56}
          decoding="async"
        />
      </div>
      <h1 className="mb-4 text-[1.65rem] font-bold leading-[1.2] tracking-tight text-gray-900 sm:text-[1.85rem] text-balance">
        Seu AgilBank começa agora.
      </h1>
      <p className="mb-12 text-[0.975rem] leading-relaxed text-gray-600 text-balance">
        Em poucas telas você informa seus dados e cria a conta. Fotos do documento e uma selfie ficam só para segurança — sem
        burocracia desnecessária.
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
      <div className="mb-6">
        <h1 className="text-[1.45rem] font-bold leading-tight text-gray-950 sm:text-2xl">
          {ONBOARDING_FLAT ? 'Revise seus dados' : 'Revise e aceite os termos'}
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-gray-600">
          {ONBOARDING_LINEAR
            ? 'Confirme suas informações e autorize a verificação. Os documentos serão enviados somente no final, em uma única proposta.'
            : ONBOARDING_REGISTER
              ? 'Confirme as informações abaixo e autorize a verificação para avançar com documento, selfie e vídeo facial.'
              : 'Assim criamos sua conta agora. Documento e selfie vêm nos próximos passos, na mesma tela.'}
        </p>
      </div>

      <section className="mb-6 border-y border-gray-100 py-2" aria-label="Resumo dos dados">
        <div className="flex items-center justify-between py-2">
          <h2 className="text-[0.78rem] font-semibold uppercase tracking-wide text-gray-500">Dados informados</h2>
          <span className="text-[0.78rem] font-semibold text-agilbank-primary">Conferir</span>
        </div>
        <dl className="divide-y divide-gray-100 text-[0.92rem] leading-snug">
          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="shrink-0 text-gray-500">Nome</dt>
            <dd className="min-w-0 max-w-[68%] break-words text-right font-semibold text-gray-950">
              {watchedValues.nomeCompleto || '—'}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="shrink-0 text-gray-500">E-mail</dt>
            <dd className="min-w-0 max-w-[68%] break-all text-right font-semibold text-gray-950">
              {watchedValues.email || '—'}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="shrink-0 text-gray-500">CPF</dt>
            <dd className="font-semibold text-gray-950">{watchedValues.cpf || '—'}</dd>
          </div>
        </dl>
      </section>

      <div className="space-y-2.5">
        {ONBOARDING_FLAT ? (
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3.5 transition-colors ${
              errors.aceitaConsentimentoBiometrico
                ? 'border-red-200 bg-red-50/60'
                : 'border-agilbank-primary/25 bg-white active:bg-blue-50/40'
            }`}
          >
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300 text-agilbank-primary focus:ring-agilbank-primary"
              {...register('aceitaConsentimentoBiometrico', {
                required: 'Para continuar, autorize a verificação de segurança.'
              })}
            />
            <span className="min-w-0">
              <span className="block text-[0.94rem] font-semibold leading-snug text-gray-950">
                Autorizar verificação de segurança
              </span>
              <span className="mt-1 block text-[0.84rem] leading-relaxed text-gray-600">
                Permito o uso de dados, documento, selfie e vídeo facial para validar minha proposta.
              </span>
              {errors.aceitaConsentimentoBiometrico?.message ? (
                <span className="mt-2 flex gap-2 text-[0.82rem] font-medium leading-snug text-red-700" role="alert">
                  <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden />
                  {errors.aceitaConsentimentoBiometrico.message}
                </span>
              ) : null}
            </span>
          </label>
        ) : (
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
        )}
        {errors.aceitaTermos?.message ? (
          <p className="text-sm text-red-600">{errors.aceitaTermos.message}</p>
        ) : null}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3.5 transition-colors ${
            isOnboardingFlatShell ? 'border-gray-200 bg-gray-50/70 active:bg-gray-100' : 'border-gray-100 bg-gray-50'
          }`}
        >
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300 text-agilbank-primary focus:ring-agilbank-primary"
            {...register('aceitaComunicacoes')}
          />
          <span className="min-w-0">
            <span className="block text-[0.9rem] font-semibold leading-snug text-gray-800">
              Receber novidades
            </span>
            <span className="mt-1 block text-[0.82rem] leading-relaxed text-gray-500">
              Produtos, serviços e avisos comerciais do AgilBank.
            </span>
          </span>
        </label>
      </div>
    </>
  );

  const artifactLabelPt = {
    DOCUMENT_FRONT: 'Frente do documento',
    DOCUMENT_BACK: 'Verso do documento',
    SELFIE_PORTRAIT: 'Selfie',
    FACE_VIDEO: 'Vídeo facial',
  };

  const renderKycImagePreview = (previewUrl, emptyLabel) =>
    previewUrl ? (
      <div className="overflow-hidden rounded-xl bg-white">
        <img src={previewUrl} alt="Pré-visualização do arquivo" className="mx-auto max-h-60 w-full object-contain" />
      </div>
    ) : (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl bg-white px-6 py-12 text-center">
        <PhotoIcon className="mb-3 h-10 w-10 text-gray-300" aria-hidden />
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      </div>
    );

  const renderDocumentCaptureStep = () => {
    const at = artifactForUiStep(currentStep);
    const previewUrl = at ? localPreviewUrlByType[at] : null;
    const isFront = currentStep === STEP.DOC_FRONT;

    return (
      <>
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agilbank-primary/10 text-agilbank-primary">
            <DocumentTextIcon className="h-8 w-8" aria-hidden />
          </div>
        </div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-agilbank-primary">
          {isFront ? 'Frente' : 'Verso'}
        </p>
        <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Envie seu documento</h1>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">
          Precisamos de uma foto nítida da frente e do verso do documento na verificação de segurança — para confirmar que é você.
        </p>

        <div className="space-y-4">
          {renderKycImagePreview(previewUrl, 'Nenhuma imagem selecionada ainda')}
          {!isOnboardingKycUi && kycStepError ? (
            <div className="flex gap-3 rounded-xl border border-red-200/90 bg-red-50 p-4 text-[0.875rem]" role="alert">
              <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
              <p className="break-words text-red-900">{kycStepError}</p>
            </div>
          ) : null}
          <p className="text-center text-[0.75rem] leading-snug text-gray-500">
            JPG, PNG ou WebP · até {Math.round(KYC_MAX_FILE_BYTES / (1024 * 1024))} MB
          </p>
        </div>
      </>
    );
  };

  const renderSelfieCaptureStep = () => {
    const previewUrl = localPreviewUrlByType.SELFIE_PORTRAIT;
    return (
      <>
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agilbank-primary/10 text-agilbank-primary">
            <PhotoIcon className="h-8 w-8" aria-hidden />
          </div>
        </div>
        <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Selfie de segurança</h1>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">
          Tire uma selfie em local iluminado. Usamos apenas para confirmar que é você — não é aprovação de crédito.
        </p>
        <div className="space-y-4">
          {renderKycImagePreview(previewUrl, 'Nenhuma selfie selecionada ainda')}
          {!isOnboardingKycUi && kycStepError ? (
            <div className="flex gap-3 rounded-xl border border-red-200/90 bg-red-50 p-4 text-[0.875rem]" role="alert">
              <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
              <p className="break-words text-red-900">{kycStepError}</p>
            </div>
          ) : null}
          <p className="text-center text-[0.75rem] leading-snug text-gray-500">
            JPG, PNG ou WebP · até {Math.round(KYC_MAX_FILE_BYTES / (1024 * 1024))} MB
          </p>
        </div>
      </>
    );
  };

  const renderRegisterKycReviewStep = () => {
    const submitted = kycStatus?.submittedArtifacts || [];
    const req = kycStatus?.requiredArtifacts || ['DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_PORTRAIT'];
    return (
      <>
        <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Revise sua verificação</h1>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">
          Confira se os arquivos estão legíveis. Ao enviar, iniciamos a verificação de segurança da sua proposta.
        </p>
        <ul className={`mb-8 space-y-3 ${isOnboardingKycUi ? 'divide-y divide-gray-100' : ''}`}>
          {req.map((key) => {
            const ok = submitted.includes(key);
            return (
              <li
                key={key}
                className={`flex items-center gap-3 py-3 ${
                  isOnboardingKycUi
                    ? ''
                    : `rounded-xl border px-4 ${ok ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-200 bg-white'}`
                }`}
              >
                {ok ? (
                  <CheckCircleIcon className="h-7 w-7 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <ExclamationTriangleIcon className="h-7 w-7 shrink-0 text-amber-500" aria-hidden />
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{artifactLabelPt[key]}</p>
                  <p className="text-xs text-gray-600">{ok ? 'Recebido' : 'Pendente'}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {reviewError && !isOnboardingKycUi ? (
          <div className="mb-6 flex gap-3 rounded-xl border border-red-200/90 bg-red-50 p-4 text-[0.875rem]" role="alert">
            <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
            <p className="break-words text-red-900">{reviewError}</p>
          </div>
        ) : null}
      </>
    );
  };

  const renderEmailNoticeStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Confirme seu e-mail</h1>
      <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">
        Enviamos um link para validar seu e-mail (comunicações oficiais). Confira também a pasta de spam ou promoções.
      </p>
      <div className={`text-sm text-gray-800 ${isOnboardingFlatShell ? 'border-t border-gray-100 pt-4' : 'rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-3'}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Enviado para</p>
        <p className="break-all font-medium text-gray-900">{watchedValues.email || '—'}</p>
      </div>
    </>
  );

  const renderPendingReviewStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">
        {ONBOARDING_LINEAR ? 'Proposta recebida' : 'Verificação recebida'}
      </h1>
      <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">
        {ONBOARDING_LINEAR
          ? linearSubmitMessage ||
            'Recebemos sua proposta de abertura. Você receberá uma atualização por e-mail.'
          : 'Recebemos sua verificação de segurança. Você poderá acompanhar o status. Quando liberado, volte aqui ou faça login para concluir os termos finais e criar sua conta.'}
      </p>
      {ONBOARDING_LINEAR && linearProtocolNumber ? (
        <p className={`text-sm text-gray-800 ${isOnboardingFlatShell ? 'border-t border-gray-100 pt-4' : 'rounded-xl border border-gray-200 bg-gray-50 p-4'}`}>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Protocolo</span>
          <span className="mt-1 block font-mono font-semibold text-gray-900">{linearProtocolNumber}</span>
        </p>
      ) : null}
      {!ONBOARDING_LINEAR && kycStatus?.message ? (
        <p className={`text-sm text-gray-700 ${isOnboardingFlatShell ? 'border-t border-gray-100 pt-4' : 'rounded-xl border border-gray-200 bg-gray-50 p-4'}`}>
          {kycStatus.message}
        </p>
      ) : null}
    </>
  );

  const renderFinalTermsStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Termos finais</h1>
      <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">
        {ONBOARDING_LINEAR
          ? 'Revise e aceite os termos para enviar sua proposta completa de abertura de conta.'
          : 'Sua verificação de segurança foi concluída. Aceite os termos para criar sua conta AgilBank.'}
      </p>
      <div className="space-y-0 divide-y divide-gray-100">
        <label className={`flex cursor-pointer items-start gap-3 py-4 ${isOnboardingFlatShell ? '' : 'rounded-xl border border-gray-200 bg-white p-4'}`}>
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-agilbank-primary"
            {...register('aceitaTermosFinais', { required: 'Aceite os termos de uso' })}
          />
          <span className="text-[0.9rem] text-gray-700">
            Li e aceito os{' '}
            <Link to="/terms" className="font-medium text-agilbank-primary hover:underline">
              termos de uso
            </Link>
            .
          </span>
        </label>
        <label className={`flex cursor-pointer items-start gap-3 py-4 ${isOnboardingFlatShell ? '' : 'rounded-xl border border-gray-200 bg-white p-4'}`}>
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-agilbank-primary"
            {...register('aceitaPoliticaPrivacidade', { required: 'Aceite a política de privacidade' })}
          />
          <span className="text-[0.9rem] text-gray-700">
            Li e aceito a política de privacidade do AgilBank.
          </span>
        </label>
      </div>
    </>
  );

  const renderFinalizeSuccessStep = () => (
    <div className="flex flex-col items-center pb-4 text-center">
      <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
        <CheckIcon className="h-11 w-11 text-agilbank-success" aria-hidden />
      </div>
      <h1 className="mb-4 text-[1.6rem] font-bold leading-tight text-gray-900 sm:text-2xl">Conta criada com sucesso</h1>
      <p className="mb-0 max-w-sm text-[0.95rem] leading-relaxed text-gray-600">
        {finalizeMessage || 'Enviamos um e-mail para confirmar seu cadastro. Faça login para acessar o AgilBank.'}
      </p>
    </div>
  );

  const renderResubmissionStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Reenvio necessário</h1>
      <p className="mb-4 text-[0.95rem] leading-relaxed text-gray-600">
        {ONBOARDING_LINEAR
          ? linearSubmitMessage ||
            'Precisamos que você envie novamente alguns arquivos. Reinicie o cadastro e envie uma nova proposta.'
          : kycStatus?.resubmissionMessage ||
            kycStatus?.message ||
            'Precisamos que você envie novamente alguns arquivos da verificação de segurança. Em breve você poderá reenviar por aqui.'}
      </p>
    </>
  );

  const renderRejectedStep = () => (
    <>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Não foi possível concluir</h1>
      <p className="mb-4 text-[0.95rem] leading-relaxed text-gray-600">
        {kycStatus?.message ||
          'Não foi possível validar sua identidade com os dados enviados. Você pode iniciar uma nova proposta de abertura.'}
      </p>
      <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
        Reiniciar cadastro
      </Button>
    </>
  );

  const renderAllDoneStep = () => renderFinalizeSuccessStep();

  const renderOnboardingSessionLostStep = () => (
    <>
      <div className="mb-6 flex justify-center">
        <ExclamationTriangleIcon className="h-12 w-12 text-amber-500" aria-hidden />
      </div>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Sessão encerrada</h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-gray-600">{ONBOARDING_SESSION_LOST_MESSAGE}</p>
      <Button type="button" variant="primary" size="lg" className={primaryFooterBtnClass} onClick={handleRestartOnboarding}>
        Reiniciar cadastro
      </Button>
    </>
  );

  const renderStepBody = () => {
    if (ONBOARDING_REGISTER && onboardingSessionLost) {
      return renderOnboardingSessionLostStep();
    }
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
      case STEP.DOC_FRONT:
      case STEP.DOC_BACK:
        return renderDocumentCaptureStep();
      case STEP.SELFIE:
        return renderSelfieCaptureStep();
      case STEP.FACE_VIDEO:
        return (
          <FaceVideoCapture
            onUploadFile={async (file) => handleFaceVideoFile(file, file.type || 'video/webm')}
            uploadBusy={uploadBusy}
            errorMessage={kycStepError}
            onClearError={() => setKycStepError('')}
          />
        );
      case STEP.KYC_REVIEW:
        return renderRegisterKycReviewStep();
      case STEP.PENDING_REVIEW:
        return renderPendingReviewStep();
      case STEP.FINAL_TERMS:
        return renderFinalTermsStep();
      case STEP.FINALIZE_SUCCESS:
        return renderFinalizeSuccessStep();
      case STEP.RESUBMISSION:
        return renderResubmissionStep();
      case STEP.REJECTED:
        return renderRejectedStep();
      case STEP.EMAIL_NOTICE:
        return renderEmailNoticeStep();
      case STEP.ALL_DONE:
        return renderAllDoneStep();
      default:
        return null;
    }
  };

  const renderCompactFooterPrimary = () => {
    if (ONBOARDING_REGISTER && onboardingSessionLost) {
      return null;
    }
    if (currentStep <= STEP.WELCOME) return null;
    if (currentStep < STEP.TERMS) {
      return (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className={primaryFooterBtnClass}
          onClick={nextStep}
          disabled={loading}
        >
          Continuar
        </Button>
      );
    }
    if (currentStep === STEP.TERMS) {
      const loginQs = watchedValues.email
        ? `?email=${encodeURIComponent(String(watchedValues.email).trim())}`
        : '';
      if (!ONBOARDING_REGISTER && needsSilentLoginRetry) {
        return (
          <>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className={primaryFooterBtnClass}
              loading={loading}
              disabled={loading}
              onClick={retrySilentLoginOnly}
            >
              Tentar abrir sessão novamente
            </Button>
            <Link
              to={`/login${loginQs}`}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-[0.95rem] font-semibold text-gray-900"
              aria-label="Ir para entrar manualmente"
            >
              Entrar manualmente
            </Link>
          </>
        );
      }
      return (
        <Button
          type="submit"
          form="register-flow-form"
          variant="primary"
          size="lg"
          className={primaryFooterBtnClass}
          loading={loading}
          disabled={loading || (!ONBOARDING_REGISTER && needsSilentLoginRetry)}
        >
          {ONBOARDING_LINEAR
            ? 'Continuar para documentos'
            : ONBOARDING_REGISTER
              ? 'Continuar para verificação'
              : 'Criar conta'}
        </Button>
      );
    }
    if (currentStep === STEP.FINAL_TERMS) {
      if (ONBOARDING_LINEAR) {
        return (
          <Button
            type="button"
            variant="primary"
            size="lg"
            className={primaryFooterBtnClass}
            loading={finalizeBusy}
            disabled={finalizeBusy}
            onClick={handleLinearSubmitProposal}
          >
            {finalizeBusy ? 'Enviando…' : 'Enviar proposta'}
          </Button>
        );
      }
      return (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className={primaryFooterBtnClass}
          loading={finalizeBusy}
          disabled={finalizeBusy || applicationStatus !== 'DOCUMENTS_APPROVED'}
          onClick={handleFinalizeRegister}
        >
          Criar minha conta
        </Button>
      );
    }
    if (currentStep === STEP.PENDING_REVIEW || currentStep === STEP.RESUBMISSION || currentStep === STEP.REJECTED) {
      return (
        <Link
          to="/login"
          className={`flex h-13 w-full items-center justify-center rounded-xl bg-agilbank-primary px-4 text-[1rem] font-semibold text-white${isOnboardingFlatShell ? '' : ' shadow-lg'}`}
        >
          Ir para login
        </Link>
      );
    }
    if (currentStep >= STEP.DOC_FRONT && currentStep <= STEP.SELFIE) {
      const hasPreview = localPreviewUrlByType[artifactForUiStep(currentStep)];
      return (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className={primaryFooterBtnClass}
          onClick={
            ONBOARDING_LINEAR && hasPreview
              ? advanceLinearCaptureStep
              : openPicker
          }
          disabled={uploadBusy || !!featureDisabledHint}
          loading={uploadBusy}
        >
          {uploadBusy
            ? 'Enviando…'
            : ONBOARDING_LINEAR
              ? hasPreview
                ? 'Continuar'
                : 'Selecionar foto'
              : hasPreview
                ? 'Trocar foto e enviar'
                : 'Selecionar foto e enviar'}
        </Button>
      );
    }
    if (currentStep === STEP.KYC_REVIEW) {
      return (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className={primaryFooterBtnClass}
          disabled={!kycStatus?.canSubmitForReview || submitBusy || !!featureDisabledHint}
          loading={submitBusy}
          onClick={handleSubmitReviewRegister}
        >
          {submitBusy ? 'Enviando…' : 'Enviar fotos'}
        </Button>
      );
    }
    if (currentStep === STEP.EMAIL_NOTICE) {
      return (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className={primaryFooterBtnClass}
          onClick={() => setCurrentStep(STEP.ALL_DONE)}
        >
          Continuar
        </Button>
      );
    }
    if (currentStep === STEP.FINALIZE_SUCCESS || currentStep === STEP.ALL_DONE) {
      const loginQs = watchedValues.email
        ? `?email=${encodeURIComponent(String(watchedValues.email).trim())}`
        : '';
      return (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className={primaryFooterBtnClass}
          onClick={() => navigate(`/login${loginQs}`)}
        >
          Fazer login
        </Button>
      );
    }
    return null;
  };

  /* --- Layout shell (mobile-first, max 430px no desktop) --- */
  const shellOuter = (
    <div
      className={`${isOnboardingFlatShell ? 'register-shell--onboarding ' : ''}flex min-h-[100dvh] w-full ${
        isOnboardingFlatShell
          ? 'bg-white'
          : `justify-center px-3 py-0 sm:py-10 ${currentStep === STEP.WELCOME ? 'bg-agilbank-primary/[0.04]' : 'bg-zinc-200/75'}`
      }`}
    >
      <div
        className={`relative flex w-full flex-col min-h-[100dvh] overflow-hidden bg-white ${
          isOnboardingFlatShell
            ? 'mx-auto max-w-[430px]'
            : 'max-w-[430px] sm:min-h-0 shadow-2xl sm:rounded-[2rem] sm:border border-white/40'
        } ${!isOnboardingFlatShell && currentStep === STEP.WELCOME ? 'register-hero-bg' : ''}`}
      >
        {/* Header + progress */}
        {currentStep !== STEP.WELCOME ? (
          <header
            className={`sticky top-0 z-20 bg-white px-4 pb-4 pt-[calc(env(safe-area-inset-top,0)+0.875rem)] ${
              isOnboardingFlatShell ? '' : 'border-b border-gray-100/90 backdrop-blur bg-white/95'
            }`}
          >
            <div className="relative mb-5 flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label="Voltar"
                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-700 hover:bg-gray-100 active:bg-gray-200"
                onClick={prevStep}
              >
                <ArrowLeftIcon className="h-6 w-6" />
              </button>
              <img
                src={BRAND_MEDIA.icon}
                alt="AgilBank"
                className="h-9 w-9 object-contain"
                width={36}
                height={36}
                decoding="async"
              />
              <Link
                to={headerExitTo}
                className="absolute right-0 text-xs font-medium text-agilbank-primary hover:underline sm:text-[0.8rem]"
                aria-label={`${headerExitLabel}: ir para o login`}
              >
                {headerExitLabel}
              </Link>
            </div>
            {showProgress ? (
              <div className="space-y-2">
                <div
                  role="progressbar"
                  aria-valuenow={progressIndex}
                  aria-valuemin={1}
                  aria-valuemax={JOURNEY_TOTAL}
                  aria-valuetext={`Etapa ${progressIndex} de ${JOURNEY_TOTAL}`}
                  className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
                >
                  <div
                    className="h-full rounded-full bg-agilbank-primary transition-all duration-500 ease-out"
                    style={{ width: `${(progressIndex / JOURNEY_TOTAL) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  <span>Etapa</span>
                  <span aria-live="polite">
                    {progressIndex} / {JOURNEY_TOTAL}
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
          className={`register-scroll-area flex-1 overflow-y-auto overscroll-y-contain scrollbar-hide ${
            isOnboardingFlatShell && currentStep !== STEP.WELCOME ? 'register-scroll-area--onboarding-flat' : ''
          } ${isOnboardingKycUi ? 'register-scroll-area--onboarding-kyc' : ''} ${currentStep === STEP.WELCOME ? '' : 'px-5 pt-5'}`}
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
              if (currentStep !== STEP.TERMS) {
                e.preventDefault();
              }
            }}
          >
            {/* Enter só envia na etapa final (termos) */}
            <fieldset className={currentStep === STEP.WELCOME ? 'min-h-0 sm:min-h-[50vh]' : 'min-h-[50vh]'} disabled={loading}>
              {renderStepBody()}
            </fieldset>
            <input
              ref={fileInputRef}
              type="file"
              accept={
                currentStep === STEP.FACE_VIDEO
                  ? KYC_ALLOWED_VIDEO_MIME_TYPES.join(',')
                  : KYC_ALLOWED_MIME_TYPES.join(',')
              }
              className="hidden"
              aria-hidden
              tabIndex={-1}
              {...(currentStep >= STEP.DOC_FRONT && currentStep <= STEP.SELFIE
                ? { capture: currentStep === STEP.SELFIE ? 'user' : 'environment' }
                : {})}
              onChange={handlePickFile}
            />
          </form>
        </div>

        {/* Barra inferior fixa */}
        <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center">
          <div
            className={
              isOnboardingFlatShell
                ? 'pointer-events-auto flex w-full max-w-[430px] flex-col gap-2.5 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3'
                : 'pointer-events-auto flex w-full max-w-[430px] flex-col gap-3 rounded-t-[1.25rem] border-t border-gray-100 bg-white/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_40px_rgba(0,36,71,0.08)] backdrop-blur-md'
            }
          >
            {currentStep === STEP.WELCOME ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className={`w-full rounded-xl py-4 text-[1rem] font-semibold${isOnboardingFlatShell ? '' : ' shadow-lg shadow-agilbank-primary/25'}`}
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
                  isOnboardingFlatShell ? (
                    <div className="flex gap-2 text-[0.875rem] text-red-700" role="alert" aria-live="assertive">
                      <ExclamationTriangleIcon className="h-5 w-5 shrink-0" aria-hidden />
                      <p className="min-w-0 break-words">{sanitizeUserFacingError(error)}</p>
                    </div>
                  ) : (
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
                  )
                ) : null}
                {featureDisabledHint && isOnboardingKycUi ? (
                  <p className="text-[0.85rem] leading-snug text-amber-800" role="status">
                    {featureDisabledHint}
                  </p>
                ) : featureDisabledHint && accountCreated && currentStep >= STEP.DOC_FRONT && currentStep <= STEP.KYC_REVIEW ? (
                  <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[0.85rem]" role="status">
                    <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-amber-600" aria-hidden />
                    <p className="min-w-0 text-amber-950">{featureDisabledHint}</p>
                  </div>
                ) : null}
                {isOnboardingKycUi &&
                ((currentStep >= STEP.DOC_FRONT && currentStep <= STEP.FACE_VIDEO && kycStepError) ||
                  (currentStep === STEP.KYC_REVIEW && reviewError)) ? (
                  <div className="flex gap-2 text-[0.875rem] text-red-700" role="alert" aria-live="assertive">
                    <ExclamationTriangleIcon className="h-5 w-5 shrink-0" aria-hidden />
                    <p className="min-w-0 break-words">
                      {currentStep === STEP.KYC_REVIEW ? reviewError : kycStepError}
                    </p>
                  </div>
                ) : null}
                {currentStep === STEP.KYC_REVIEW && !kycStatus?.canSubmitForReview ? (
                  <p className="text-center text-[0.78rem] text-gray-500">Envie os arquivos indicados antes de seguir.</p>
                ) : null}
                {renderCompactFooterPrimary()}
                {isOnboardingKycUi && !uploadBusy && !submitBusy ? (
                  <>
                    {!featureDisabledHint &&
                    ((currentStep >= STEP.DOC_FRONT && currentStep <= STEP.FACE_VIDEO && kycStepError) ||
                      (currentStep === STEP.KYC_REVIEW && reviewError)) ? (
                      <button
                        type="button"
                        className="w-full py-1 text-center text-[0.9rem] font-semibold text-agilbank-primary hover:underline"
                        disabled={uploadBusy || submitBusy || !!featureDisabledHint}
                        onClick={currentStep === STEP.KYC_REVIEW ? handleSubmitReviewRegister : openPicker}
                      >
                        Tentar novamente
                      </button>
                    ) : null}
                    {!ONBOARDING_LINEAR ? (
                      <>
                        <Link
                          to="/login"
                          className="block w-full py-1 text-center text-[0.85rem] font-medium text-gray-600 hover:text-agilbank-primary"
                          aria-label="Voltar depois: ir para login sem entrar no app"
                        >
                          Voltar depois
                        </Link>
                        <p className="text-center text-[0.72rem] leading-snug text-gray-500">
                          Você pode continuar a verificação neste aparelho enquanto sua sessão estiver ativa. Sua
                          proposta permanece salva neste dispositivo.
                        </p>
                      </>
                    ) : null}
                  </>
                ) : null}
                {!ONBOARDING_REGISTER &&
                accountCreated &&
                currentStep >= STEP.DOC_FRONT &&
                currentStep <= STEP.KYC_REVIEW &&
                !uploadBusy &&
                !submitBusy ? (
                  <>
                    {!featureDisabledHint &&
                    ((currentStep >= STEP.DOC_FRONT && currentStep <= STEP.SELFIE && kycStepError) ||
                      (currentStep === STEP.KYC_REVIEW && reviewError)) ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        className="h-12 w-full rounded-xl border-gray-300 py-3 text-[0.95rem] font-semibold"
                        disabled={uploadBusy || submitBusy || !!featureDisabledHint}
                        onClick={currentStep === STEP.KYC_REVIEW ? handleSubmitReviewRegister : openPicker}
                      >
                        Tentar novamente
                      </Button>
                    ) : null}
                    <Link
                      to="/verificacao-identidade"
                      className="block w-full rounded-xl px-4 py-2.5 text-center text-[0.9rem] font-medium text-agilbank-primary underline-offset-2 hover:underline"
                      aria-label="Continuar fotos mais tarde em Verificação de identidade"
                    >
                      Continuar mais tarde
                    </Link>
                    <p className="text-center text-[0.72rem] leading-snug text-gray-400">
                      Sua conta continua válida e você volta para as fotos no mesmo fluxo dentro do app, quando preferir.
                    </p>
                  </>
                ) : null}
              </>
            )}
          </div>
        </footer>

        {/* Loading fullscreen */}
        {loading || (ONBOARDING_LINEAR && finalizeBusy) ? (
          <div
            className="register-loading-bg fixed inset-0 z-[200] flex flex-col items-center justify-center px-10 text-white"
            role="status"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="mx-auto mb-10 h-12 w-12 animate-spin rounded-full border-[3px] border-white/35 border-t-white" aria-hidden />
            <p className="text-center text-lg font-semibold tracking-tight">{registrationLoadingCopy.title}</p>
            <p className="mt-4 text-center text-sm text-blue-100/90">{registrationLoadingCopy.detail}</p>
          </div>
        ) : null}

        {uploadBusy || submitBusy ? (
          <div
            className="register-loading-bg fixed inset-0 z-[200] flex flex-col items-center justify-center px-10 text-white"
            role="status"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="mx-auto mb-10 h-12 w-12 animate-spin rounded-full border-[3px] border-white/35 border-t-white" aria-hidden />
            <p className="text-center text-lg font-semibold tracking-tight">
              {submitBusy ? submitOverlayCopy?.title ?? 'Finalizando cadastro das fotos…' : uploadPhaseCopy?.title ?? 'Preparando envio…'}
            </p>
            <p className="mt-4 text-center text-sm text-blue-100/90">
              {submitBusy
                ? submitOverlayCopy?.detail ?? 'Um instante até registrarmos tudo.'
                : uploadPhaseCopy?.detail ?? 'Não feche o app até a barra sumir.'}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );

  return shellOuter;
};

export default Register;
