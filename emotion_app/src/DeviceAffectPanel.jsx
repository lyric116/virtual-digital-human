import React from 'react';
import { Heart, Mic, Sparkles, Video, X } from 'lucide-react';

export default function DeviceAffectPanel({
  affectSnapshot,
  cameraState,
  displayedEmotionDetail,
  displayedEmotionLabel,
  displayedEmotionQuote,
  mainVideoRef,
  onCloseCameraPreview,
  onOpenCameraModal,
  onOpenMicModal,
  replayLocked,
  t,
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div className="md:col-span-1 flex flex-col gap-4">
        {cameraState === 'previewing' ? (
          <div className="group relative overflow-hidden flex items-center justify-between gap-3 bg-white/80 backdrop-blur-sm p-4 rounded-3xl border border-green-200/60 shadow-sm transition-all duration-300 min-h-[88px]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-sm shrink-0 border border-green-200 bg-black/5">
                <video ref={mainVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="font-semibold text-[#5C4D42] text-sm">{t.camOn}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); if (!replayLocked) { onOpenCameraModal(); } }}
                disabled={replayLocked}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-[#6B9080] bg-[#E8F3EE] hover:bg-[#dceee6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {t.cameraAdjust}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (!replayLocked) { onCloseCameraPreview(); } }}
                disabled={replayLocked}
                className="flex items-center justify-center w-8 h-8 rounded-full text-[#D97757] hover:bg-red-50 hover:text-red-500 transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                title={t.cancel}
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); if (!replayLocked) { onOpenCameraModal(); } }}
            disabled={replayLocked}
            className="group relative overflow-hidden flex items-center gap-4 bg-white/80 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm hover:shadow-md hover:bg-[#FFFBF5] transition-all duration-300 hover:-translate-y-1 min-h-[88px] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="bg-[#E8F3EE] p-3 rounded-2xl text-[#6B9080] group-hover:scale-110 transition-transform duration-300">
              <Video size={26} strokeWidth={2} />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-semibold text-[#5C4D42]">{t.camTest}</span>
              <span className="text-xs text-[#8C7A6B] mt-0.5">{t.camOpt}</span>
            </div>
          </button>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); if (!replayLocked) { onOpenMicModal(); } }}
          disabled={replayLocked}
          className="group relative overflow-hidden flex items-center gap-4 bg-white/80 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm hover:shadow-md hover:bg-[#FFFBF5] transition-all duration-300 hover:-translate-y-1 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="p-3 rounded-2xl transition-transform duration-300 bg-[#FFF0E5] text-[#D97757] group-hover:scale-110">
            <Mic size={26} strokeWidth={2} />
          </div>
          <div className="flex flex-col text-left">
            <span className="font-semibold text-[#5C4D42]">{t.micTest}</span>
            <span className="text-xs text-[#8C7A6B] mt-0.5">{t.micOpt}</span>
          </div>
        </button>
      </div>

      <div className="md:col-span-3">
        <div className="bg-gradient-to-br from-[#FFFBF5] to-[#FFF5EB] p-6 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col justify-center relative overflow-hidden min-h-[220px]">
          <Heart className="absolute -right-4 -bottom-4 text-orange-100 opacity-50" size={120} />
          <div className="relative z-10">
            <h3 className="text-sm font-medium text-[#8C7A6B] flex items-center gap-2 mb-3">
              <Sparkles size={16} /> {t.emoTitle}
            </h3>
            <div className="flex items-end gap-4 flex-wrap">
              <span className="text-4xl font-bold text-[#D97757] tracking-wider">{displayedEmotionLabel}</span>
              <span className="text-sm text-[#8C7A6B] mb-1 bg-white/60 px-3 py-1 rounded-full">
                {displayedEmotionDetail}
              </span>
            </div>
            <p className="mt-4 text-[#5C4D42] text-sm leading-relaxed italic">
              {displayedEmotionQuote}
            </p>
            {affectSnapshot.fusion.conflict ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-3 py-2 border border-red-100 text-sm text-[#5C4D42]">
                {affectSnapshot.fusion.conflictReason || t.emotionConflictFallback}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
