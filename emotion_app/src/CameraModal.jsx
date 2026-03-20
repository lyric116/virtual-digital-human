import React from 'react';
import { Video, X } from 'lucide-react';

export default function CameraModal({
  cameraPermissionState,
  cameraState,
  isOpen,
  modalVideoRef,
  onClose,
  onTogglePreview,
  replayLocked,
  t,
}) {
  if (!isOpen) {
    return null;
  }

  const helperText = cameraPermissionState === 'granted'
    ? (cameraState === 'previewing'
      ? t.cameraModalPreviewing
      : t.cameraModalReady)
    : cameraPermissionState === 'requesting' || cameraPermissionState === 'idle'
      ? t.camReq
      : t.camErr;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={(e) => e.stopPropagation()}>
      <div className="bg-[#FDFBF7] rounded-3xl p-6 w-[90%] max-w-sm shadow-xl flex flex-col gap-4 border border-[#F0E5D8] transform transition-all scale-100">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-[#5C4D42] flex items-center gap-2">
            <Video size={20} className="text-[#D97757]" />
            {t.camModalTitle}
          </h3>
          <button
            onClick={onClose}
            className="text-[#8C7A6B] hover:text-[#D97757] transition-colors p-1 rounded-full hover:bg-[#FFF5EB]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="w-full aspect-video bg-white rounded-2xl border-2 border-[#F0E5D8] overflow-hidden relative flex items-center justify-center shadow-inner">
          {cameraPermissionState === 'idle' || cameraPermissionState === 'requesting' ? (
            <div className="flex flex-col items-center gap-3 text-[#A6998E] animate-pulse">
              <Video size={36} strokeWidth={1.5} />
              <span className="text-sm">{t.camReq}</span>
            </div>
          ) : cameraPermissionState === 'granted' ? (
            <video
              ref={modalVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-red-400 p-4 text-center">
              <X size={32} />
              <span className="text-sm">{helperText}</span>
            </div>
          )}
        </div>

        <p className="text-sm text-[#8C7A6B] leading-relaxed">{helperText}</p>

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onTogglePreview}
            disabled={replayLocked}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed ${cameraState === 'previewing' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-[#FFF0E5] text-[#D97757] hover:bg-[#FFE5D0]'}`}
          >
            {cameraState === 'previewing' ? t.cameraClose : t.cameraOpen}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-medium transition-all bg-[#D97757] text-white shadow-md hover:bg-[#c26649]"
          >
            {cameraPermissionState === 'granted' ? t.done : t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
