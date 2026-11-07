import React, { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/** Camera QR scanner using the platform BarcodeDetector (Chrome/Android).
 * Falls back to the paste field when the browser has no native detector. */
export function BookingQrCameraScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) {
      setStarting(false);
      setError('Camera QR scanning is not supported in this browser. Paste the booking QR token in the field instead.');
      return;
    }
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;
    const detector = new Detector({ formats: ['qr_code'] });
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStarting(false);
        timer = window.setInterval(async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes.map((code) => code.rawValue).find((raw) => raw.startsWith('bos1.'));
            if (value) {
              cancelled = true;
              if (timer) window.clearInterval(timer);
              onResult(value);
            }
          } catch {
            // transient decode errors are expected while the camera focuses
          }
        }, 450);
      } catch {
        setStarting(false);
        setError('Camera permission was not granted. Paste the booking QR token instead.');
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Scan booking QR">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 text-[#222222] shadow-2xl dark:bg-slate-950 dark:text-white">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4" aria-hidden="true" /> Scan booking QR</p>
          <button type="button" onClick={onClose} aria-label="Close scanner" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dddddd] dark:border-slate-700"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} muted playsInline className="h-64 w-full object-cover" aria-label="Camera preview" />
        </div>
        {starting && <p className="mt-2 text-xs text-[#717171]">Opening camera…</p>}
        {error && <p role="alert" className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">{error}</p>}
        <p className="mt-2 text-[11px] text-[#717171] dark:text-slate-400">Point the camera at the guest&apos;s My Trips QR. No guest data is encoded in the QR.</p>
      </div>
    </div>
  );
}
