import React, { useCallback, useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Button from '../../components/Button';
import './LinearCameraCapture.css';

/**
 * Captura de foto via getUserMedia (cadastro linear).
 * @param {{
 *   open: boolean;
 *   facingMode: 'user' | 'environment';
 *   fileName?: string;
 *   title: string;
 *   captureLabel: string;
 *   permissionErrorMessage: string;
 *   onClose: () => void;
 *   onCapture: (file: File) => void;
 * }} props
 */
export default function LinearCameraCapture({
  open,
  facingMode,
  fileName = 'capture.jpg',
  title,
  captureLabel,
  permissionErrorMessage,
  onClose,
  onCapture,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase, setPhase] = useState('init');
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {
          /* ignore */
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(permissionErrorMessage);
      setPhase('error');
      return;
    }

    stopStream();

    const tryConstraints = async (videoConstraints) => {
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });
    };

    try {
      let stream;
      try {
        stream = await tryConstraints({
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        });
      } catch (_) {
        stream = await tryConstraints(true);
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase('live');
    } catch (err) {
      const name = err && err.name ? String(err.name) : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError(permissionErrorMessage);
      } else if (name === 'NotFoundError') {
        setError('Nenhuma câmera foi encontrada neste dispositivo.');
      } else {
        setError(permissionErrorMessage);
      }
      setPhase('error');
    }
  }, [facingMode, permissionErrorMessage, stopStream]);

  useEffect(() => {
    if (!open) {
      stopStream();
      setPhase('init');
      setError('');
      setCapturing(false);
      return undefined;
    }
    startCamera();
    return () => {
      stopStream();
    };
  }, [open, startCamera, stopStream]);

  const handleClose = () => {
    stopStream();
    onClose();
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || capturing) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setError('Aguarde a câmera carregar e tente novamente.');
      setPhase('error');
      return;
    }

    setCapturing(true);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCapturing(false);
      return;
    }
    ctx.save();
    if (facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob || blob.size <= 0) {
          setError('Não foi possível capturar a imagem. Tente novamente.');
          setPhase('error');
          return;
        }
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        stopStream();
        onCapture(file);
      },
      'image/jpeg',
      0.92
    );
  };

  if (!open) return null;

  const isSelfie = facingMode === 'user';

  return (
    <div className="linear-camera-overlay" role="dialog" aria-modal="true" aria-labelledby="linear-camera-title">
      <div className="linear-camera-panel">
        <div className="linear-camera-header">
          <h2 id="linear-camera-title" className="linear-camera-title">
            {title}
          </h2>
          <button type="button" className="linear-camera-close" onClick={handleClose} aria-label="Fechar câmera">
            <XMarkIcon className="h-6 w-6" aria-hidden />
          </button>
        </div>

        {phase === 'error' ? (
          <p className="linear-camera-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className={`linear-camera-stage ${isSelfie ? 'linear-camera-stage--selfie' : ''}`}>
          <video
            ref={videoRef}
            className="linear-camera-video"
            playsInline
            muted
            autoPlay
            aria-label="Pré-visualização da câmera"
          />
        </div>

        <canvas ref={canvasRef} className="hidden" aria-hidden />

        <div className="linear-camera-actions">
          {phase === 'live' ? (
            <>
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="linear-camera-btn"
                onClick={handleCapture}
                disabled={capturing}
              >
                {capturing ? 'Capturando…' : captureLabel}
              </Button>
              <Button type="button" variant="secondary" size="lg" className="linear-camera-btn" onClick={handleClose}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" size="lg" className="linear-camera-btn" onClick={startCamera}>
              Tentar novamente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
