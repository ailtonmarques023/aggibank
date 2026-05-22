import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  FingerPrintIcon,
  PhotoIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import Button from '../../components/Button';
import '../Register/Register.css';
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
import { BRAND_MEDIA } from '../../constants/brandMedia';
import FaceVideoCapture from './FaceVideoCapture';

/** Etapas numéricas após boas-vindas (barra de progresso). */
const STEP = {
  WELCOME: 0,
  DOC_FRONT: 1,
  DOC_BACK: 2,
  SELFIE: 3,
  FACE_VIDEO: 4,
  REVIEW: 5,
};

const DEFAULT_REQUIRED_ARTIFACTS = ['DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_PORTRAIT'];

const ARTIFACT_LABELS = {
  DOCUMENT_FRONT: 'Frente do documento',
  DOCUMENT_BACK: 'Verso do documento',
  SELFIE_PORTRAIT: 'Selfie',
  FACE_VIDEO: 'Vídeo facial',
};

function artifactTypeToStep(artifactType) {
  switch (artifactType) {
    case 'DOCUMENT_FRONT':
      return STEP.DOC_FRONT;
    case 'DOCUMENT_BACK':
      return STEP.DOC_BACK;
    case 'SELFIE_PORTRAIT':
      return STEP.SELFIE;
    case 'FACE_VIDEO':
      return STEP.FACE_VIDEO;
    default:
      return STEP.WELCOME;
  }
}

function stepToArtifactType(step) {
  switch (step) {
    case STEP.DOC_FRONT:
      return 'DOCUMENT_FRONT';
    case STEP.DOC_BACK:
      return 'DOCUMENT_BACK';
    case STEP.SELFIE:
      return 'SELFIE_PORTRAIT';
    case STEP.FACE_VIDEO:
      return 'FACE_VIDEO';
    default:
      return null;
  }
}

const FLOW_CONFIG = [
  null,
  {
    artifactType: 'DOCUMENT_FRONT',
    title: 'Envie seu documento',
    subtitle:
      'Precisamos de uma foto nítida da frente e do verso do seu documento para proteger sua conta — comece pela frente (RG ou CNH).',
    Icon: DocumentTextIcon,
  },
  {
    artifactType: 'DOCUMENT_BACK',
    title: 'Envie seu documento',
    subtitle:
      'Agora fotografe o verso do mesmo documento, bem legível, sem reflexos nem cortes nas informações.',
    Icon: DocumentTextIcon,
  },
  {
    artifactType: 'SELFIE_PORTRAIT',
    title: 'Validação facial',
    subtitle:
      'Agora tire uma selfie em um local iluminado. Essa etapa ajuda a confirmar que é você mesmo na solicitação.',
    Icon: PhotoIcon,
  },
];

function sanitizeFacingMessage(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const t = raw.trim();
  if (/unique constraint|prisma|postgresql|internal server error|stack/i.test(t)) {
    return 'Não foi possível concluir. Tente novamente em instantes.';
  }
  return t;
}

function parseApiError(err, fallback) {
  const body = err?.response?.data;
  const msg =
    typeof body?.message === 'string' && body.message.trim()
      ? body.message.trim()
      : typeof err?.message === 'string'
        ? err.message.trim()
        : '';
  const code = typeof body?.code === 'string' ? body.code : '';
  const merged = sanitizeFacingMessage(msg || fallback || '');
  const out = new Error(merged || fallback || 'Erro ao processar solicitação.');
  out.code = code;
  out.httpStatus = err?.response?.status;
  return out;
}

function sanitizeReturnPath(next) {
  if (!next || typeof next !== 'string') return '/banco/index.html';
  const trimmed = next.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/banco/index.html';
  return trimmed;
}

function ReturnNav({ to, className, children }) {
  if (to.startsWith('/banco')) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

function mimeAllowed(file) {
  const m = (file.type || '').trim().toLowerCase();
  if (m && KYC_ALLOWED_MIME_TYPES.includes(m)) return { ok: true, mime: m };
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase();
  const guess =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : '';
  if (guess && KYC_ALLOWED_MIME_TYPES.includes(guess)) return { ok: true, mime: guess };
  return { ok: false, mime: '' };
}

export default function KycVerification() {
  const [searchParams] = useSearchParams();
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewRegistry = useRef([]);

  const returnTo = useMemo(
    () => sanitizeReturnPath(searchParams.get('next')),
    [searchParams]
  );
  const entryReason = searchParams.get('reason') || '';
  const autoStart = searchParams.get('start') === '1';

  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState('');
  const [kycStatus, setKycStatus] = useState(null);
  const [step, setStep] = useState(STEP.WELCOME);
  const [forceFlow, setForceFlow] = useState(false);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [stepError, setStepError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [featureDisabledHint, setFeatureDisabledHint] = useState('');

  /** pré-visualização local por tipo de artefato */
  const [localPreviewUrlByType, setLocalPreviewUrlByType] = useState({});

  const requiredArtifacts = useMemo(() => {
    const fromApi = kycStatus?.requiredArtifacts;
    if (Array.isArray(fromApi) && fromApi.length > 0) return fromApi;
    return DEFAULT_REQUIRED_ARTIFACTS;
  }, [kycStatus]);

  const hasFaceVideo = useMemo(
    () => requiredArtifacts.includes('FACE_VIDEO'),
    [requiredArtifacts]
  );

  const progressTotal = useMemo(() => requiredArtifacts.length, [requiredArtifacts]);

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchKycStatus();
      setKycStatus(data);
      setFeatureDisabledHint('');
      return data;
    } catch (err) {
      const e = parseApiError(err, 'Não foi possível carregar seu status.');
      if (e.httpStatus === 503 || e.code === 'FEATURE_KYC_DISABLED') {
        setFeatureDisabledHint(
          'O envio de documentos está temporariamente indisponível. Tente mais tarde ou fale com o suporte.'
        );
      }
      throw e;
    }
  }, []);

  const syncStepFromStatus = useCallback((data) => {
    if (!data) return;
    const { identityStatus, submittedArtifacts, canSubmitForReview } = data;
    const order =
      Array.isArray(data.requiredArtifacts) && data.requiredArtifacts.length > 0
        ? data.requiredArtifacts
        : DEFAULT_REQUIRED_ARTIFACTS;

    if (
      identityStatus === 'NOT_STARTED' ||
      !submittedArtifacts ||
      submittedArtifacts.length === 0
    ) {
      setStep(STEP.WELCOME);
      return;
    }

    if (identityStatus === 'DRAFT' || identityStatus === 'PENDING_UPLOADS') {
      const nextMissing = order.find((t) => !submittedArtifacts.includes(t));
      if (nextMissing) setStep(artifactTypeToStep(nextMissing));
      else if (canSubmitForReview) setStep(STEP.REVIEW);
      else setStep(STEP.WELCOME);
    }
  }, []);

  const applyEntryIntent = useCallback(
    (data) => {
      if (!autoStart || !data || data.identityStatus === 'APPROVED') {
        return;
      }
      setForceFlow(true);
      const st = data.identityStatus;
      const submitted = data.submittedArtifacts || [];
      if (st === 'NOT_STARTED' || submitted.length === 0) {
        setStep(STEP.DOC_FRONT);
        return;
      }
      if (st === 'DRAFT' || st === 'PENDING_UPLOADS') {
        syncStepFromStatus(data);
        return;
      }
      if (st === 'RESUBMISSION_REQUIRED' || st === 'REJECTED') {
        setStep(STEP.WELCOME);
      }
    },
    [autoStart, syncStepFromStatus]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      try {
        setBootError('');
        const data = await refreshStatus();
        if (cancelled || !data) return;
        syncStepFromStatus(data);
        applyEntryIntent(data);
      } catch (err) {
        if (!cancelled) setBootError(parseApiError(err, 'Não foi possível carregar o status.').message);
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshStatus, syncStepFromStatus, applyEntryIntent]);

  const terminalKind = useMemo(() => {
    if (!kycStatus || bootLoading) return null;
    const { identityStatus } = kycStatus;
    if (identityStatus === 'APPROVED') return 'approved';
    if (identityStatus === 'READY_FOR_REVIEW' || identityStatus === 'UNDER_MANUAL_REVIEW') {
      return 'waiting';
    }
    if (identityStatus === 'RESUBMISSION_REQUIRED') return 'resubmit';
    if (identityStatus === 'REJECTED') return 'rejected';
    return null;
  }, [kycStatus, bootLoading]);

  const showBlockingTerminal = terminalKind && terminalKind !== 'approved' && !forceFlow;

  const progressIndex = useMemo(() => {
    if (step === STEP.WELCOME) return 0;
    if (step === STEP.REVIEW) return progressTotal;
    const artifactType = stepToArtifactType(step);
    if (!artifactType) return 1;
    const idx = requiredArtifacts.indexOf(artifactType);
    return idx >= 0 ? idx + 1 : 1;
  }, [step, progressTotal, requiredArtifacts]);

  const scrollPaddingBottom =
    step === STEP.WELCOME
      ? 'calc(9.75rem + env(safe-area-inset-bottom, 0px))'
      : step === STEP.FACE_VIDEO
        ? 'calc(2rem + env(safe-area-inset-bottom, 0px))'
        : step === STEP.REVIEW && reviewError
          ? 'calc(14rem + env(safe-area-inset-bottom, 0px))'
          : step >= STEP.DOC_FRONT && step <= STEP.SELFIE
            ? 'calc(11rem + env(safe-area-inset-bottom, 0px))'
            : 'calc(10.5rem + env(safe-area-inset-bottom, 0px))';

  const advanceAfterArtifact = useCallback((artifactType, statusSnapshot) => {
    const order =
      Array.isArray(statusSnapshot?.requiredArtifacts) && statusSnapshot.requiredArtifacts.length > 0
        ? statusSnapshot.requiredArtifacts
        : DEFAULT_REQUIRED_ARTIFACTS;
    const idx = order.indexOf(artifactType);
    if (idx >= 0 && idx < order.length - 1) {
      setStep(artifactTypeToStep(order[idx + 1]));
    } else {
      setStep(STEP.REVIEW);
    }
  }, []);

  const uploadArtifactFile = useCallback(
    async (file, artifactType, mime) => {
      revokePreviewForType(artifactType);
      const previewUrl = registerObjectUrl(URL.createObjectURL(file));
      setLocalPreviewUrlByType((prev) => ({ ...prev, [artifactType]: previewUrl }));

      const checksum = await sha256HexFromFile(file);
      const presignPayload = await presignKycUpload({
        artifactType,
        mimeType: mime,
        byteSize: file.size,
      });

      await putFileToPresignedUrl(presignPayload.uploadUrl, file, presignPayload.headers);

      await confirmKycUpload({
        artifactId: presignPayload.artifactId,
        checksumSHA256: checksum,
      });

      const freshStatus = await refreshStatus();
      advanceAfterArtifact(artifactType, freshStatus);
    },
    [advanceAfterArtifact, refreshStatus, registerObjectUrl, revokePreviewForType]
  );

  const openPicker = () => fileInputRef.current?.click();

  const handlePickFile = async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    setStepError('');
    const { ok, mime } = mimeAllowed(file);
    if (!ok) {
      setStepError('Use JPG, PNG ou WebP.');
      return;
    }
    if (file.size <= 0 || file.size > KYC_MAX_FILE_BYTES) {
      setStepError(`O arquivo deve ter até ${Math.round(KYC_MAX_FILE_BYTES / (1024 * 1024))} MB.`);
      return;
    }

    const cfg = FLOW_CONFIG[step];
    if (!cfg) return;

    revokePreviewForType(cfg.artifactType);
    const previewUrl = registerObjectUrl(URL.createObjectURL(file));
    setLocalPreviewUrlByType((prev) => ({ ...prev, [cfg.artifactType]: previewUrl }));

    setUploadBusy(true);
    try {
      await uploadArtifactFile(file, cfg.artifactType, mime);
    } catch (err) {
      const e = parseApiError(err, 'Falha ao enviar o arquivo.');
      setStepError(e.message || 'Falha ao enviar o arquivo.');
      revokePreviewForType(cfg.artifactType);
      if (e.code === 'FEATURE_KYC_DISABLED' || e.httpStatus === 503) {
        setFeatureDisabledHint(
          'O envio de documentos está temporariamente indisponível. Tente mais tarde.'
        );
      }
    } finally {
      setUploadBusy(false);
    }
  };

  const handleUploadFaceVideo = async (file) => {
    setStepError('');
    const mime = (file.type || '').trim().toLowerCase();
    if (!mime || !KYC_ALLOWED_VIDEO_MIME_TYPES.includes(mime)) {
      const msg = 'Use um vídeo WebM ou MP4 gravado nesta tela.';
      setStepError(msg);
      throw new Error(msg);
    }
    if (file.size <= 0 || file.size > KYC_VIDEO_MAX_FILE_BYTES) {
      const msg = `O vídeo deve ter até ${Math.round(KYC_VIDEO_MAX_FILE_BYTES / (1024 * 1024))} MB.`;
      setStepError(msg);
      throw new Error(msg);
    }

    setUploadBusy(true);
    try {
      await uploadArtifactFile(file, 'FACE_VIDEO', mime);
    } catch (err) {
      const e = parseApiError(err, 'Falha ao enviar o vídeo.');
      setStepError(e.message || 'Falha ao enviar o vídeo.');
      revokePreviewForType('FACE_VIDEO');
      if (e.code === 'FEATURE_KYC_DISABLED' || e.httpStatus === 503) {
        setFeatureDisabledHint(
          'O envio de documentos está temporariamente indisponível. Tente mais tarde.'
        );
      }
      throw e;
    } finally {
      setUploadBusy(false);
    }
  };

  const handleSubmitReview = async () => {
    setReviewError('');
    setSubmitBusy(true);
    try {
      await submitKycForReview();
      await refreshStatus();
      setForceFlow(false);
    } catch (err) {
      const e = parseApiError(err, 'Não foi possível concluir o envio.');
      setReviewError(e.message);
    } finally {
      setSubmitBusy(false);
    }
  };

  const goBack = () => {
    setStepError('');
    setStep((s) => Math.max(STEP.WELCOME, s - 1));
  };

  const renderWelcome = () => (
    <div className="flex flex-1 flex-col px-6 pb-6 pt-[calc(2rem+env(safe-area-inset-top,0))] sm:pt-12">
      <div className="mb-10 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-agilbank-primary shadow-lg shadow-agilbank-primary/25">
          <FingerPrintIcon className="h-9 w-9 text-white" aria-hidden />
        </div>
      </div>
      <h1 className="mb-4 text-[1.65rem] font-bold leading-[1.2] tracking-tight text-gray-900 sm:text-[1.85rem] text-balance">
        Complete sua verificação de identidade
      </h1>
      <p className="mb-6 text-[0.975rem] leading-relaxed text-gray-600 text-balance">
        Para sua segurança e conformidade regulatória, precisamos conferir seus documentos. Use fotos claras e recentes.
      </p>
      {entryReason === 'card' ? (
        <p className="mb-4 text-[0.9rem] leading-relaxed text-gray-700">
          Você veio do pedido de <strong>cartão</strong>. Conclua documento (frente e verso) e selfie para liberar essa etapa.
        </p>
      ) : null}
      {entryReason === 'loan' ? (
        <p className="mb-4 text-[0.9rem] leading-relaxed text-gray-700">
          Você veio da solicitação de <strong>empréstimo</strong>. Conclua documento (frente e verso) e selfie para continuar.
        </p>
      ) : null}
      <div className="rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-[0.82rem] leading-snug text-amber-950">
        <strong className="font-semibold">Dica:</strong> você pode concluir as fotos quando achar melhor. Cartão e crédito podem depender dessa conferência estar concluída.
      </div>
    </div>
  );

  const renderUploadStep = () => {
    const cfg = FLOW_CONFIG[step];
    if (!cfg) return null;
    const Icon = cfg.Icon;
    const previewUrl = localPreviewUrlByType[cfg.artifactType];

    return (
      <>
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agilbank-primary/10 text-agilbank-primary">
            <Icon className="h-8 w-8" aria-hidden />
          </div>
        </div>
        <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">{cfg.title}</h1>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">{cfg.subtitle}</p>

        <input
          ref={fileInputRef}
          type="file"
          accept={KYC_ALLOWED_MIME_TYPES.join(',')}
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={handlePickFile}
        />

        <div className="space-y-4">
          {previewUrl ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-inner">
              <img src={previewUrl} alt="" className="mx-auto max-h-56 w-full object-contain" />
            </div>
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center">
              <PhotoIcon className="mb-3 h-10 w-10 text-gray-400" aria-hidden />
              <p className="text-sm text-gray-600">Nenhuma imagem selecionada</p>
            </div>
          )}

          {stepError ? (
            <div
              className="flex gap-3 rounded-xl border border-red-200/90 bg-red-50 p-4 text-[0.875rem]"
              role="alert"
            >
              <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
              <p className="break-words text-red-900">{stepError}</p>
            </div>
          ) : null}

          <p className="text-center text-[0.75rem] leading-snug text-gray-500">
            JPG, PNG ou WebP · até {Math.round(KYC_MAX_FILE_BYTES / (1024 * 1024))} MB · não armazenamos base64 na conta;
            upload vai direto ao ambiente seguro.
          </p>
        </div>
      </>
    );
  };

  const renderReview = () => {
    const submitted = kycStatus?.submittedArtifacts || [];
    const req = requiredArtifacts;

    return (
      <>
        <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Revise seu envio</h1>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600">
          Confira se documentos{hasFaceVideo ? ', selfie e vídeo facial' : ' e selfie'} estão corretos. O envio segue pelo
          fluxo seguro já usado pelo app.
        </p>

        <ul className="mb-8 space-y-3">
          {req.map((key) => {
            const ok = submitted.includes(key);
            return (
              <li
                key={key}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                  ok ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-200 bg-white'
                }`}
              >
                {ok ? (
                  <CheckCircleIcon className="h-7 w-7 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <ExclamationTriangleIcon className="h-7 w-7 shrink-0 text-amber-500" aria-hidden />
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{ARTIFACT_LABELS[key] || key}</p>
                  <p className="text-xs text-gray-600">{ok ? 'Confirmado no servidor' : 'Ainda pendente'}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {req.some((key) => localPreviewUrlByType[key]) ? (
          <p className="mb-4 text-[0.8rem] text-gray-500">Pré-visualizações locais abaixo (não substituem a confirmação no servidor).</p>
        ) : null}

        <div className={`mb-8 grid gap-2 ${req.length > 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {req.map((key) =>
            localPreviewUrlByType[key] ? (
              <div key={key} className="overflow-hidden rounded-lg border border-gray-200">
                {key === 'FACE_VIDEO' ? (
                  <video
                    src={localPreviewUrlByType[key]}
                    className="h-24 w-full object-cover"
                    muted
                    playsInline
                    aria-label="Pré-visualização vídeo facial"
                  />
                ) : (
                  <img src={localPreviewUrlByType[key]} alt="" className="h-24 w-full object-cover" />
                )}
              </div>
            ) : null
          )}
        </div>

        {reviewError ? (
          <div className="mb-6 flex gap-3 rounded-xl border border-red-200/90 bg-red-50 p-4 text-[0.875rem]" role="alert">
            <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
            <p className="break-words text-red-900">{reviewError}</p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-[0.82rem] leading-snug text-blue-950">
          Ao enviar, você declara que as imagens correspondem ao seu documento oficial. A validação da identidade segue políticas da AgilBank e pode incluir revisão quando necessário para produtos específicos.
        </div>
      </>
    );
  };

  const renderTerminalApproved = () => (
    <div className="flex flex-col items-center px-6 pb-10 pt-[calc(3rem+env(safe-area-inset-top,0))] text-center">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircleIcon className="h-11 w-11 text-agilbank-success" aria-hidden />
      </div>
      <h1 className="mb-3 text-2xl font-bold text-gray-900">Identidade verificada</h1>
      <p className="max-w-xs text-[0.95rem] leading-relaxed text-gray-600">{kycStatus?.message}</p>
      <ReturnNav
        to={returnTo}
        className="mt-10 text-sm font-semibold text-agilbank-primary underline-offset-2 hover:underline"
      >
        Voltar ao app
      </ReturnNav>
    </div>
  );

  const renderTerminalWaiting = () => (
    <div className="flex flex-col items-center px-6 pb-10 pt-[calc(3rem+env(safe-area-inset-top,0))] text-center">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
        <FingerPrintIcon className="h-10 w-10 text-agilbank-primary" aria-hidden />
      </div>
      <h1 className="mb-3 text-2xl font-bold text-gray-900">Agora é com a gente!</h1>
      <p className="max-w-xs text-[0.95rem] leading-relaxed text-gray-600">{kycStatus?.message}</p>
      <p className="mt-6 max-w-xs text-[0.82rem] leading-snug text-gray-500">
        A validação da identidade segue quando houver atualização disponível para sua conta neste aplicativo — não garantimos tempo de retorno específico.
      </p>
      <ReturnNav to={returnTo} className="mt-10 text-sm font-semibold text-agilbank-primary hover:underline">
        Voltar ao app
      </ReturnNav>
    </div>
  );

  const renderTerminalResubmit = () => (
    <div className="flex flex-col px-6 pb-10 pt-[calc(3rem+env(safe-area-inset-top,0))]">
      <div className="mb-6 flex justify-center">
        <div className="rounded-full bg-amber-100 p-4">
          <ExclamationTriangleIcon className="h-10 w-10 text-amber-700" aria-hidden />
        </div>
      </div>
      <h1 className="mb-3 text-center text-2xl font-bold text-gray-900">Precisamos que você envie de novo</h1>
      <p className="mb-8 text-center text-[0.95rem] leading-relaxed text-gray-600">{kycStatus?.message}</p>
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full rounded-xl py-4 font-semibold shadow-lg shadow-agilbank-primary/20"
        onClick={() => {
          setForceFlow(true);
          setStep(STEP.WELCOME);
          setReviewError('');
          setStepError('');
        }}
      >
        Reenviar documentos
      </Button>
      <ReturnNav to={returnTo} className="mt-6 block text-center text-sm font-semibold text-agilbank-primary hover:underline">
        Voltar ao app
      </ReturnNav>
    </div>
  );

  const renderTerminalRejected = () => (
    <div className="flex flex-col px-6 pb-10 pt-[calc(3rem+env(safe-area-inset-top,0))]">
      <div className="mb-6 flex justify-center">
        <div className="rounded-full bg-red-100 p-4">
          <ExclamationTriangleIcon className="h-10 w-10 text-red-600" aria-hidden />
        </div>
      </div>
      <h1 className="mb-3 text-center text-2xl font-bold text-gray-900">Não confirmamos a identidade com essas fotos</h1>
      <p className="mb-8 text-center text-[0.95rem] leading-relaxed text-gray-600">{kycStatus?.message}</p>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full rounded-xl py-4 font-semibold"
        onClick={() => {
          setForceFlow(true);
          setStep(STEP.WELCOME);
        }}
      >
        Tentar novo envio
      </Button>
      <ReturnNav to={returnTo} className="mt-6 block text-center text-sm font-semibold text-agilbank-primary hover:underline">
        Voltar ao app
      </ReturnNav>
    </div>
  );

  if (bootLoading) {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200/80 px-3 py-10">
        <div className="flex w-full max-w-[430px] flex-col items-center justify-center rounded-3xl bg-white p-12 shadow-2xl sm:rounded-[2rem]">
          <div className="mb-6 h-11 w-11 animate-spin rounded-full border-[3px] border-agilbank-primary/25 border-t-agilbank-primary" />
          <p className="text-center text-sm font-medium text-gray-700">Carregando verificação…</p>
        </div>
      </div>
    );
  }

  if (bootError && !kycStatus) {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200/80 px-3 py-10">
        <div className="w-full max-w-[430px] rounded-3xl bg-white p-8 shadow-2xl sm:rounded-[2rem]">
          <div className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-[0.9rem] text-red-900">
            <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
            <p>{bootError}</p>
          </div>
          <Button
            type="button"
            variant="primary"
            className="mb-4 w-full rounded-xl py-3 font-semibold"
            onClick={async () => {
              setBootLoading(true);
              setBootError('');
              try {
                const data = await refreshStatus();
                syncStepFromStatus(data);
              } catch (err) {
                setBootError(parseApiError(err, 'Não foi possível carregar o status.').message);
              } finally {
                setBootLoading(false);
              }
            }}
          >
            Tentar novamente
          </Button>
          <ReturnNav to={returnTo} className="block text-center text-sm font-semibold text-agilbank-primary hover:underline">
            Voltar ao app
          </ReturnNav>
        </div>
      </div>
    );
  }

  if (featureDisabledHint && !kycStatus) {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200/80 px-3 py-10">
        <div className="w-full max-w-[430px] rounded-3xl bg-white p-8 shadow-2xl sm:rounded-[2rem]">
          <p className="text-center text-gray-800">{featureDisabledHint}</p>
          <ReturnNav to={returnTo} className="mt-8 block text-center text-sm font-semibold text-agilbank-primary hover:underline">
            Voltar
          </ReturnNav>
        </div>
      </div>
    );
  }

  if (terminalKind === 'approved') {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200/75 px-3 py-0 sm:py-10">
        <div className="relative flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:rounded-[2rem] sm:border border-white/40">
          {renderTerminalApproved()}
        </div>
      </div>
    );
  }

  if (showBlockingTerminal && terminalKind === 'waiting') {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200/75 px-3 py-0 sm:py-10">
        <div className="relative flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:rounded-[2rem] sm:border border-white/40">
          {renderTerminalWaiting()}
        </div>
      </div>
    );
  }

  if (showBlockingTerminal && terminalKind === 'resubmit') {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200/75 px-3 py-0 sm:py-10">
        <div className="relative flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:rounded-[2rem] sm:border border-white/40">
          {renderTerminalResubmit()}
        </div>
      </div>
    );
  }

  if (showBlockingTerminal && terminalKind === 'rejected') {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200/75 px-3 py-0 sm:py-10">
        <div className="relative flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:rounded-[2rem] sm:border border-white/40">
          {renderTerminalRejected()}
        </div>
      </div>
    );
  }

  const shell = (
    <div
      className={`flex min-h-[100dvh] justify-center ${step === STEP.WELCOME ? 'bg-agilbank-primary/[0.04]' : 'bg-zinc-200/75'} px-3 py-0 sm:py-10`}
    >
      <div
        className={`relative flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:rounded-[2rem] sm:border border-white/40 ${step === STEP.WELCOME ? 'register-hero-bg' : ''}`}
      >
        {step !== STEP.WELCOME ? (
          <header className="sticky top-0 z-20 border-b border-gray-100/90 bg-white/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0)+0.875rem)] backdrop-blur">
            <div className="relative mb-5 flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label="Voltar"
                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-700 hover:bg-gray-100 active:bg-gray-200"
                onClick={goBack}
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
              <ReturnNav
                to={returnTo}
                className="absolute right-0 text-xs font-medium text-agilbank-primary hover:underline sm:text-[0.8rem]"
              >
                Fechar
              </ReturnNav>
            </div>
            <div className="space-y-2">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
                role="progressbar"
                aria-valuenow={progressIndex}
                aria-valuemin={1}
                aria-valuemax={progressTotal}
              >
                <div
                  className="h-full rounded-full bg-agilbank-primary transition-all duration-500 ease-out"
                  style={{ width: `${(progressIndex / progressTotal) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <span>Verificação</span>
                <span aria-live="polite">
                  {progressIndex} / {progressTotal}
                </span>
              </div>
            </div>
          </header>
        ) : null}

        <div
          ref={scrollRef}
          className={`register-scroll-area flex-1 overflow-y-auto overscroll-y-contain ${step === STEP.WELCOME ? '' : 'px-5 pt-5'}`}
          style={{ paddingBottom: scrollPaddingBottom }}
        >
          {featureDisabledHint ? (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.85rem] text-amber-950">
              {featureDisabledHint}
            </div>
          ) : null}

          {step === STEP.WELCOME ? renderWelcome() : null}
          {step >= STEP.DOC_FRONT && step <= STEP.SELFIE ? renderUploadStep() : null}
          {step === STEP.FACE_VIDEO ? (
            <FaceVideoCapture
              onUploadFile={handleUploadFaceVideo}
              uploadBusy={uploadBusy}
              errorMessage={stepError}
              onClearError={() => setStepError('')}
            />
          ) : null}
          {step === STEP.REVIEW ? renderReview() : null}
        </div>

        <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center">
          <div className="pointer-events-auto flex w-full max-w-[430px] flex-col gap-3 rounded-t-[1.25rem] border-t border-gray-100 bg-white/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_40px_rgba(0,36,71,0.08)] backdrop-blur-md">
            {step === STEP.WELCOME ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full rounded-xl py-4 text-[1rem] font-semibold shadow-lg shadow-agilbank-primary/25"
                  onClick={() => setStep(STEP.DOC_FRONT)}
                  disabled={!!featureDisabledHint}
                >
                  Começar
                </Button>
                <ReturnNav
                  to={returnTo}
                  className="w-full pb-3 text-center text-[0.95rem] font-medium text-agilbank-primary underline-offset-2 hover:underline"
                >
                  Agora não
                </ReturnNav>
              </>
            ) : null}

            {step >= STEP.DOC_FRONT && step <= STEP.SELFIE ? (
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full rounded-xl py-4 text-[1rem] font-semibold shadow-lg shadow-agilbank-primary/20"
                onClick={openPicker}
                disabled={uploadBusy || !!featureDisabledHint}
              >
                {uploadBusy ? 'Enviando…' : localPreviewUrlByType[FLOW_CONFIG[step]?.artifactType] ? 'Trocar imagem e enviar' : 'Selecionar imagem'}
              </Button>
            ) : null}

            {step === STEP.FACE_VIDEO ? (
              <p className="pb-1 text-center text-[0.78rem] text-gray-500">
                Use os botões acima para gravar e enviar o vídeo facial.
              </p>
            ) : null}

            {step === STEP.REVIEW ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full rounded-xl py-4 text-[1rem] font-semibold shadow-lg shadow-agilbank-primary/20"
                  disabled={!kycStatus?.canSubmitForReview || submitBusy || !!featureDisabledHint}
                  onClick={handleSubmitReview}
                >
                  {submitBusy ? 'Enviando…' : 'Enviar fotos'}
                </Button>
                {!kycStatus?.canSubmitForReview ? (
                  <p className="text-center text-[0.78rem] text-gray-500">
                    Confirme todos os arquivos obrigatórios antes de enviar.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </footer>

        {uploadBusy || submitBusy ? (
          <div
            className="register-loading-bg fixed inset-0 z-[200] flex flex-col items-center justify-center px-10 text-white"
            role="status"
            aria-busy="true"
          >
            <div className="mx-auto mb-10 h-12 w-12 animate-spin rounded-full border-[3px] border-white/35 border-t-white" />
            <p className="text-center text-lg font-semibold tracking-tight">
              {submitBusy
                ? 'Enviando…'
                : step === STEP.FACE_VIDEO
                  ? 'Enviando seu vídeo…'
                  : 'Processando seu arquivo…'}
            </p>
            <p className="mt-4 text-center text-sm text-blue-100/90">Não feche esta tela.</p>
          </div>
        ) : null}
      </div>
    </div>
  );

  return shell;
}
