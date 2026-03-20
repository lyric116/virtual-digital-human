import React from 'react';
import { X } from 'lucide-react';

export default function AuthModal({
  authMode,
  isOpen,
  onClose,
  onSubmit,
  onSwitchMode,
  t,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={(e) => e.stopPropagation()}>
      <div className="bg-[#FDFBF7] rounded-3xl p-8 w-[90%] max-w-sm shadow-xl flex flex-col gap-6 border border-[#F0E5D8] transform transition-all scale-100 relative">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-[#8C7A6B] hover:text-[#D97757] transition-colors p-1.5 rounded-full hover:bg-[#FFF5EB]"
        >
          <X size={20} />
        </button>

        <div className="text-center mt-2">
          <h3 className="text-2xl font-bold text-[#D97757] tracking-wider mb-2">
            {authMode === 'login' ? t.authLoginTitle : t.authRegTitle}
          </h3>
          <p className="text-[#8C7A6B] text-sm">
            {authMode === 'login' ? t.authLoginSub : t.authRegSub}
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input
            required
            type="text"
            placeholder={t.username}
            className="w-full bg-white border border-[#F0E5D8] text-[#5C4D42] rounded-xl px-4 py-3 outline-none focus:border-[#D97757]/50 focus:ring-2 focus:ring-[#D97757]/10 transition-all placeholder:text-[#A6998E]"
          />

          {authMode === 'register' && (
            <input
              required
              type="tel"
              placeholder={t.phone}
              className="w-full bg-white border border-[#F0E5D8] text-[#5C4D42] rounded-xl px-4 py-3 outline-none focus:border-[#D97757]/50 focus:ring-2 focus:ring-[#D97757]/10 transition-all placeholder:text-[#A6998E]"
            />
          )}

          <input
            required
            type="password"
            placeholder={t.password}
            className="w-full bg-white border border-[#F0E5D8] text-[#5C4D42] rounded-xl px-4 py-3 outline-none focus:border-[#D97757]/50 focus:ring-2 focus:ring-[#D97757]/10 transition-all placeholder:text-[#A6998E]"
          />

          {authMode === 'register' && (
            <div className="flex gap-2">
              <input
                required
                type="text"
                placeholder={t.code}
                className="flex-1 bg-white border border-[#F0E5D8] text-[#5C4D42] rounded-xl px-4 py-3 outline-none focus:border-[#D97757]/50 focus:ring-2 focus:ring-[#D97757]/10 transition-all placeholder:text-[#A6998E]"
              />
              <button
                type="button"
                className="whitespace-nowrap px-4 bg-[#FFF0E5] text-[#D97757] text-sm font-medium rounded-xl hover:bg-[#FFE5D0] transition-colors"
              >
                {t.getCode}
              </button>
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-2 bg-[#D97757] text-white py-3.5 rounded-xl font-medium shadow-md hover:bg-[#c26649] hover:-translate-y-0.5 transition-all duration-300"
          >
            {authMode === 'login' ? t.loginBtn : t.regBtn}
          </button>
        </form>

        <div className="text-center mb-2">
          {authMode === 'login' ? (
            <button
              type="button"
              onClick={() => onSwitchMode('register')}
              className="text-[#8C7A6B] text-sm hover:text-[#D97757] transition-colors inline-flex items-center gap-1"
            >
              {t.noAcc}<span className="underline decoration-[#F0E5D8] underline-offset-4">{t.goReg}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSwitchMode('login')}
              className="text-[#8C7A6B] text-sm hover:text-[#D97757] transition-colors inline-flex items-center gap-1"
            >
              {t.hasAcc}<span className="underline decoration-[#F0E5D8] underline-offset-4">{t.goLogin}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
