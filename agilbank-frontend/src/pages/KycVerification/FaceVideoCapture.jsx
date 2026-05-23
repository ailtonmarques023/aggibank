import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VideoCameraIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Button from '../../components/Button';
import {
  KYC_FACE_VIDEO_RECORD_MAX_MS,
  KYC_FACE_VIDEO_RECORD_MIN_MS,
  KYC_FACE_VIDEO_REGISTER_MAX_MS,
  KYC_FACE_VIDEO_REGISTER_MIN_MS,
  KYC_VIDEO_MAX_FILE_BYTES,
  pickKycVideoRecorderMimeType,
} from '../../services/kycService';

import './FaceVideoCapture.css';

const REGISTER_GUIDED_PHASES = [
  { fromMs: 0, toMs: 2000, text: 'Olhe para a câmera' },
  { fromMs: 2000, toMs: 4000, text: 'Vire levemente o rosto para a esquerda' },
  { fromMs: 4000, toMs: 6000, text: 'Vire levemente o rosto para a direita' },
  { fromMs: 6000, toMs: 8000, text: 'Aproxime um pouco o rosto da câmera' },
  { fromMs: 8000, toMs: 10000, text: 'Volte ao centro e mantenha o rosto parado' },
];

function instructionForElapsed(elapsedMs, phases) {
  const hit = phases.find((p) => elapsedMs >= p.fromMs && elapsedMs < p.toMs);
  return hit ? hit.text : phases[phases.length - 1].text;
}

/**
 * @param {{
 *   onUploadFile: (file: File) => Promise<void>;
 *   uploadBusy: boolean;
 *   errorMessage: string;
 *   onClearError: () => void;
 *   variant?: 'default' | 'register';
 * }} props
 */
export default function FaceVideoCapture({
  onUploadFile,
  uploadBusy,
  errorMessage,
  onClearError,
  variant = 'default',
}) {
  const isRegister = variant === 'register';
  const recordMinMs = isRegister ? KYC_FACE_VIDEO_REGISTER_MIN_MS : KYC_FACE_VIDEO_RECORD_MIN_MS;
  const recordMaxMs = isRegister ? KYC_FACE_VIDEO_REGISTER_MAX_MS : KYC_FACE_VIDEO_RECORD_MAX_MS;
  const guidedPhases = isRegister ? REGISTER_GUIDED_PHASES : null;

  const videoLiveRef = useRef(null);
  const videoPlaybackRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartedAtRef = useRef(0);
  const autoStopTimerRef = useRef(null);
  const tickTimerRef = useRef(null);
  const previewUrlRef = useRef(null);

  const [phase, setPhase] = useState('init');
  const [cameraError, setCameraError] = useState('');
  const [recordedFile, setRecordedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [mimeChoice, setMimeChoice] = useState(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch (_) {
        /* ignore */
      }
      previewUrlRef.current = null;
    }
    setPreviewUrl('');
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {
          /* ignore */
        }
      });
      streamRef.current = null;
    }
    if (videoLiveRef.current) {
      videoLiveRef.current.srcObject = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const permissionDeniedMessage = isRegister
    ? 'Permita o acesso à câmera para continuar a verificação facial.'
    : 'Permissão da câmera negada. Autorize o acesso nas configurações do navegador e tente novamente.';

  const startCamera = useCallback(async () => {
    onClearError();
    setCameraError('');
    const choice = pickKycVideoRecorderMimeType();
    if (!choice) {
      setCameraError('Seu navegador não suporta gravação de vídeo. Tente outro dispositivo ou navegador atualizado.');
      setPhase('unsupported');
      return;
    }
    setMimeChoice(choice);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Câmera indisponível neste navegador.');
      setPhase('unsupported');
      return;
    }

    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
      });
      streamRef.current = stream;
      if (videoLiveRef.current) {
        videoLiveRef.current.srcObject = stream;
        await videoLiveRef.current.play().catch(() => {});
      }
      setPhase('live');
    } catch (err) {
      const name = err && err.name ? String(err.name) : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError(permissionDeniedMessage);
      } else if (name === 'NotFoundError') {
        setCameraError('Nenhuma câmera foi encontrada neste dispositivo.');
      } else {
        setCameraError(
          isRegister
            ? 'Não conseguimos gravar seu vídeo. Verifique a permissão da câmera e tente novamente.'
            : 'Não foi possível acessar a câmera. Tente novamente.'
        );
      }
      setPhase('denied');
    }
  }, [onClearError, stopStream, isRegister, permissionDeniedMessage]);

  useEffect(() => {
    startCamera();
    return () => {
      clearTimers();
      stopStream();
      revokePreviewUrl();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch (_) {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetRecording = useCallback(() => {
    clearTimers();
    chunksRef.current = [];
    setRecordedFile(null);
    revokePreviewUrl();
    setElapsedMs(0);
    onClearError();
    setCameraError('');
    setPhase('live');
    startCamera();
  }, [clearTimers, revokePreviewUrl, onClearError, startCamera]);

  const finishRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    try {
      recorder.stop();
    } catch (_) {
      /* ignore */
    }
    clearTimers();
  }, [clearTimers]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || !mimeChoice) return;
    onClearError();
    chunksRef.current = [];
    revokePreviewUrl();
    setRecordedFile(null);

    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType: mimeChoice.recorderMime });
      recorderRef.current = recorder;
      recordStartedAtRef.current = Date.now();
      setElapsedMs(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const duration = Date.now() - recordStartedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeChoice.mime });
        chunksRef.current = [];

        if (blob.size <= 0) {
          setCameraError(
            isRegister
              ? 'Não conseguimos gravar seu vídeo. Verifique a permissão da câmera e tente novamente.'
              : 'Nenhum dado foi gravado. Tente novamente.'
          );
          setPhase('live');
          return;
        }

        if (duration < recordMinMs) {
          setCameraError(
            isRegister
              ? `Grave pelo menos ${recordMinMs / 1000} segundos seguindo as instruções.`
              : `Grave pelo menos ${recordMinMs / 1000} segundos.`
          );
          setPhase('live');
          return;
        }

        if (blob.size > KYC_VIDEO_MAX_FILE_BYTES) {
          setCameraError(
            isRegister
              ? 'Vídeo muito grande. Grave um vídeo mais curto.'
              : `O vídeo ficou grande demais (máx. ${Math.round(KYC_VIDEO_MAX_FILE_BYTES / (1024 * 1024))} MB). Grave novamente em ambiente com mais luz.`
          );
          setPhase('live');
          return;
        }

        const file = new File([blob], `face-video.${mimeChoice.extension}`, { type: mimeChoice.mime });
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setRecordedFile(file);
        stopStream();
        setPhase('preview');
      };

      recorder.start(200);
      setPhase('recording');

      tickTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - recordStartedAtRef.current);
      }, 150);

      autoStopTimerRef.current = setTimeout(() => {
        finishRecording();
      }, recordMaxMs);
    } catch (_) {
      setCameraError(
        isRegister
          ? 'Não conseguimos gravar seu vídeo. Verifique a permissão da câmera e tente novamente.'
          : 'Não foi possível iniciar a gravação neste dispositivo.'
      );
      setPhase(isRegister ? 'denied' : 'unsupported');
    }
  }, [
    mimeChoice,
    onClearError,
    revokePreviewUrl,
    stopStream,
    finishRecording,
    recordMinMs,
    recordMaxMs,
    isRegister,
  ]);

  const handleUseVideo = async () => {
    if (!recordedFile || uploadBusy) return;
    onClearError();
    try {
      await onUploadFile(recordedFile);
    } catch (_) {
      /* parent sets error */
    }
  };

  const elapsedSec = Math.min(Math.ceil(elapsedMs / 1000), Math.ceil(recordMaxMs / 1000));
  const targetSec = Math.ceil(recordMaxMs / 1000);
  const minSec = recordMinMs / 1000;
  const maxSec = recordMaxMs / 1000;
  const ringProgress = Math.min(1, elapsedMs / recordMaxMs);

  const guidedText = useMemo(() => {
    if (!guidedPhases || phase !== 'recording') return '';
    return instructionForElapsed(elapsedMs, guidedPhases);
  }, [guidedPhases, phase, elapsedMs]);

  const displayError = errorMessage || cameraError;
  const rootClass = isRegister ? 'face-video-root face-video-root--register' : 'face-video-root';

  if (phase === 'unsupported' || phase === 'denied') {
    return (
      <div className={rootClass}>
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <ExclamationTriangleIcon className="h-8 w-8" aria-hidden />
          </div>
        </div>
        <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Gravação facial</h1>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-gray-600" role="alert">
          {displayError}
        </p>
        {phase === 'denied' ? (
          <Button type="button" variant="primary" size="lg" className="w-full rounded-xl py-4 font-semibold" onClick={startCamera}>
            Tentar novamente
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {!isRegister ? (
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agilbank-primary/10 text-agilbank-primary">
            <VideoCameraIcon className="h-8 w-8" aria-hidden />
          </div>
        </div>
      ) : null}

      <h1 className={`${isRegister ? 'mb-2' : 'mb-2'} text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl`}>
        Gravação facial
      </h1>

      {isRegister ? (
        <>
          <p className="mb-2 text-[0.95rem] leading-relaxed text-gray-600">
            Vamos gravar um vídeo curto para confirmar que é você.
          </p>
          <p className="mb-4 text-[0.88rem] leading-relaxed text-gray-500">
            Mantenha o rosto dentro da moldura e siga as instruções na tela.
          </p>
        </>
      ) : (
        <p className="mb-4 text-[0.95rem] leading-relaxed text-gray-600">
          Centralize seu rosto e grave alguns segundos. Mantenha boa iluminação e olhe para a câmera.
        </p>
      )}

      {isRegister && phase === 'recording' ? (
        <div className="face-video-instruction mb-3 text-center" aria-live="polite">
          <p className="text-[1.05rem] font-semibold leading-snug text-agilbank-primary">{guidedText}</p>
          <p className="mt-2 text-[0.85rem] font-medium text-gray-600">
            Gravando… {elapsedSec}s de {targetSec}s
          </p>
          <div className="face-video-progress-track mx-auto mt-3 max-w-[280px]">
            <div className="face-video-progress-fill" style={{ width: `${ringProgress * 100}%` }} />
          </div>
        </div>
      ) : null}

      {isRegister && phase === 'preview' ? (
        <p className="mb-4 text-center text-[0.88rem] font-medium text-gray-600">Revise o vídeo antes de continuar</p>
      ) : null}

      {!isRegister ? (
        <p className="mb-5 text-center text-[0.8rem] font-medium text-agilbank-primary">
          {phase === 'recording'
            ? `Gravando… ${elapsedSec}s (mín. ${minSec}s, máx. ${maxSec}s)`
            : phase === 'preview'
              ? 'Revise o vídeo antes de enviar'
              : 'Centralize seu rosto na moldura oval'}
        </p>
      ) : null}

      <div className={`face-video-stage relative mx-auto mb-4 w-full ${isRegister ? '' : 'max-w-[320px]'}`}>
        {phase === 'preview' ? (
          <video
            ref={videoPlaybackRef}
            src={previewUrl}
            className="face-video-live face-video-playback h-full w-full"
            playsInline
            controls
            aria-label="Pré-visualização do vídeo gravado"
          />
        ) : (
          <>
            <video
              ref={videoLiveRef}
              className="face-video-live h-full w-full"
              playsInline
              muted
              autoPlay
              aria-label="Pré-visualização da câmera"
            />
            <div className="face-video-mask pointer-events-none absolute inset-0" aria-hidden />
            <div className="face-video-oval pointer-events-none absolute inset-0" aria-hidden>
              <div
                className="face-video-oval-ring"
                style={{
                  background: `conic-gradient(#0066b3 ${ringProgress * 360}deg, rgba(255,255,255,0.35) 0deg)`,
                }}
              />
            </div>
          </>
        )}
      </div>

      {displayError ? (
        <div className="mb-4 flex gap-3 rounded-xl border border-red-200/90 bg-red-50 p-4 text-[0.875rem]" role="alert">
          <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
          <p className="break-words text-red-900">{displayError}</p>
        </div>
      ) : null}

      {!isRegister ? (
        <p className="mb-6 text-center text-[0.75rem] leading-snug text-gray-500">
          Vídeo curto ({minSec}–{maxSec}s) · até {Math.round(KYC_VIDEO_MAX_FILE_BYTES / (1024 * 1024))} MB · envio direto ao ambiente
          seguro (sem salvar no navegador).
        </p>
      ) : (
        <p className="mb-5 text-center text-[0.75rem] leading-snug text-gray-500">
          Vídeo de {minSec} a {maxSec} segundos · até {Math.round(KYC_VIDEO_MAX_FILE_BYTES / (1024 * 1024))} MB
        </p>
      )}

      <div className="flex flex-col gap-3">
        {phase === 'live' ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full rounded-xl py-4 font-semibold shadow-lg shadow-agilbank-primary/20"
            onClick={startRecording}
            disabled={uploadBusy}
          >
            Iniciar gravação
          </Button>
        ) : null}

        {phase === 'recording' && !isRegister ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full rounded-xl py-4 font-semibold"
            onClick={finishRecording}
            disabled={elapsedMs < recordMinMs}
          >
            {elapsedMs < recordMinMs ? `Aguarde ${minSec}s…` : 'Parar gravação'}
          </Button>
        ) : null}

        {phase === 'recording' && isRegister ? (
          <Button type="button" variant="primary" size="lg" className="w-full rounded-xl py-4 font-semibold" disabled>
            Gravando…
          </Button>
        ) : null}

        {phase === 'preview' ? (
          <>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full rounded-xl py-4 font-semibold shadow-lg shadow-agilbank-primary/20"
              onClick={handleUseVideo}
              disabled={uploadBusy}
            >
              {uploadBusy ? 'Enviando…' : 'Usar este vídeo'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full rounded-xl py-4 font-semibold"
              onClick={resetRecording}
              disabled={uploadBusy}
            >
              Gravar novamente
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
