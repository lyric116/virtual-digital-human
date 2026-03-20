import React from 'react';
import { Mic, X } from 'lucide-react';

export default function MicModal({
  isOpen,
  isTesting,
  liveTranscriptText,
  onClose,
  onToggleRecording,
  recordingState,
  replayLocked,
  t,
}) {
  if (!isOpen) {
    return null;
  }

  const helperText = recordingState === 'recording'
    ? (isTesting ? t.micTestingActive : t.micRec)
    : (isTesting ? t.micTestingReady : t.micSpeak);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={(e) => e.stopPropagation()}>
      <div className="bg-[#FDFBF7] rounded-3xl p-6 w-[90%] max-w-sm shadow-xl flex flex-col gap-4 border border-[#F0E5D8] transform transition-all scale-100">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-[#5C4D42] flex items-center gap-2">
            <Mic size={20} className="text-[#D97757]" />
            {t.micModalTitle}
          </h3>
          <button
            onClick={onClose}
            className="text-[#8C7A6B] hover:text-[#D97757] transition-colors p-1 rounded-full hover:bg-[#FFF5EB]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="w-full min-h-40 bg-white rounded-2xl border-2 border-[#F0E5D8] overflow-hidden relative flex flex-col justify-center shadow-inner p-4 gap-3">
          <div className="text-xs text-[#A6998E]">{t.micRes}</div>
          <div className="text-sm text-[#5C4D42] leading-relaxed whitespace-pre-wrap">
            {liveTranscriptText || helperText}
          </div>
        </div>

        <p className="text-sm text-[#8C7A6B] leading-relaxed">
          {recordingState === 'recording'
            ? (isTesting ? t.micTestStopHint : t.micStopHint)
            : (isTesting ? t.micTestStartHint : t.micStartHint)}
        </p>

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onToggleRecording}
            disabled={replayLocked}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed ${recordingState === 'recording' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-[#FFF0E5] text-[#D97757] hover:bg-[#FFE5D0]'}`}
          >
            {recordingState === 'recording'
              ? (isTesting ? t.stopMicTest : t.stopRecording)
              : (isTesting ? t.startMicTest : t.startRecording)}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all bg-[#D97757] text-white shadow-md hover:bg-[#c26649]"
          >
            {recordingState === 'recording' ? t.cancel : t.micClose}
          </button>
        </div>
      </div>
    </div>
  );
}
