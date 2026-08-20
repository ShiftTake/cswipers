import React, { useEffect, useRef, useState } from 'react';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const CAPTURE_FRONT = 'CAPTURE_FRONT';
const CAPTURE_BACK = 'CAPTURE_BACK';
const COMPLETE = 'COMPLETE';

export const compressCardPhoto = (photoUri, maxWidth = 1200, quality = 0.82) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('Unable to create an image canvas.'));
      return;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to compress card photo.'));
        return;
      }

      resolve(new File([blob], 'card-photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', Math.min(0.85, Math.max(0.8, quality)));
  };
  image.onerror = () => reject(new Error('Unable to load card photo.'));
  image.src = photoUri;
});

const compressFileForSide = async (file, side) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const compressedFile = await compressCardPhoto(objectUrl);
    return new File([compressedFile], `card-${side}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const isUsableImage = (file) => (
  file && file.type.startsWith('image/') && file.size <= MAX_IMAGE_SIZE
);

export default function CardScannerModal({ isOpen, onClose, onImagesCaptured }) {
  const [captureStage, setCaptureStage] = useState(CAPTURE_FRONT);
  const [frontFile, setFrontFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [showCaptureFlash, setShowCaptureFlash] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const stopPreview = async () => {
      await CameraPreview.stop().catch(() => {});
    };

    if (!isOpen) {
      if (Capacitor.isNativePlatform()) stopPreview();
      return () => {
        isMounted = false;
      };
    }

    setCaptureStage(CAPTURE_FRONT);
    setFrontFile(null);
    setFrontPreview('');
    setIsCapturing(false);
    setShowCaptureFlash(false);
    setError('');

    if (Capacitor.isNativePlatform()) {
      CameraPreview.start({
        parent: 'camera-container',
        position: 'rear',
        toBack: true
      }).catch((startError) => {
        if (isMounted) {
          console.error('Failed to start camera preview:', startError);
          setError('Unable to start the camera preview. Check camera permission and try again.');
        }
      });
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
      if (Capacitor.isNativePlatform()) stopPreview();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!frontFile) {
      setFrontPreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(frontFile);
    setFrontPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [frontFile]);

  if (!isOpen) return null;

  const finishCapture = (backFile) => {
    if (!frontFile || !backFile) return;
    onImagesCaptured(frontFile, backFile);
    onClose();
  };

  const playCaptureFeedback = async () => {
    setShowCaptureFlash(true);
    window.setTimeout(() => setShowCaptureFlash(false), 150);

    if (Capacitor.isNativePlatform()) {
      const style = captureStage === CAPTURE_BACK ? ImpactStyle.Medium : ImpactStyle.Light;
      await Haptics.impact({ style }).catch(() => {});
    }
  };

  const handleCapturedFile = async (file) => {
    if (!isUsableImage(file)) {
      setError('Choose an image under 12MB.');
      return;
    }

    setError('');
    await playCaptureFeedback();

    if (captureStage === CAPTURE_FRONT) {
      setFrontFile(file);
      setCaptureStage(CAPTURE_BACK);
    } else {
      setCaptureStage(COMPLETE);
      window.setTimeout(() => finishCapture(file), 220);
    }
  };

  const handleCaptureCardPhoto = async () => {
    if (isCapturing) return;

    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }

    setIsCapturing(true);
    setError('');
    try {
      const side = captureStage === CAPTURE_FRONT ? 'front' : 'back';
      const captureResult = await CameraPreview.capture({ quality: 85 });
      const captureValue = captureResult?.value || captureResult?.base64String || captureResult?.base64;
      if (!captureValue) throw new Error('The camera preview did not return an image.');
      const photoUri = captureValue.startsWith('data:')
        ? captureValue
        : `data:image/jpeg;base64,${captureValue}`;
      const compressedFile = await compressCardPhoto(photoUri);
      const file = new File([compressedFile], `card-${side}.jpg`, { type: 'image/jpeg' });
      handleCapturedFile(file);
    } catch (captureError) {
      if (!captureError?.message?.toLowerCase().includes('cancel')) {
        console.error('Card capture failed:', captureError);
        setError('Unable to open the camera. Check camera permission and try again.');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col overflow-hidden bg-transparent text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-scanner-title"
    >
      <div id="camera-container" className="absolute inset-0 bg-transparent" aria-hidden="true" />
      <div className="relative z-10 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="w-11" aria-hidden="true" />
        <p id="card-scanner-title" className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
          Card Capture
        </p>
        <button
          type="button"
          onClick={onClose}
          disabled={isCapturing}
          aria-label="Cancel card capture"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl font-light text-white transition-colors hover:bg-white/20 disabled:opacity-40"
        >
          <span aria-hidden="true">x</span>
        </button>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center bg-black/25 px-5 pb-8 pt-6">
        <div className="mb-8 min-h-[3.5rem] text-center">
          <p
            key={captureStage}
            className="animate-[scannerInstructionIn_260ms_ease-out] text-[22px] font-semibold leading-tight tracking-[-0.02em] text-white"
          >
            {captureStage === CAPTURE_FRONT
              ? 'Position FRONT of card in frame'
              : captureStage === CAPTURE_BACK
                ? 'Position BACK of card in frame'
                : 'Processing card photos'}
          </p>
          <p className="mt-2 text-sm text-white/50">
            {captureStage === CAPTURE_FRONT
              ? 'First capture'
              : captureStage === CAPTURE_BACK
                ? 'Front captured. Now turn the card over.'
                : 'Saving both sides to your listing'}
          </p>
        </div>

        <div className="relative w-[min(72vw,280px)] aspect-[5/7] overflow-hidden rounded-[22px] border border-white/35 bg-white/[0.03] shadow-[0_0_0_9999px_rgba(0,0,0,0.68),0_24px_70px_rgba(0,0,0,0.5)]">
          {captureStage !== CAPTURE_FRONT && frontPreview && (
            <img src={frontPreview} alt="Captured front of card" className="absolute inset-0 h-full w-full object-cover opacity-20" />
          )}
          <div className="pointer-events-none absolute inset-3 rounded-[14px] border border-white/45" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[72%] -translate-x-1/2 bg-white/25" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-px -translate-x-1/2 -translate-y-1/2 bg-white/25" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
            {captureStage === CAPTURE_FRONT ? 'Front' : 'Back'}
          </div>
        </div>

        {captureStage === CAPTURE_BACK && frontPreview && (
          <button
            type="button"
            onClick={() => setCaptureStage(CAPTURE_FRONT)}
            disabled={isCapturing}
            className="mt-5 flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-left transition-colors hover:bg-white/[0.12] disabled:opacity-40"
          >
            <img src={frontPreview} alt="Front thumbnail" className="h-12 w-9 rounded-md object-cover" />
            <span>
              <span className="block text-xs font-semibold text-white">Retake Front</span>
              <span className="block text-[11px] text-white/50">Use this if the front needs another shot</span>
            </span>
          </button>
        )}

        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleCaptureCardPhoto}
            disabled={isCapturing || captureStage === COMPLETE}
            aria-label={isCapturing ? 'Capturing photo' : `Capture ${captureStage === CAPTURE_FRONT ? 'front' : 'back'} photo`}
            className="relative flex h-20 w-20 items-center justify-center rounded-full border-[5px] border-white/90 bg-white/10 shadow-[0_0_0_8px_rgba(255,255,255,0.12),0_16px_34px_rgba(0,0,0,0.38)] transition-transform hover:scale-105 active:scale-95 disabled:animate-pulse disabled:opacity-60"
          >
            <span className="h-14 w-14 rounded-full bg-white" />
          </button>
          <p className="text-xs text-white/50">Tap to capture</p>
        </div>

        {error && <p className="mt-5 max-w-xs text-center text-sm text-rose-300">{error}</p>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;

          try {
            const side = captureStage === CAPTURE_FRONT ? 'front' : 'back';
            await handleCapturedFile(await compressFileForSide(file, side));
          } catch (compressionError) {
            console.error('Card photo compression failed:', compressionError);
            setError('Unable to process this photo. Please try again.');
          }
        }}
      />

      {showCaptureFlash && <div className="pointer-events-none fixed inset-0 z-[101] bg-white/75 animate-[scannerFlash_150ms_ease-out]" />}

      <style>{`@keyframes scannerInstructionIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } } @keyframes scannerFlash { from { opacity: 0.75; } to { opacity: 0; } }`}</style>
    </div>
  );
}
