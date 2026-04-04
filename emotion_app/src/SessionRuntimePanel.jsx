import React, { useMemo } from 'react';
import { avatarProfiles } from './appContent';
import { X, Video, Mic } from 'lucide-react';

export default function SessionRuntimePanel({
  children,
  clearSession,
  createSession,
  effectiveAvatarProfile,
  exportSession,
  handleAvatarSelection,
  hasReplayCache,
  interactionLocked,
  replayState,
  restoreSession,
  selectedAvatarId,
  selectedAvatarProfile,
  sessionErrorMessage,
  sessionRequestState,
  sessionStatusMessage,
  sessionSummary,
  startReplayFromExport,
  storedSessionId,
  storedSessionNotice,
  t,
  textSubmitState,

  cameraState = 'idle',
  runtimeVideoRef,
  onOpenCameraModal = () => {},
  onCloseCameraPreview = () => {},
  onOpenMicModal = () => {},
  replayLocked = false,
}) {
  const hasActiveSession = Boolean(sessionSummary?.session_id);
  const showsSeparateError = sessionErrorMessage && sessionErrorMessage !== sessionStatusMessage;
  const hasSupplementaryPanel = React.Children.count(children) > 0;
  const hasPendingAvatarSwitch = hasActiveSession
    && selectedAvatarId !== effectiveAvatarProfile?.avatarId;
  const localizedAvatarProfiles = useMemo(() => Object.values(avatarProfiles).map((profile) => ({
    ...profile,
    label: profile.profileId === 'coach' ? t.avatarCoachLabel : t.avatarCompanionLabel,
  })), [t.avatarCoachLabel, t.avatarCompanionLabel]);

  return (
    <section className="bg-white/85 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#5C4D42]">{t.sessionIntroTitle}</h2>
          <p className="text-sm text-[#8C7A6B] mt-2 leading-relaxed">{t.sessionIntroBody}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-[#F0E5D8] bg-[#FDFBF7] p-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={createSession}
            disabled={interactionLocked || textSubmitState !== 'idle'}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-[#D97757] text-white shadow-md hover:bg-[#c26649] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sessionRequestState === 'creating' ? t.sessionCreating : t.createSession}
          </button>
          <button
            type="button"
            onClick={() => restoreSession(storedSessionId)}
            disabled={!storedSessionId || interactionLocked || textSubmitState !== 'idle'}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-[#FFF0E5] text-[#D97757] border border-[#F0E5D8] hover:bg-[#FFE5D0] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sessionRequestState === 'restoring' ? t.restoring : t.restoreState}
          </button>
          <button
            type="button"
            onClick={clearSession}
            disabled={replayState === 'running' || (!storedSessionId && !sessionSummary)}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-white text-[#8C7A6B] border border-[#F0E5D8] hover:bg-[#F8F2EA] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t.clearSession}
          </button>
          <button
            type="button"
            onClick={exportSession}
            disabled={!sessionSummary?.session_id || replayState === 'running'}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-white text-[#8C7A6B] border border-[#F0E5D8] hover:bg-[#F8F2EA] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t.exportRecord}
          </button>
          <button
            type="button"
            onClick={startReplayFromExport}
            disabled={!hasReplayCache || replayState === 'running'}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-white text-[#8C7A6B] border border-[#F0E5D8] hover:bg-[#F8F2EA] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t.replayRecord}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4 w-full">
            <div className="text-xs text-[#A6998E] mb-2">{t.avatarSelection}</div>
            <div className="flex flex-wrap gap-2">
              {localizedAvatarProfiles.map((profile) => {
                const isActive = selectedAvatarId === profile.avatarId;
                return (
                  <button
                    key={profile.avatarId}
                    type="button"
                    onClick={() => handleAvatarSelection(profile.avatarId)}
                    disabled={interactionLocked}
                    className={`px-3 py-2 rounded-xl text-sm border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${isActive ? 'bg-[#FFF0E5] text-[#D97757] border-[#F3C7B5]' : 'bg-white text-[#8C7A6B] border-[#F0E5D8] hover:bg-[#FFF8F2]'}`}
                  >
                    {profile.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-[#8C7A6B]">
              {hasPendingAvatarSwitch ? (
                <>
                  <div>{`${t.activeAvatarPrefix}${effectiveAvatarProfile?.label}`}</div>
                  <div>{`${t.nextAvatarPrefix}${selectedAvatarProfile?.label}`}</div>
                </>
              ) : (
                hasActiveSession
                  ? `${t.activeAvatarPrefix}${effectiveAvatarProfile?.label}`
                  : `${t.nextAvatarPrefix}${selectedAvatarProfile?.label}`
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#F0E5D8] bg-[#FFF9F3] px-4 py-3 text-sm text-[#8C7A6B] w-full">
            <div>{storedSessionNotice}</div>
            <div className={`mt-1 ${sessionErrorMessage ? 'text-red-500' : 'text-[#5C4D42]'}`}>{sessionStatusMessage || t.sessionIdle}</div>
            {hasActiveSession ? (
              <div className="mt-1 text-xs">{t.sessionInteractionHint}</div>
            ) : null}
            {showsSeparateError ? (
              <div className="mt-2 text-red-500">{sessionErrorMessage}</div>
            ) : null}
          </div>
        </div>

        <div className={hasSupplementaryPanel ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
          <div className={hasSupplementaryPanel ? 'grid gap-4 lg:h-full lg:grid-rows-2' : 'flex flex-col gap-4'}>
            {cameraState === 'previewing' ? (
              <div className="group relative overflow-hidden flex items-center justify-between gap-3 bg-white/80 backdrop-blur-sm p-4 rounded-3xl border border-green-200/60 shadow-sm transition-all duration-300 min-h-[88px] w-full lg:h-full">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-sm shrink-0 border border-green-200 bg-black/5">
                    {runtimeVideoRef ? (
                      <video ref={runtimeVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">视频</div>
                    )}
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
                className="group relative overflow-hidden flex items-center gap-4 bg-white/80 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm hover:shadow-md hover:bg-[#FFFBF5] transition-all duration-300 hover:-translate-y-1 min-h-[88px] w-full lg:h-full disabled:opacity-60 disabled:cursor-not-allowed"
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
            className="group relative overflow-hidden flex items-center gap-4 bg-white/80 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm hover:shadow-md hover:bg-[#FFFBF5] transition-all duration-300 hover:-translate-y-1 w-full lg:h-full disabled:opacity-60 disabled:cursor-not-allowed"
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

          {hasSupplementaryPanel ? (
            <div className="w-full lg:h-full">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
