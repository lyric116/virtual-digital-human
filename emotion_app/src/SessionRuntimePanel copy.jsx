import React from 'react';
import { avatarProfiles } from './appContent';

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
}) {
  const hasActiveSession = Boolean(sessionSummary?.session_id);
  const showsSeparateError = sessionErrorMessage && sessionErrorMessage !== sessionStatusMessage;

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

        <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4 w-[500px]">
          <div className="text-xs text-[#A6998E] mb-2">{t.avatarSelection}</div>
          <div className="flex flex-wrap gap-2">
            {Object.values(avatarProfiles).map((profile) => {
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
            {hasActiveSession
              ? `${t.activeAvatarPrefix}${effectiveAvatarProfile.label}`
              : `${t.nextAvatarPrefix}${selectedAvatarProfile.label}`}
          </div>
        </div>

        <div className="rounded-2xl border border-[#F0E5D8] bg-[#FFF9F3] px-4 py-3 text-sm text-[#8C7A6B] w-[500px]">
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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        {children}
      </div>
    </section>
  );
}
