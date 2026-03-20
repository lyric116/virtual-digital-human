import React from 'react';

export default function RuntimeConfigPanel({ runtimeConfig }) {
  return (
    <section className="hidden bg-white/85 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm flex-col gap-4" aria-hidden="true">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#A6998E]">Phase A bootstrap</p>
          <h2 className="text-lg font-semibold text-[#5C4D42] mt-1">Runtime config compatibility baseline</h2>
          <p className="text-sm text-[#8C7A6B] mt-2 leading-relaxed">
            当前 React 前端已能兼容读取 <code>window.__APP_CONFIG__</code>，并保留与旧前端一致的
            API / WS / TTS / affect 运行时地址模型。此步骤只建立启动与配置基线，不接入会话、
            WebSocket 或真实业务请求。
          </p>
        </div>
        <div className="self-start text-xs text-[#6B9080] bg-[#E8F3EE] border border-green-100 rounded-full px-3 py-1.5">
          Config source: {runtimeConfig.sourceLabel}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
        <div className="rounded-2xl border border-[#F0E5D8] bg-[#FDFBF7] p-4">
          <div className="text-xs text-[#A6998E] mb-1">API base</div>
          <div className="break-all text-[#5C4D42] font-medium">{runtimeConfig.apiBaseUrl}</div>
        </div>
        <div className="rounded-2xl border border-[#F0E5D8] bg-[#FDFBF7] p-4">
          <div className="text-xs text-[#A6998E] mb-1">WS URL</div>
          <div className="break-all text-[#5C4D42] font-medium">{runtimeConfig.wsUrl}</div>
        </div>
        <div className="rounded-2xl border border-[#F0E5D8] bg-[#FDFBF7] p-4">
          <div className="text-xs text-[#A6998E] mb-1">TTS base</div>
          <div className="break-all text-[#5C4D42] font-medium">{runtimeConfig.ttsBaseUrl}</div>
        </div>
        <div className="rounded-2xl border border-[#F0E5D8] bg-[#FDFBF7] p-4">
          <div className="text-xs text-[#A6998E] mb-1">Affect base</div>
          <div className="break-all text-[#5C4D42] font-medium">{runtimeConfig.affectBaseUrl}</div>
        </div>
        <div className="rounded-2xl border border-[#F0E5D8] bg-[#FDFBF7] p-4">
          <div className="text-xs text-[#A6998E] mb-1">Default avatar</div>
          <div className="break-all text-[#5C4D42] font-medium">{runtimeConfig.defaultAvatarId}</div>
        </div>
        <div className="rounded-2xl border border-[#F0E5D8] bg-[#FDFBF7] p-4">
          <div className="text-xs text-[#A6998E] mb-1">Active session storage key</div>
          <div className="break-all text-[#5C4D42] font-medium">{runtimeConfig.activeSessionStorageKey}</div>
        </div>
      </div>
    </section>
  );
}
