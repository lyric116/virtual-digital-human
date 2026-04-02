import React, { useMemo } from 'react';
import { MessageCircleHeart, Mic, Send, User } from 'lucide-react';
import { formatDurationMs, resolveAvatarExpressionPreset } from './appHelpers';
import Live2DAvatar from './Live2DAvatar';

function AvatarFallbackMouth({ avatarMouthState }) {
  if (avatarMouthState === 'wide') {
    return <ellipse cx="100" cy="101" rx="10" ry="6" fill="#B38A78" />;
  }
  if (avatarMouthState === 'round') {
    return <ellipse cx="100" cy="101" rx="6" ry="7" fill="#B38A78" />;
  }
  if (avatarMouthState === 'small') {
    return <ellipse cx="100" cy="101" rx="7" ry="4" fill="#B38A78" />;
  }
  return <path d="M92 100Q100 102 108 100" stroke="#B38A78" strokeWidth="2" strokeLinecap="round" />;
}

function AssistantAvatarFallback({
  avatarMouthState,
  avatarSpeechState,
  profileId,
}) {
  if (profileId === 'coach') {
    return (
      <svg
        width="200"
        height="240"
        viewBox="0 0 200 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        data-testid="assistant-avatar-fallback"
        data-avatar-fallback-profile="coach"
      >
        <path d="M32 240C32 168 58 126 100 126C142 126 168 168 168 240H32Z" fill={avatarSpeechState === 'speaking' ? '#E4EEF8' : '#EDF2F7'} />
        <path d="M46 240C46 182 66 145 100 145C134 145 154 182 154 240H46Z" fill="#5D748C" fillOpacity={avatarSpeechState === 'speaking' ? '0.2' : '0.12'} />
        <rect x="85" y="105" width="30" height="40" rx="10" fill="#F2D6C2"/>
        <rect x="65" y="36" width="70" height="85" rx="34" fill="#F2D6C2"/>
        <path d="M60 66C60 34 78 20 100 20C122 20 140 34 140 66C140 84 136 96 128 102C124 82 114 68 100 68C86 68 76 82 72 102C64 96 60 84 60 66Z" fill="#3E4955"/>
        <path d="M74 56C82 42 90 36 100 36C110 36 118 42 126 56" stroke="#3E4955" strokeWidth="10" strokeLinecap="round"/>
        <path d="M79 81Q85 79 91 81" stroke="#2F3842" strokeWidth="2" strokeLinecap="round"/>
        <path d="M109 81Q115 79 121 81" stroke="#2F3842" strokeWidth="2" strokeLinecap="round"/>
        <path d="M84 93Q92 88 96 93" stroke="#2F3842" strokeWidth="2" strokeLinecap="round"/>
        <path d="M104 93Q108 88 116 93" stroke="#2F3842" strokeWidth="2" strokeLinecap="round"/>
        <AvatarFallbackMouth avatarMouthState={avatarMouthState} />
      </svg>
    );
  }

  return (
    <svg
      width="200"
      height="240"
      viewBox="0 0 200 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-testid="assistant-avatar-fallback"
      data-avatar-fallback-profile="companion"
    >
      <path d="M30 240C30 170 55 130 100 130C145 130 170 170 170 240H30Z" fill={avatarSpeechState === 'speaking' ? '#DFF4EE' : '#E8F3EE'}/>
      <path d="M45 240C45 180 65 145 100 145C135 145 155 180 155 240H45Z" fill="#6B9080" fillOpacity={avatarSpeechState === 'speaking' ? '0.18' : '0.1'}/>
      <rect x="85" y="105" width="30" height="40" rx="10" fill="#FCE5D0"/>
      <rect x="65" y="35" width="70" height="85" rx="35" fill="#FCE5D0"/>
      <path d="M60 65C60 30 75 20 100 20C125 20 140 30 140 65C140 85 135 95 130 100C125 80 115 65 100 65C85 65 75 80 70 100C65 95 60 85 60 65Z" fill="#5C4D42"/>
      <path d="M80 80Q85 82 90 80" stroke="#4A3D34" strokeWidth="2" strokeLinecap="round"/>
      <path d="M110 80Q115 82 120 80" stroke="#4A3D34" strokeWidth="2" strokeLinecap="round"/>
      <AvatarFallbackMouth avatarMouthState={avatarMouthState} />
    </svg>
  );
}

export default function AvatarComposerPanel({
  activeMessage,
  assistantAudioRef,
  avatarProfile,
  avatarMouthState,
  avatarSpeechState,
  canSubmitText,
  handleMicAction,
  inputText,
  latestAssistantMessage,
  liveTranscriptText,
  onInputChange,
  recordingDurationMs,
  recordingState,
  replayLocked,
  submitText,
  t,
  textSubmitState,
}) {
  const avatarExpressionPreset = resolveAvatarExpressionPreset({
    stage: latestAssistantMessage?.metadata?.stage,
    riskLevel: latestAssistantMessage?.metadata?.risk_level,
    emotion: latestAssistantMessage?.metadata?.emotion,
  });

  const shouldRenderAssistantLive2D = avatarProfile?.renderKind === 'live2d'
    && avatarProfile?.live2dModelPath;
  const assistantLive2DFitOptions = useMemo(() => (
    avatarProfile?.live2dFitOptions || {
      logicalHeight: 4.52,
      centerX: 1.16,
      centerY: 0.28,
      offsetX: 0,
      offsetY: 0,
    }
  ), [avatarProfile]);

  const assistantAvatarFallback = (
    <AssistantAvatarFallback
      avatarMouthState={avatarMouthState}
      avatarSpeechState={avatarSpeechState}
      profileId={avatarProfile?.profileId}
    />
  );

  return (
    <>
      <audio ref={assistantAudioRef} hidden preload="auto" />

      <div className="relative w-full h-[400px] md:h-[480px] bg-gradient-to-b from-[#FFFDF9] to-[#FCEFDA] rounded-[2.5rem] border-4 border-white shadow-lg overflow-hidden flex items-end justify-center">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute top-10 left-1/4 w-32 h-64 bg-white/40 blur-3xl transform rotate-12"></div>
          <div className="absolute top-20 right-1/3 w-48 h-48 bg-orange-100/30 rounded-full blur-3xl"></div>
        </div>

        <div className="absolute left-4 md:left-20 bottom-0 flex flex-col items-center animate-breathe">
          <div className={`absolute -top-24 md:-top-28 left-10 md:left-24 bg-white/95 backdrop-blur-md p-4 rounded-2xl rounded-bl-none shadow-sm border border-orange-50 max-w-[200px] md:max-w-[260px] transition-opacity duration-700 ${activeMessage === 0 ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-sm md:text-base text-[#5C4D42] leading-relaxed">
              {liveTranscriptText || t.bubble1}
            </p>
          </div>
          <svg width="200" height="240" viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M40 240C40 180 60 140 100 140C140 140 160 180 160 240H40Z" fill="#FDECDA"/>
            <path d="M50 240C50 190 70 155 100 155C130 155 150 190 150 240H50Z" fill="#F8B89C" fillOpacity="0.2"/>
            <rect x="85" y="110" width="30" height="40" rx="10" fill="#FFE0C8"/>
            <rect x="65" y="40" width="70" height="85" rx="35" fill="#FFE0C8"/>
            <path d="M60 70C60 40 75 25 100 25C125 25 140 40 140 70C140 100 145 120 150 130C125 120 115 90 115 90C115 90 105 110 85 110C65 110 50 130 50 130C55 120 60 100 60 70Z" fill="#A87C64"/>
            <path d="M80 85Q85 88 90 85" stroke="#78503C" strokeWidth="2" strokeLinecap="round"/>
            <path d="M110 85Q115 88 120 85" stroke="#78503C" strokeWidth="2" strokeLinecap="round"/>
            <path d="M95 105Q100 110 105 105" stroke="#D97757" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="75" cy="95" r="4" fill="#FFB6A3" opacity="0.6"/>
            <circle cx="125" cy="95" r="4" fill="#FFB6A3" opacity="0.6"/>
          </svg>
        </div>

        <div className="absolute right-0 md:right-10 bottom-0 animate-breathe-delayed" data-testid="assistant-avatar-surface">
          <div className="absolute left-20 md:left-[98px] top-[84px] md:top-[132px] z-10 rounded-2xl bg-white/80 border border-[#F0E5D8] px-4 py-3 text-center shadow-sm min-w-[160px]">
            <div className="text-sm font-semibold text-[#5C4D42]">{avatarProfile.label}</div>
            <div className="mt-1 text-xs text-[#8C7A6B]">{avatarProfile.stageNote}</div>
          </div>
          <div className={`absolute -left-2 md:-left-[148px] top-[132px] md:top-[166px] z-10 bg-white/95 backdrop-blur-md p-4 rounded-2xl rounded-br-none shadow-sm border border-teal-50 max-w-[220px] md:max-w-[236px] transition-opacity duration-700 ${activeMessage === 1 ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-sm md:text-base text-[#5C4D42] leading-relaxed">
              {latestAssistantMessage?.content_text || t.bubble2}
            </p>
            <div className="mt-2 text-[11px] text-[#8C7A6B]">
              {avatarProfile.label}
            </div>
          </div>
          {shouldRenderAssistantLive2D ? (
            <Live2DAvatar
              key={avatarProfile.avatarId}
              className="w-[330px] h-[370px] md:w-[380px] md:h-[500px]"
              corePath={avatarProfile.live2dCorePath}
              expressionPreset={avatarExpressionPreset}
              fallback={assistantAvatarFallback}
              fitOptions={assistantLive2DFitOptions}
              idleMotion={avatarProfile.live2dIdleMotion}
              modelPath={avatarProfile.live2dModelPath}
              mouthState={avatarMouthState}
              speechState={avatarSpeechState}
            />
          ) : (
            assistantAvatarFallback
          )}
        </div>
      </div>

      <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col md:flex-row items-center gap-6 relative">
        <div className="flex flex-col items-center justify-center min-w-[140px] gap-2">
          <div className="relative flex items-center justify-center w-12 h-12 bg-[#FFF5EB] rounded-full text-[#D97757]">
            <MessageCircleHeart size={24} />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D97757] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#D97757]"></span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-[#D97757] text-center">
            {replayLocked ? t.replayViewing : recordingState === 'recording' ? `${t.recording} ${formatDurationMs(recordingDurationMs)}` : textSubmitState === 'sending' ? t.sending : t.readyToChat}
          </div>
        </div>

        <div className="w-[1px] h-16 bg-[#F0E5D8] hidden md:block"></div>

        <div className="flex-1 w-full bg-[#FDFBF7] rounded-2xl p-4 border border-[#F0E5D8]/50 relative flex flex-col transition-all duration-300 focus-within:border-[#D97757]/40 focus-within:shadow-sm focus-within:bg-white">
          <div className="absolute -top-3 left-4 bg-[#E8F3EE] text-[#6B9080] px-2 py-0.5 rounded-md text-xs flex items-center gap-1 border border-white z-10 shadow-sm">
            <User size={12} /> {t.inputTag}
          </div>

          <textarea
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={t.inputPlaceholder}
            disabled={replayLocked}
            className="w-full bg-transparent resize-none outline-none text-[#5C4D42] text-base leading-relaxed mt-2 min-h-[50px] custom-scrollbar placeholder:text-[#A6998E]/60 disabled:opacity-60 disabled:cursor-not-allowed"
          />

          <div className="flex justify-end items-center gap-2 mt-2 pt-2 border-t border-[#F0E5D8]/40">
            <span className="text-xs text-[#D97757] mr-auto flex items-center gap-1">
              {recordingState === 'recording' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>}
              {recordingState === 'recording' ? `${t.recording} ${formatDurationMs(recordingDurationMs)}` : t.sessionInteractionHint}
            </span>

            <button
              onClick={() => { if (!replayLocked) { void handleMicAction(); } }}
              disabled={replayLocked}
              className={`p-2.5 rounded-full transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed ${recordingState === 'recording' ? 'bg-red-50 text-red-500 shadow-inner' : 'text-[#8C7A6B] hover:bg-[#FFF0E5] hover:text-[#D97757] hover:scale-105'}`}
              title={recordingState === 'recording' ? t.stopRecording : t.startRecording}
            >
              <Mic size={18} strokeWidth={recordingState === 'recording' ? 2.5 : 2} className={recordingState === 'recording' ? 'animate-pulse' : ''} />
            </button>

            <button
              onClick={submitText}
              className={`p-2.5 rounded-full transition-all duration-300 flex items-center justify-center ${canSubmitText ? 'bg-[#D97757] text-white shadow-md hover:bg-[#c26649] hover:-translate-y-0.5' : 'bg-[#F0E5D8] text-[#A6998E] cursor-not-allowed opacity-60'}`}
              disabled={!canSubmitText}
              title={textSubmitState === 'sending' ? t.sending : t.submitText}
            >
              <Send size={16} strokeWidth={2.5} className={inputText.trim() ? 'translate-x-0.5 -translate-y-0.5' : ''} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
