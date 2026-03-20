import React from 'react';

export default function AssistantRepliesPanel({
  formatRoleLabel,
  sessionMessages,
  t,
}) {
  return (
    <div className="rounded-3xl border border-[#F0E5D8] bg-[#FDFBF7] p-4 flex flex-col gap-3 min-h-[280px]">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium text-[#8C7A6B]">{t.assistantReplies}</h3>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
        {sessionMessages.length ? sessionMessages.map((message) => (
          <div key={message.message_id} className="rounded-2xl border border-[#F0E5D8] bg-white px-4 py-3">
            <div className="text-xs text-[#A6998E] mb-2">{formatRoleLabel(message.role)}</div>
            <p className="text-sm text-[#5C4D42] leading-relaxed whitespace-pre-wrap">{message.content_text}</p>
          </div>
        )) : (
          <div className="h-full min-h-[180px] rounded-2xl border border-dashed border-[#E5D8C8] bg-white/60 flex items-center justify-center text-sm text-[#A6998E] text-center px-6">
            {t.assistantEmpty}
          </div>
        )}
      </div>
    </div>
  );
}
