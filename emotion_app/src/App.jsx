import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, Mic, Heart, Clock, Globe, User, 
  Sun, Wind, Leaf, Sparkles, MessageCircleHeart,
  MoreHorizontal, Send, X
} from 'lucide-react';

// 多语言字典
const i18n = {
  zh: {
    title: '和光心苑',
    subtitle: '—— 愿您心有暖阳，步履从容，在平凡岁月里也能温柔常伴',
    navAuthIn: '欢迎入住',
    navAuthHome: '欢迎回家',
    navTimeline: '时光记录',
    navLang: '语言选择',
    navProfile: '我的形象',
    camTest: '摄像头调试',
    camOpt: '画面柔和优化已开启',
    camOn: '摄像头已开启',
    camCap: '画面采集中...',
    micTest: '麦克风调试',
    micOpt: '声音降噪已就绪',
    emoTitle: '当前情绪感知',
    emoState: '放松',
    emoDesc: '呼吸平稳，状态舒适',
    emoQuote: '“感觉到您现在的状态很不错，像午后拂过窗畔的微风一样轻柔。”',
    logTitle: '情绪微光记录',
    log1Emo: '平静', log1Desc: '表达较平稳',
    log2Emo: '怀念', log2Desc: '提到过去时光',
    log3Emo: '放松', log3Desc: '交流后情绪舒缓',
    log4Emo: '安心', log4Desc: '感受到被理解',
    bubble1: '“今天外面阳光很好呢，有什么开心的事想和我分享吗？”',
    bubble2: '“我会一直在这里倾听。不用急，按你自己的节奏慢慢说就好。”',
    statuses: ['正在倾听...', '正在识别...', '识别完成', '正在整理回复...', '温柔回应中'],
    inputTag: '我的心声',
    inputPlaceholder: '在这里轻轻敲下您的心声，或点击右侧麦克风向我诉说...',
    recording: '正在安静倾听您的声音...',
    camModalTitle: '摄像头检测',
    camReq: '正在请求摄像头权限...',
    camSuccess: '开启成功',
    camErr: '无法访问摄像头，请检查权限设置。',
    done: '完成', cancel: '取消',
    micModalTitle: '麦克风检测',
    micSpeak: '请对准麦克风说话...',
    micRec: '正在识别您的声音...',
    micRes: '识别结果',
    micSuccess: '调试成功',
    micRetry: '重新调试',
    micClose: '关闭调试',
    authLoginTitle: '欢迎回来',
    authRegTitle: '开启心之旅',
    authLoginSub: '在这里，您的每一个情绪都会被倾听',
    authRegSub: '注册一个温暖的专属空间',
    username: '用户名',
    phone: '手机号',
    password: '密码',
    code: '验证码',
    getCode: '获取验证码',
    loginBtn: '温柔登录',
    regBtn: '注册并入住',
    noAcc: '若您还未入住，',
    goReg: '请先注册',
    hasAcc: '已有心苑通证？',
    goLogin: '直接入住',
    micTestText: '“今天阳光很好，感觉心里也暖暖的。”'
  },
  en: {
    title: 'Sanctuary of Light',
    subtitle: '—— May your heart hold warm sunlight and gentle peace every day',
    navAuthIn: 'Check In',
    navAuthHome: 'Welcome Home',
    navTimeline: 'Time Log',
    navLang: 'Language',
    navProfile: 'My Avatar',
    camTest: 'Camera Test',
    camOpt: 'Soft filter enabled',
    camOn: 'Camera is ON',
    camCap: 'Capturing...',
    micTest: 'Microphone Test',
    micOpt: 'Noise reduction ready',
    emoTitle: 'Current Emotion',
    emoState: 'Relaxed',
    emoDesc: 'Steady breathing, comfortable',
    emoQuote: '"I feel that you are in a good state, as gentle as the afternoon breeze."',
    logTitle: 'Emotion Log',
    log1Emo: 'Calm', log1Desc: 'Steady expression',
    log2Emo: 'Nostalgic', log2Desc: 'Mentioned the past',
    log3Emo: 'Relaxed', log3Desc: 'Soothed after chat',
    log4Emo: 'Peaceful', log4Desc: 'Felt understood',
    bubble1: '"The sun is beautiful today, anything happy you want to share?"',
    bubble2: '"I will always be here to listen. Take your time, at your own pace."',
    statuses: ['Listening...', 'Recognizing...', 'Recognition Complete', 'Preparing response...', 'Responding gently...'],
    inputTag: 'My Voice',
    inputPlaceholder: 'Type your thoughts here, or click the microphone to speak...',
    recording: 'Listening quietly to your voice...',
    camModalTitle: 'Camera Check',
    camReq: 'Requesting camera access...',
    camSuccess: 'Success',
    camErr: 'Cannot access camera, please check permissions.',
    done: 'Done', cancel: 'Cancel',
    micModalTitle: 'Mic Check',
    micSpeak: 'Please speak into the mic...',
    micRec: 'Recognizing your voice...',
    micRes: 'Result',
    micSuccess: 'Success',
    micRetry: 'Retry',
    micClose: 'Close',
    authLoginTitle: 'Welcome Back',
    authRegTitle: 'Start Journey',
    authLoginSub: 'Here, every emotion is heard',
    authRegSub: 'Register your warm exclusive space',
    username: 'Username',
    phone: 'Phone',
    password: 'Password',
    code: 'Code',
    getCode: 'Get Code',
    loginBtn: 'Gentle Login',
    regBtn: 'Register & Enter',
    noAcc: "If you haven't checked in, ",
    goReg: 'Register first',
    hasAcc: 'Already have an access pass? ',
    goLogin: 'Direct Login',
    micTestText: '"The sun is beautiful today, my heart feels warm."'
  },
  de: {
    title: 'Lichtoase',
    subtitle: '—— Möge dein Herz stets warmes Sonnenlicht und sanften Frieden in sich tragen',
    navAuthIn: 'Einchecken',
    navAuthHome: 'Willkommen zurück',
    navTimeline: 'Zeitprotokoll',
    navLang: 'Sprache',
    navProfile: 'Mein Avatar',
    camTest: 'Kameratest',
    camOpt: 'Weichzeichner aktiv',
    camOn: 'Kamera ist AN',
    camCap: 'Aufnahme...',
    micTest: 'Mikrofontest',
    micOpt: 'Rauschunterdrückung bereit',
    emoTitle: 'Aktuelle Emotion',
    emoState: 'Entspannt',
    emoDesc: 'Ruhige Atmung, angenehm',
    emoQuote: '"Ich spüre, dass du in einem guten Zustand bist, sanft wie die Nachmittagsbrise."',
    logTitle: 'Emotionsprotokoll',
    log1Emo: 'Ruhig', log1Desc: 'Stetiger Ausdruck',
    log2Emo: 'Nostalgisch', log2Desc: 'Vergangenheit erwähnt',
    log3Emo: 'Entspannt', log3Desc: 'Beruhigt nach Chat',
    log4Emo: 'Friedlich', log4Desc: 'Fühlte sich verstanden',
    bubble1: '"Die Sonne ist heute wunderschön. Möchtest du etwas Erfreuliches teilen?"',
    bubble2: '"Ich werde immer hier sein, um zuzuhören. Lass dir Zeit, in deinem Tempo."',
    statuses: ['Höre zu...', 'Erkenne...', 'Erkennung abgeschlossen', 'Bereite Antwort vor...', 'Antworte sanft...'],
    inputTag: 'Meine Stimme',
    inputPlaceholder: 'Tippe deine Gedanken hier, oder klicke auf das Mikrofon...',
    recording: 'Höre deiner Stimme ruhig zu...',
    camModalTitle: 'Kamera-Check',
    camReq: 'Kamerazugriff wird angefordert...',
    camSuccess: 'Erfolgreich',
    camErr: 'Kamerazugriff nicht möglich. Bitte prüfen.',
    done: 'Fertig', cancel: 'Abbrechen',
    micModalTitle: 'Mikrofon-Check',
    micSpeak: 'Bitte ins Mikrofon sprechen...',
    micRec: 'Erkenne deine Stimme...',
    micRes: 'Ergebnis',
    micSuccess: 'Erfolgreich',
    micRetry: 'Wiederholen',
    micClose: 'Schließen',
    authLoginTitle: 'Willkommen zurück',
    authRegTitle: 'Reise beginnen',
    authLoginSub: 'Hier wird jede Emotion gehört',
    authRegSub: 'Registriere deinen warmen Raum',
    username: 'Benutzername',
    phone: 'Telefon',
    password: 'Passwort',
    code: 'Code',
    getCode: 'Code holen',
    loginBtn: 'Sanftes Login',
    regBtn: 'Registrieren & Eintreten',
    noAcc: 'Noch nicht eingecheckt? ',
    goReg: 'Zuerst registrieren',
    hasAcc: 'Schon einen Zugangspass? ',
    goLogin: 'Direktes Login',
    micTestText: '"Die Sonne scheint heute schön, mein Herz fühlt sich warm an."'
  },
  fr: {
    title: 'Sanctuaire de Lumière',
    subtitle: '—— Que votre cœur garde la chaleur du soleil et une douce paix chaque jour',
    navAuthIn: "S'enregistrer",
    navAuthHome: 'Bienvenue',
    navTimeline: 'Journal du temps',
    navLang: 'Langue',
    navProfile: 'Mon Avatar',
    camTest: 'Test Caméra',
    camOpt: 'Filtre doux activé',
    camOn: 'Caméra Activée',
    camCap: 'Capture en cours...',
    micTest: 'Test Micro',
    micOpt: 'Réduction de bruit prête',
    emoTitle: 'Émotion Actuelle',
    emoState: 'Détendu',
    emoDesc: 'Respiration calme, confortable',
    emoQuote: '"Je sens que vous êtes dans un bon état, doux comme la brise de l\'après-midi."',
    logTitle: "Journal d'Émotions",
    log1Emo: 'Calme', log1Desc: 'Expression stable',
    log2Emo: 'Nostalgique', log2Desc: 'A mentionné le passé',
    log3Emo: 'Détendu', log3Desc: 'Apaisé après discussion',
    log4Emo: 'Paisible', log4Desc: "S'est senti compris",
    bubble1: '"Le soleil est magnifique aujourd\'hui, quelque chose de joyeux à partager ?"',
    bubble2: '"Je serai toujours là pour écouter. Prenez votre temps, à votre propre rythme."',
    statuses: ['Écoute en cours...', 'Reconnaissance...', 'Reconnaissance terminée', 'Préparation de la réponse...', 'Réponse douce...'],
    inputTag: 'Ma Voix',
    inputPlaceholder: 'Tapez vos pensées ici, ou cliquez sur le micro pour parler...',
    recording: 'Écoute silencieuse de votre voix...',
    camModalTitle: 'Vérification Caméra',
    camReq: "Demande d'accès...",
    camSuccess: 'Succès',
    camErr: 'Impossible d\'accéder à la caméra.',
    done: 'Terminé', cancel: 'Annuler',
    micModalTitle: 'Vérification Micro',
    micSpeak: 'Veuillez parler dans le micro...',
    micRec: 'Reconnaissance de votre voix...',
    micRes: 'Résultat',
    micSuccess: 'Succès',
    micRetry: 'Réessayer',
    micClose: 'Fermer',
    authLoginTitle: 'Bon retour',
    authRegTitle: 'Commencer le voyage',
    authLoginSub: 'Ici, chaque émotion est écoutée',
    authRegSub: 'Enregistrez votre espace chaleureux',
    username: "Nom d'utilisateur",
    phone: 'Téléphone',
    password: 'Mot de passe',
    code: 'Code',
    getCode: 'Obtenir le code',
    loginBtn: 'Connexion Douce',
    regBtn: "S'inscrire",
    noAcc: "Si vous n'êtes pas enregistré, ",
    goReg: "Inscrivez-vous d'abord",
    hasAcc: 'Déjà un pass ? ',
    goLogin: 'Connexion directe',
    micTestText: '"Le soleil est magnifique aujourd\'hui, mon cœur se sent chaleureux."'
  }
};

export default function App() {
  // 语言状态管理
  const [lang, setLang] = useState('zh');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const t = i18n[lang];

  const [systemStatusIndex, setSystemStatusIndex] = useState(4);
  const [activeMessage, setActiveMessage] = useState(0);
  
  // 输入框与录音状态管理
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  // 摄像头状态管理
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraStatus, setCameraStatus] = useState('idle'); // idle, requesting, success, error
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');
  const modalVideoRef = useRef(null);
  const mainVideoRef = useRef(null);

  // 麦克风测试状态管理
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);
  const [micTestStatus, setMicTestStatus] = useState('idle'); // idle, listening, recognizing, success

  // 用户登录/注册状态管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % 5;
      setSystemStatusIndex(index);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setActiveMessage((prev) => (prev === 0 ? 1 : 0));
    }, 6000);
    return () => clearInterval(msgInterval);
  }, []);

  // 开启摄像头功能
  const startCamera = async () => {
    setCameraStatus('requesting');
    setCameraErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setCameraStream(stream);
      setCameraStatus('success');
    } catch (err) {
      setCameraStatus('error');
      setCameraErrorMsg(t.camErr);
    }
  };

  // 关闭摄像头功能
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraStatus('idle');
      setIsCameraModalOpen(false);
    }
  };

  // 监听模态框打开，自动请求权限
  useEffect(() => {
    if (isCameraModalOpen && !cameraStream) {
      startCamera();
    }
  }, [isCameraModalOpen]);

  // 麦克风模拟测试逻辑
  const startMicTest = () => {
    setMicTestStatus('listening');
    
    // 模拟录音2.5秒
    setTimeout(() => {
      setMicTestStatus('recognizing');
      
      // 模拟识别1.5秒
      setTimeout(() => {
        setMicTestStatus('success');
      }, 1500);
    }, 2500);
  };

  // 监听麦克风模态框打开
  useEffect(() => {
    if (isMicModalOpen) {
      startMicTest();
    }
  }, [isMicModalOpen]);

  // 将视频流绑定到弹窗内的 video 标签
  useEffect(() => {
    if (isCameraModalOpen && modalVideoRef.current && cameraStream) {
      modalVideoRef.current.srcObject = cameraStream;
    }
  }, [isCameraModalOpen, cameraStream, cameraStatus]);

  // 将视频流绑定到主卡片内的 video 标签
  useEffect(() => {
    if (!isCameraModalOpen && mainVideoRef.current && cameraStream) {
      mainVideoRef.current.srcObject = cameraStream;
    }
  }, [isCameraModalOpen, cameraStream]);

  // 全局唯一定义 timelineData
  const timelineData = [
    { time: '14:02', emotion: t.log1Emo, desc: t.log1Desc, color: 'bg-green-100 text-green-700' },
    { time: '14:06', emotion: t.log2Emo, desc: t.log2Desc, color: 'bg-orange-100 text-orange-700' },
    { time: '14:10', emotion: t.log3Emo, desc: t.log3Desc, color: 'bg-amber-100 text-amber-700' },
    { time: '14:15', emotion: t.log4Emo, desc: t.log4Desc, color: 'bg-teal-100 text-teal-700' },
  ];

  return (
    <div 
      className="min-h-screen bg-[#FDFBF7] text-[#5C4D42] font-sans relative overflow-hidden selection:bg-orange-200"
      onClick={() => setIsLangMenuOpen(false)}
    >
      {/* 自定义呼吸动画样式 */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes breathe {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .animate-breathe {
          animation: breathe 4s ease-in-out infinite;
        }
        .animate-breathe-delayed {
          animation: breathe 4.5s ease-in-out infinite 1s;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #fdfbf7; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5d8c8; 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d4c3b3; 
        }
      `}} />

      {/* 背景治愈系装饰元素 */}
      <div className="absolute top-10 left-10 text-orange-200/40 pointer-events-none">
        <Sun size={120} strokeWidth={1} />
      </div>
      <div className="absolute bottom-20 right-10 text-green-200/40 pointer-events-none">
        <Leaf size={100} strokeWidth={1} />
      </div>
      <div className="absolute top-1/3 right-1/4 text-amber-200/30 pointer-events-none">
        <Wind size={80} strokeWidth={1} />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 relative z-10 flex flex-col gap-8">
        
        {/* 1. 顶部区域（已添加 relative z-50 提升层级以防菜单被遮挡） */}
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
                      setIsLangMenuOpen(!isLangMenuOpen);
                    } else if (item.id === 'auth' && !isLoggedIn) {
                      setAuthMode('login');
                      setIsAuthModalOpen(true);
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-300 hover:-translate-y-0.5 ${
                    item.id === 'auth' && isLoggedIn 
                      ? 'text-[#D97757] bg-[#FFF5EB]' 
                      : 'text-[#8C7A6B] hover:text-[#D97757] hover:bg-[#FFF5EB]'
                  }`}
                >
                  <item.icon size={20} strokeWidth={1.5} />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
                
                {/* 语言下拉菜单 */}
                {item.id === 'lang' && isLangMenuOpen && (
                  <div className="absolute top-full mt-3 right-0 md:left-1/2 md:-translate-x-1/2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-[#F0E5D8] py-2 w-44 flex flex-col z-50 overflow-hidden">
                    {[
                      { code: 'zh', name: '汉语 (Mandarin)' },
                      { code: 'en', name: '英语 (English)' },
                      { code: 'de', name: '德语 (German)' },
                      { code: 'fr', name: '法语 (French)' },
                    ].map((l) => (
                      <button
                        key={l.code}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLang(l.code);
                          setIsLangMenuOpen(false);
                        }}
                        className={`px-4 py-3 text-sm text-left hover:bg-[#FFF5EB] hover:text-[#D97757] transition-colors ${
                          lang === l.code ? 'text-[#D97757] bg-[#FFF5EB]/50 font-medium' : 'text-[#8C7A6B]'
                        }`}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </header>

        {/* 2. 标题下方功能区 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* 左侧：外设调试按钮 */}
          <div className="md:col-span-1 flex flex-col gap-4">
            {cameraStream ? (
              <div className="group relative overflow-hidden flex items-center justify-between gap-2 bg-white/80 backdrop-blur-sm p-4 rounded-3xl border border-green-200/60 shadow-sm transition-all duration-300 min-h-[88px]">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-sm shrink-0 border border-green-200 bg-black/5">
                    <video ref={mainVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-[#5C4D42] text-sm">{t.camOn}</span>
                    <span className="text-xs text-[#6B9080] mt-0.5">{t.camCap}</span>
                  </div>
                </div>
                <button 
                  onClick={stopCamera}
                  className="flex items-center justify-center w-8 h-8 rounded-full text-[#D97757] hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                  title={t.cancel}
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsCameraModalOpen(true); }}
                className="group relative overflow-hidden flex items-center gap-4 bg-white/80 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm hover:shadow-md hover:bg-[#FFFBF5] transition-all duration-300 hover:-translate-y-1 min-h-[88px]"
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
              onClick={(e) => { e.stopPropagation(); setIsMicModalOpen(true); }}
              className="group relative overflow-hidden flex items-center gap-4 bg-white/80 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm hover:shadow-md hover:bg-[#FFFBF5] transition-all duration-300 hover:-translate-y-1"
            >
              <div className="bg-[#FFF0E5] p-3 rounded-2xl text-[#D97757] group-hover:scale-110 transition-transform duration-300">
                <Mic size={26} strokeWidth={2} />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-[#5C4D42]">{t.micTest}</span>
                <span className="text-xs text-[#8C7A6B] mt-0.5">{t.micOpt}</span>
              </div>
            </button>
          </div>

          {/* 右侧：情绪信息区 */}
          <div className="md:col-span-3 flex flex-col md:flex-row gap-4">
            {/* 实时情绪卡片 */}
            <div className="flex-1 bg-gradient-to-br from-[#FFFBF5] to-[#FFF5EB] p-6 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col justify-center relative overflow-hidden">
              <Heart className="absolute -right-4 -bottom-4 text-orange-100 opacity-50" size={120} />
              <div className="relative z-10">
                <h3 className="text-sm font-medium text-[#8C7A6B] flex items-center gap-2 mb-3">
                  <Sparkles size={16} /> {t.emoTitle}
                </h3>
                <div className="flex items-end gap-4">
                  <span className="text-4xl font-bold text-[#D97757] tracking-wider">{t.emoState}</span>
                  <span className="text-sm text-[#8C7A6B] mb-1 bg-white/60 px-3 py-1 rounded-full">
                    {t.emoDesc}
                  </span>
                </div>
                <p className="mt-4 text-[#5C4D42] text-sm leading-relaxed italic">
                  {t.emoQuote}
                </p>
              </div>
            </div>

            {/* 历史情绪时间轴 */}
            <div className="flex-1 bg-white/80 backdrop-blur-sm p-6 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col h-48">
              <h3 className="text-sm font-medium text-[#8C7A6B] mb-4 flex items-center gap-2">
                <Clock size={16} /> {t.logTitle}
              </h3>
              <div className="overflow-y-auto custom-scrollbar pr-2 flex-1 space-y-4">
                {timelineData.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="text-xs font-medium text-[#A6998E] w-10 pt-0.5">{item.time}</div>
                    <div className="relative flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-[#D97757]/40 ring-4 ring-[#FFFBF5] z-10"></div>
                      {idx !== timelineData.length - 1 && (
                        <div className="w-0.5 h-full bg-[#F0E5D8] absolute top-2"></div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-md ${item.color}`}>
                        {item.emotion}
                      </span>
                      <span className="text-sm text-[#5C4D42]">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 3. 中间核心场景区 */}
        <div className="relative w-full h-[400px] md:h-[480px] bg-gradient-to-b from-[#FFFDF9] to-[#FCEFDA] rounded-[2.5rem] border-4 border-white shadow-lg overflow-hidden flex items-end justify-center">
          
          {/* 场景背景装饰（窗户、光斑） */}
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            <div className="absolute top-10 left-1/4 w-32 h-64 bg-white/40 blur-3xl transform rotate-12"></div>
            <div className="absolute top-20 right-1/3 w-48 h-48 bg-orange-100/30 rounded-full blur-3xl"></div>
          </div>

          {/* 左侧虚拟人物（温暖女性形象示意） */}
          <div className="absolute left-4 md:left-20 bottom-0 flex flex-col items-center animate-breathe">
            {/* 语言气泡 */}
            <div className={`absolute -top-24 md:-top-28 left-10 md:left-24 bg-white/95 backdrop-blur-md p-4 rounded-2xl rounded-bl-none shadow-sm border border-orange-50 max-w-[200px] md:max-w-[260px] transition-opacity duration-700 ${activeMessage === 0 ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-sm md:text-base text-[#5C4D42] leading-relaxed">
                {t.bubble1}
              </p>
            </div>
            {/* 人物 SVG 插画 */}
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

          {/* 右侧虚拟人物（温和中性/男性形象示意） */}
          <div className="absolute right-4 md:right-20 bottom-0 flex flex-col items-center animate-breathe-delayed">
            {/* 语言气泡 */}
            <div className={`absolute -top-24 md:-top-28 right-10 md:right-24 bg-white/95 backdrop-blur-md p-4 rounded-2xl rounded-br-none shadow-sm border border-teal-50 max-w-[200px] md:max-w-[260px] transition-opacity duration-700 ${activeMessage === 1 ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-sm md:text-base text-[#5C4D42] leading-relaxed">
                {t.bubble2}
              </p>
            </div>
            {/* 人物 SVG 插画 */}
            <svg width="200" height="240" viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M30 240C30 170 55 130 100 130C145 130 170 170 170 240H30Z" fill="#E8F3EE"/>
              <path d="M45 240C45 180 65 145 100 145C135 145 155 180 155 240H45Z" fill="#6B9080" fillOpacity="0.1"/>
              <rect x="85" y="105" width="30" height="40" rx="10" fill="#FCE5D0"/>
              <rect x="65" y="35" width="70" height="85" rx="35" fill="#FCE5D0"/>
              <path d="M60 65C60 30 75 20 100 20C125 20 140 30 140 65C140 85 135 95 130 100C125 80 115 65 100 65C85 65 75 80 70 100C65 95 60 85 60 65Z" fill="#5C4D42"/>
              <path d="M80 80Q85 82 90 80" stroke="#4A3D34" strokeWidth="2" strokeLinecap="round"/>
              <path d="M110 80Q115 82 120 80" stroke="#4A3D34" strokeWidth="2" strokeLinecap="round"/>
              <path d="M92 100Q100 102 108 100" stroke="#B38A78" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        {/* 4. 场景框下方区域 - 交互状态与输入框 */}
        <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col md:flex-row items-center gap-6 relative">
          
          {/* 状态指示器 */}
          <div className="flex flex-col items-center justify-center min-w-[140px] gap-2">
            <div className="relative flex items-center justify-center w-12 h-12 bg-[#FFF5EB] rounded-full text-[#D97757]">
              <MessageCircleHeart size={24} />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D97757] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#D97757]"></span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-[#D97757] animate-pulse">
              {t.statuses[systemStatusIndex]}
            </div>
          </div>

          <div className="w-[1px] h-16 bg-[#F0E5D8] hidden md:block"></div>

          {/* 用户输入文字展示（已升级为输入区） */}
          <div className="flex-1 w-full bg-[#FDFBF7] rounded-2xl p-4 border border-[#F0E5D8]/50 relative flex flex-col transition-all duration-300 focus-within:border-[#D97757]/40 focus-within:shadow-sm focus-within:bg-white">
            <div className="absolute -top-3 left-4 bg-[#E8F3EE] text-[#6B9080] px-2 py-0.5 rounded-md text-xs flex items-center gap-1 border border-white z-10 shadow-sm">
              <User size={12} /> {t.inputTag}
            </div>
            
            <textarea 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={t.inputPlaceholder}
              className="w-full bg-transparent resize-none outline-none text-[#5C4D42] text-base leading-relaxed mt-2 min-h-[50px] custom-scrollbar placeholder:text-[#A6998E]/60"
            />
            
            {/* 底部操作栏 */}
            <div className="flex justify-end items-center gap-2 mt-2 pt-2 border-t border-[#F0E5D8]/40">
              <span className="text-xs text-[#D97757] mr-auto flex items-center gap-1">
                {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>}
                {isRecording ? t.recording : ''}
              </span>
              
              <button 
                onClick={() => setIsRecording(!isRecording)}
                className={`p-2.5 rounded-full transition-all duration-300 ${isRecording ? 'bg-red-50 text-red-500 shadow-inner' : 'text-[#8C7A6B] hover:bg-[#FFF0E5] hover:text-[#D97757] hover:scale-105'}`}
              >
                <Mic size={18} strokeWidth={isRecording ? 2.5 : 2} className={isRecording ? 'animate-pulse' : ''} />
              </button>
              
              <button 
                onClick={() => {
                  if(inputText.trim()) {
                    setInputText(''); // 模拟发送后清空
                    setSystemStatusIndex(3); // '正在整理回复...'
                  }
                }}
                className={`p-2.5 rounded-full transition-all duration-300 flex items-center justify-center ${inputText.trim() ? 'bg-[#D97757] text-white shadow-md hover:bg-[#c26649] hover:-translate-y-0.5' : 'bg-[#F0E5D8] text-[#A6998E] cursor-not-allowed opacity-60'}`}
                disabled={!inputText.trim()}
              >
                <Send size={16} strokeWidth={2.5} className={inputText.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />
              </button>
            </div>
          </div>
        </div>

      </div>
      
      {/* 摄像头调试弹窗 */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={(e) => e.stopPropagation()}>
          <div className="bg-[#FDFBF7] rounded-3xl p-6 w-[90%] max-w-sm shadow-xl flex flex-col gap-4 border border-[#F0E5D8] transform transition-all scale-100">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-[#5C4D42] flex items-center gap-2">
                <Video size={20} className="text-[#D97757]" />
                {t.camModalTitle}
              </h3>
              <button 
                onClick={() => setIsCameraModalOpen(false)}
                className="text-[#8C7A6B] hover:text-[#D97757] transition-colors p-1 rounded-full hover:bg-[#FFF5EB]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="w-full aspect-video bg-white rounded-2xl border-2 border-[#F0E5D8] overflow-hidden relative flex items-center justify-center shadow-inner">
              {cameraStatus === 'idle' || cameraStatus === 'requesting' ? (
                <div className="flex flex-col items-center gap-3 text-[#A6998E] animate-pulse">
                  <Video size={36} strokeWidth={1.5} />
                  <span className="text-sm">{t.camReq}</span>
                </div>
              ) : cameraStatus === 'success' ? (
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
                  <span className="text-sm">{t.camErr}</span>
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center mt-2 h-8">
              <div className="text-sm font-medium">
                {cameraStatus === 'success' && (
                  <span className="text-green-600 flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    {t.camSuccess}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setIsCameraModalOpen(false)}
                className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                  cameraStatus === 'success' 
                    ? 'bg-[#D97757] text-white shadow-md hover:bg-[#c26649]' 
                    : 'bg-[#F0E5D8] text-[#5C4D42] hover:bg-[#E5D8C8]'
                }`}
              >
                {cameraStatus === 'success' ? t.done : t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 麦克风调试弹窗 */}
      {isMicModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={(e) => e.stopPropagation()}>
          <div className="bg-[#FDFBF7] rounded-3xl p-6 w-[90%] max-w-sm shadow-xl flex flex-col gap-4 border border-[#F0E5D8] transform transition-all scale-100">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-[#5C4D42] flex items-center gap-2">
                <Mic size={20} className="text-[#D97757]" />
                {t.micModalTitle}
              </h3>
              <button 
                onClick={() => setIsMicModalOpen(false)}
                className="text-[#8C7A6B] hover:text-[#D97757] transition-colors p-1 rounded-full hover:bg-[#FFF5EB]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="w-full h-32 bg-white rounded-2xl border-2 border-[#F0E5D8] overflow-hidden relative flex flex-col items-center justify-center shadow-inner p-4">
              {micTestStatus === 'listening' && (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative flex items-center justify-center w-12 h-12 bg-red-50 rounded-full text-red-400">
                    <Mic size={24} />
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-400"></span>
                    </span>
                  </div>
                  <span className="text-sm text-[#D97757] animate-pulse">{t.micSpeak}</span>
                </div>
              )}
              
              {micTestStatus === 'recognizing' && (
                <div className="flex flex-col items-center gap-3 text-[#A6998E]">
                  <MoreHorizontal size={32} className="animate-pulse" />
                  <span className="text-sm">{t.micRec}</span>
                </div>
              )}

              {micTestStatus === 'success' && (
                <div className="flex w-full h-full flex-col justify-center">
                  <span className="text-xs text-[#6B9080] mb-2 bg-[#E8F3EE] self-start px-2 py-0.5 rounded-md border border-white">
                    {t.micRes}
                  </span>
                  <p className="text-[#5C4D42] text-base leading-relaxed break-words">
                    {t.micTestText}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center mt-2">
              <div className="text-sm font-medium h-8 flex items-center">
                {micTestStatus === 'success' && (
                  <span className="text-green-600 flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    {t.micSuccess}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={startMicTest}
                  disabled={micTestStatus !== 'success'}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    micTestStatus === 'success' 
                      ? 'bg-[#FFF0E5] text-[#D97757] hover:bg-[#FFE5D0]' 
                      : 'bg-transparent text-transparent pointer-events-none'
                  }`}
                >
                  {t.micRetry}
                </button>
                <button 
                  onClick={() => setIsMicModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    micTestStatus === 'success' 
                      ? 'bg-[#D97757] text-white shadow-md hover:bg-[#c26649]' 
                      : 'bg-[#F0E5D8] text-[#5C4D42] hover:bg-[#E5D8C8]'
                  }`}
                >
                  {micTestStatus === 'success' ? t.micClose : t.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 用户登录/注册弹窗 */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={(e) => e.stopPropagation()}>
          <div className="bg-[#FDFBF7] rounded-3xl p-8 w-[90%] max-w-sm shadow-xl flex flex-col gap-6 border border-[#F0E5D8] transform transition-all scale-100 relative">
            <button 
              onClick={() => setIsAuthModalOpen(false)}
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

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                setIsLoggedIn(true);
                setIsAuthModalOpen(false);
              }}
              className="flex flex-col gap-4"
            >
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
                  onClick={() => setAuthMode('register')} 
                  className="text-[#8C7A6B] text-sm hover:text-[#D97757] transition-colors inline-flex items-center gap-1"
                >
                  {t.noAcc}<span className="underline decoration-[#F0E5D8] underline-offset-4">{t.goReg}</span>
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={() => setAuthMode('login')} 
                  className="text-[#8C7A6B] text-sm hover:text-[#D97757] transition-colors inline-flex items-center gap-1"
                >
                  {t.hasAcc}<span className="underline decoration-[#F0E5D8] underline-offset-4">{t.goLogin}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// 提取一个小图标组件用于顶部导航
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