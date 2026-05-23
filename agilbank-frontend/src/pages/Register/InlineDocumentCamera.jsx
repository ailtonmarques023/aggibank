import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../../components/Button';

/**
 * Câmera inline para captura de documento (cadastro linear).
 * @param {{
 *   active: boolean;
 *   fileName?: string;
 *   permissionErrorMessage?: string;
 *   onCapture: (file: File) => void;
 *   onCancel: () => void;
 * }} props
 */
export default function InlineDocumentCamera({
  active,
  fileName = 'document.jpg',
  permissionErrorMessage = 'Permita o acesso à câmera para fotografar o documento.',
  onCapture,
  onCancel,
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
          facingMode: { ideal: 'environment' },
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
  }, [permissionErrorMessage, stopStream]);

  useEffect(() => {
    if (!active) {
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
  }, [active, startCamera, stopStream]);

  const handleCancel = () => {
    stopStream();
    onCancel();
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
    ctx.drawImage(video, 0, 0, w, h);

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

  if (!active) return null;

  return (
    <div className="document-camera-inline">
      <div className="document-camera-stage">
        <video
          ref={videoRef}
          className="document-camera-video"
          playsInline
          muted
          autoPlay
          aria-label="Pré-visualização da câmera para documento"
        />
        <div className="document-camera-frame" aria-hidden />
      </div>

      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {error ? (
        <p className="document-camera-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="document-camera-actions">
        {phase === 'live' ? (
          <>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="register-footer-btn register-footer-btn--primary w-full"
              onClick={handleCapture}
              disabled={capturing}
            >
              {capturing ? 'Capturando…' : 'Capturar foto'}
            </Button>
            <button type="button" className="document-camera-cancel" onClick={handleCancel}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="register-footer-btn register-footer-btn--primary w-full"
              onClick={startCamera}
            >
              Tentar novamente
            </Button>
            <button type="button" className="document-camera-cancel" onClick={handleCancel}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
