import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VideoCameraIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Button from '../../components/Button';
import {
  KYC_FACE_VIDEO_RECORD_MAX_MS,
  KYC_FACE_VIDEO_RECORD_MIN_MS,
  KYC_VIDEO_MAX_FILE_BYTES,
  pickKycVideoRecorderMimeType,
} from '../../services/kycService';

import './FaceVideoCapture.css';

/**
 * @param {{
 *   onUploadFile: (file: File) => Promise<void>;
 *   uploadBusy: boolean;
 *   errorMessage: string;
 *   onClearError: () => void;
 * }} props
 */
export default function FaceVideoCapture({ onUploadFile, uploadBusy, errorMessage, onClearError }) {
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
        setCameraError('Permissão da câmera negada. Autorize o acesso nas configurações do navegador e tente novamente.');
      } else if (name === 'NotFoundError') {
        setCameraError('Nenhuma câmera foi encontrada neste dispositivo.');
      } else {
        setCameraError('Não foi possível acessar a câmera. Tente novamente.');
      }
      setPhase('denied');
    }
  }, [onClearError, stopStream]);

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
    // Montagem única: evita reiniciar câmera a cada render do pai.
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
          setCameraError('Nenhum dado foi gravado. Tente novamente.');
          setPhase('live');
          return;
        }

        if (duration < KYC_FACE_VIDEO_RECORD_MIN_MS) {
          setCameraError(`Grave pelo menos ${KYC_FACE_VIDEO_RECORD_MIN_MS / 1000} segundos.`);
          setPhase('live');
          return;
        }

        if (blob.size > KYC_VIDEO_MAX_FILE_BYTES) {
          setCameraError(
            `O vídeo ficou grande demais (máx. ${Math.round(KYC_VIDEO_MAX_FILE_BYTES / (1024 * 1024))} MB). Grave novamente em ambiente com mais luz.`
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
      }, 200);

      autoStopTimerRef.current = setTimeout(() => {
        finishRecording();
      }, KYC_FACE_VIDEO_RECORD_MAX_MS);
    } catch (_) {
      setCameraError('Não foi possível iniciar a gravação neste dispositivo.');
      setPhase('unsupported');
    }
  }, [mimeChoice, onClearError, revokePreviewUrl, stopStream, finishRecording]);

  const handleUseVideo = async () => {
    if (!recordedFile || uploadBusy) return;
    onClearError();
    try {
      await onUploadFile(recordedFile);
    } catch (_) {
      /* parent sets error */
    }
  };

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const minSec = KYC_FACE_VIDEO_RECORD_MIN_MS / 1000;
  const maxSec = KYC_FACE_VIDEO_RECORD_MAX_MS / 1000;
  const ringProgress = Math.min(1, elapsedMs / KYC_FACE_VIDEO_RECORD_MAX_MS);

  const displayError = errorMessage || cameraError;

  if (phase === 'unsupported' || phase === 'denied') {
    return (
      <div className="face-video-root">
        <div className="mb-6 flex justify-center">
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
    <div className="face-video-root">
      <div className="mb-6 flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agilbank-primary/10 text-agilbank-primary">
          <VideoCameraIcon className="h-8 w-8" aria-hidden />
        </div>
      </div>
      <h1 className="mb-2 text-[1.5rem] font-bold leading-tight text-gray-900 sm:text-2xl">Gravação facial</h1>
      <p className="mb-4 text-[0.95rem] leading-relaxed text-gray-600">
        Centralize seu rosto e grave alguns segundos. Mantenha boa iluminação e olhe para a câmera.
      </p>
      <p className="mb-5 text-center text-[0.8rem] font-medium text-agilbank-primary">
        {phase === 'recording'
          ? `Gravando… ${elapsedSec}s (mín. ${minSec}s, máx. ${maxSec}s)`
          : phase === 'preview'
            ? 'Revise o vídeo antes de enviar'
            : 'Centralize seu rosto na moldura oval'}
      </p>

      <div className="face-video-stage relative mx-auto mb-5 w-full max-w-[320px]">
        {phase === 'preview' ? (
          <video
            ref={videoPlaybackRef}
            src={previewUrl}
            className="face-video-live face-video-playback h-full w-full object-cover"
            playsInline
            controls
            aria-label="Pré-visualização do vídeo gravado"
          />
        ) : (
          <>
            <video
              ref={videoLiveRef}
              className="face-video-live h-full w-full object-cover"
              playsInline
              muted
              autoPlay
              aria-label="Pré-visualização da câmera"
            />
            <div className="face-video-mask pointer-events-none absolute inset-0" aria-hidden />
            <div className="face-video-oval pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <div
                className="face-video-oval-ring"
                style={{
                  background: `conic-gradient(#003366 ${ringProgress * 360}deg, rgba(255,255,255,0.35) 0deg)`,
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

      <p className="mb-6 text-center text-[0.75rem] leading-snug text-gray-500">
        Vídeo curto ({minSec}–{maxSec}s) · até {Math.round(KYC_VIDEO_MAX_FILE_BYTES / (1024 * 1024))} MB · envio direto ao ambiente
        seguro (sem salvar no navegador).
      </p>

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

        {phase === 'recording' ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full rounded-xl py-4 font-semibold"
            onClick={finishRecording}
            disabled={elapsedMs < KYC_FACE_VIDEO_RECORD_MIN_MS}
          >
            {elapsedMs < KYC_FACE_VIDEO_RECORD_MIN_MS
              ? `Aguarde ${minSec}s…`
              : 'Parar gravação'}
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
