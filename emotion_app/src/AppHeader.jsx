import React from 'react';
import { Clock, Globe, Sparkles, User } from 'lucide-react';

const languageOptions = [
  { code: 'zh', name: '汉语 (Mandarin)' },
  { code: 'en', name: '英语 (English)' },
  { code: 'de', name: '德语 (German)' },
  { code: 'fr', name: '法语 (French)' },
];

export default function AppHeader({
  isLangMenuOpen,
  isLoggedIn,
  isTimelineOpen,
  isUserAvatarMenuOpen,
  lang,
  onAuthOpen,
  onHomeOpen,
  onSelectLang,
  onSelectUserAvatar,
  onTimelineOpen,
  onToggleLangMenu,
  onToggleUserAvatarMenu,
  selectedUserAvatarId,
  t,
}) {
  const userAvatarOptions = [
    { id: 'female', label: t.userAvatarFemaleLabel },
    { id: 'male', label: t.userAvatarMaleLabel },
  ];
  return (
    <header className="relative z-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-4 border-b border-[#F0E5D8]">
      <div className="flex flex-col">
        <h1 className="text-4xl md:text-5xl font-bold tracking-wider text-[#D97757] flex items-center gap-3">
          {t.title}
          <Sparkles className="text-amber-400" size={28} />
        </h1>
        <p className="mt-3 text-[#8C7A6B] text-sm md:text-base tracking-wide flex items-center">
          {t.subtitle}
        </p>
      </div>

      <nav className="flex items-center gap-2 md:gap-6 bg-white/60 p-2 md:p-3 rounded-2xl backdrop-blur-sm border border-[#F0E5D8]/50 shadow-sm">
        {[
          { id: 'auth', icon: HomeIcon, label: isLoggedIn ? t.navAuthHome : t.navAuthIn },
          { id: 'timeline', icon: Clock, label: t.navTimeline },
          { id: 'lang', icon: Globe, label: t.navLang },
          { id: 'profile', icon: User, label: t.navProfile },
        ].map((item) => (
          <div key={item.id} className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (item.id === 'lang') {
                  onToggleLangMenu();
                } else if (item.id === 'profile') {
                  onToggleUserAvatarMenu();
                } else if (item.id === 'auth') {
                  if (isLoggedIn) {
                    onHomeOpen();
                  } else {
                    onAuthOpen();
                  }
                } else if (item.id === 'timeline') {
                  onTimelineOpen();
                }
              }}
              className={`flex flex-col items-center justify-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-300 hover:-translate-y-0.5 ${
                (item.id === 'auth' && isLoggedIn && !isTimelineOpen) || (item.id === 'timeline' && isTimelineOpen)
                  ? 'text-[#D97757] bg-[#FFF5EB]'
                  : 'text-[#8C7A6B] hover:text-[#D97757] hover:bg-[#FFF5EB]'
              }`}
            >
              <item.icon size={20} strokeWidth={1.5} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>

            {item.id === 'lang' && isLangMenuOpen && (
              <div className="absolute top-full mt-3 right-0 md:left-1/2 md:-translate-x-1/2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-[#F0E5D8] py-2 w-44 flex flex-col z-50 overflow-hidden">
                {languageOptions.map((option) => (
                  <button
                    key={option.code}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLang(option.code);
                    }}
                    className={`px-4 py-3 text-sm text-left hover:bg-[#FFF5EB] hover:text-[#D97757] transition-colors ${
                      lang === option.code ? 'text-[#D97757] bg-[#FFF5EB]/50 font-medium' : 'text-[#8C7A6B]'
                    }`}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            )}

            {item.id === 'profile' && isUserAvatarMenuOpen && (
              <div className="absolute top-full mt-3 right-0 md:left-1/2 md:-translate-x-1/2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-[#F0E5D8] py-2 w-44 flex flex-col z-50 overflow-hidden">
                {userAvatarOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectUserAvatar(option.id);
                    }}
                    className={`px-4 py-3 text-sm text-left hover:bg-[#FFF5EB] hover:text-[#D97757] transition-colors ${
                      selectedUserAvatarId === option.id ? 'text-[#D97757] bg-[#FFF5EB]/50 font-medium' : 'text-[#8C7A6B]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </header>
  );
}

function HomeIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
