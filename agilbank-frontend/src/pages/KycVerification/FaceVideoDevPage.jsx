import React, { useState } from 'react';
import FaceVideoCapture from './FaceVideoCapture';
import '../Register/Register.css';

/**
 * Preview local (somente `npm run dev`): /dev/face-video
 * Renderiza apenas a etapa de verificação facial, sem shell do Register.
 */
export default function FaceVideoDevPage() {
  const [kycStepError, setKycStepError] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);

  const handleUpload = async (file) => {
    setUploadBusy(true);
    try {
      if (import.meta.env.DEV) {
        console.info('[dev/face-video] vídeo pronto', {
          name: file.name,
          size: file.size,
          type: file.type,
        });
      }
    } finally {
      setUploadBusy(false);
    }
  };

  return (
    <div className="register-shell--onboarding flex min-h-[100dvh] w-full justify-center bg-white">
      <div className="mx-auto flex w-full max-w-[430px] flex-col px-5 pt-[calc(env(safe-area-inset-top,0)+1rem)] pb-8">
        <FaceVideoCapture
          variant="register"
          onUploadFile={handleUpload}
          uploadBusy={uploadBusy}
          errorMessage={kycStepError}
          onClearError={() => setKycStepError('')}
        />
      </div>
    </div>
  );
}
