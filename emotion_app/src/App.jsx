import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Video, Mic, Heart, Clock, Globe, User,
  Sun, Wind, Leaf, Sparkles, MessageCircleHeart,
  Send, X
} from 'lucide-react';
import {
  buildHeartbeatMessage,
  buildRealtimeSocketUrl,
  clearStoredSessionId,
  isTerminalRealtimeClose,
  readStoredSessionId,
  requestAudioChunkUpload,
  requestAudioFinalize,
  requestAudioPreview,
  requestAffectAnalysis,
  requestSession,
  requestSessionState,
  requestTextMessage,
  requestVideoFrameUpload,
  writeStoredSessionId,
} from './sessionApi';

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
    micTestText: '“今天阳光很好，感觉心里也暖暖的。”',
    phaseTitle: 'Phase C 实时会话基线',
    phaseDesc: '当前 React 前端采用 WS-first 文本流程：session create、页面 restore 与窄范围 reconnect recovery 继续复用 gateway 契约，正常文本完成以 WebSocket realtime 为准。',
    createSession: '创建会话',
    restoreState: '恢复会话',
    restoring: '恢复中...',
    restoreReady: '检测到本地会话，可恢复历史消息。',
    noStoredSession: '当前没有本地缓存的会话。',
    clearSession: '清除会话',
    submitText: '发送文本',
    sending: '发送中...',
    sessionLabel: '会话 ID',
    traceLabel: 'Trace ID',
    stageLabel: '当前阶段',
    statusLabel: '会话状态',
    messageCountLabel: '消息数',
    sessionPending: '未创建',
    sessionIdle: '等待创建或恢复会话',
    sessionCreating: '正在创建会话...',
    sessionRestoring: '正在恢复会话状态...',
    sessionReady: '会话已就绪，可通过 WebSocket 实时完成文本轮次。',
    sessionSubmitting: '正在提交文本并等待 message.accepted / dialogue.reply...',
    sessionRestoreFailed: '恢复失败，请重新创建会话。',
    sessionSubmitSuccess: '已收到助手回复，当前文本轮次完成。',
    sessionSubmitNeedSession: '请先创建或恢复会话。',
    sessionSubmitEmpty: '请输入内容后再发送。',
    assistantReplies: '对话记录',
    assistantEmpty: '创建或恢复会话后，这里会显示用户消息和助手回复。',
    userRoleLabel: '你',
    assistantRoleLabel: '陪伴助手',
    systemRoleLabel: '系统',
    restoreSource: '恢复来源',
    storageKeyLabel: '存储键',
    sourceEmotionApp: 'emotion_app',
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
    micTestText: '"The sun is beautiful today, my heart feels warm."',
    phaseTitle: 'Phase C realtime session baseline',
    phaseDesc: 'The React frontend now uses a WS-first text flow. Session create, page restore, and narrow reconnect recovery still reuse the existing gateway contract, while normal text completion relies on WebSocket realtime.',
    createSession: 'Create session',
    restoreState: 'Restore session',
    restoring: 'Restoring...',
    restoreReady: 'A stored session was found and can be restored.',
    noStoredSession: 'No stored session is available yet.',
    clearSession: 'Clear session',
    submitText: 'Send text',
    sending: 'Sending...',
    sessionLabel: 'Session ID',
    traceLabel: 'Trace ID',
    stageLabel: 'Stage',
    statusLabel: 'Status',
    messageCountLabel: 'Messages',
    sessionPending: 'Not created',
    sessionIdle: 'Create or restore a session to continue.',
    sessionCreating: 'Creating session...',
    sessionRestoring: 'Restoring session state...',
    sessionReady: 'Session is ready for WS-first text input.',
    sessionSubmitting: 'Submitting text and waiting for message.accepted and dialogue.reply...',
    sessionRestoreFailed: 'Restore failed. Create a new session to continue.',
    sessionSubmitSuccess: 'Assistant reply received and text turn completed.',
    sessionSubmitNeedSession: 'Create or restore a session first.',
    sessionSubmitEmpty: 'Enter some text before sending.',
    assistantReplies: 'Conversation log',
    assistantEmpty: 'User and assistant messages will appear here after a session is created or restored.',
    userRoleLabel: 'You',
    assistantRoleLabel: 'Companion',
    systemRoleLabel: 'System',
    restoreSource: 'Restore source',
    storageKeyLabel: 'Storage key',
    sourceEmotionApp: 'emotion_app',
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
    micTestText: '"Die Sonne scheint heute schön, mein Herz fühlt sich warm an."',
    phaseTitle: 'Phase-C-Realtime-Sitzungsbasis',
    phaseDesc: 'Das React-Frontend nutzt jetzt einen WS-first-Textfluss. Sitzungserstellung, Seitenwiederherstellung und eine enge Reconnect-Recovery verwenden weiter den bestehenden Gateway-Vertrag, während normale Textabschlüsse über WebSocket-Realtime laufen.',
    createSession: 'Sitzung erstellen',
    restoreState: 'Sitzung laden',
    restoring: 'Wird geladen...',
    restoreReady: 'Eine gespeicherte Sitzung wurde gefunden und kann wiederhergestellt werden.',
    noStoredSession: 'Derzeit ist keine gespeicherte Sitzung vorhanden.',
    clearSession: 'Sitzung löschen',
    submitText: 'Text senden',
    sending: 'Wird gesendet...',
    sessionLabel: 'Sitzungs-ID',
    traceLabel: 'Trace-ID',
    stageLabel: 'Phase',
    statusLabel: 'Status',
    messageCountLabel: 'Nachrichten',
    sessionPending: 'Nicht erstellt',
    sessionIdle: 'Erstelle oder lade zuerst eine Sitzung.',
    sessionCreating: 'Sitzung wird erstellt...',
    sessionRestoring: 'Sitzungsstatus wird geladen...',
    sessionReady: 'Sitzung ist für WS-first-Texteingaben bereit.',
    sessionSubmitting: 'Text wird gesendet, auf message.accepted und dialogue.reply wird gewartet...',
    sessionRestoreFailed: 'Wiederherstellung fehlgeschlagen. Bitte neue Sitzung erstellen.',
    sessionSubmitSuccess: 'Assistentenantwort empfangen und Textrunde abgeschlossen.',
    sessionSubmitNeedSession: 'Bitte zuerst eine Sitzung erstellen oder laden.',
    sessionSubmitEmpty: 'Bitte zuerst Text eingeben.',
    assistantReplies: 'Gesprächsverlauf',
    assistantEmpty: 'Nach dem Erstellen oder Laden einer Sitzung erscheinen hier Nutzer- und Assistentennachrichten.',
    userRoleLabel: 'Du',
    assistantRoleLabel: 'Begleiter',
    systemRoleLabel: 'System',
    restoreSource: 'Wiederherstellungsquelle',
    storageKeyLabel: 'Speicherschlüssel',
    sourceEmotionApp: 'emotion_app',
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
    micTestText: '"Le soleil est magnifique aujourd\'hui, mon cœur se sent chaleureux."',
    phaseTitle: 'Base de session temps réel phase C',
    phaseDesc: 'Le frontend React utilise désormais un flux texte WS-first. La création de session, la restauration de page et une reprise de reconnexion très limitée réutilisent toujours le contrat gateway existant, tandis que le chemin texte normal se termine via WebSocket realtime.',
    createSession: 'Créer une session',
    restoreState: 'Restaurer la session',
    restoring: 'Restauration...',
    restoreReady: 'Une session locale a été trouvée et peut être restaurée.',
    noStoredSession: 'Aucune session locale n’est encore disponible.',
    clearSession: 'Effacer la session',
    submitText: 'Envoyer le texte',
    sending: 'Envoi...',
    sessionLabel: 'ID de session',
    traceLabel: 'Trace ID',
    stageLabel: 'Étape',
    statusLabel: 'Statut',
    messageCountLabel: 'Messages',
    sessionPending: 'Non créée',
    sessionIdle: 'Créez ou restaurez une session pour continuer.',
    sessionCreating: 'Création de la session...',
    sessionRestoring: 'Restauration de l’état de session...',
    sessionReady: 'La session est prête pour une saisie texte WS-first.',
    sessionSubmitting: 'Envoi du texte et attente de message.accepted puis dialogue.reply...',
    sessionRestoreFailed: 'La restauration a échoué. Créez une nouvelle session pour continuer.',
    sessionSubmitSuccess: 'Réponse de l’assistant reçue et tour texte terminé.',
    sessionSubmitNeedSession: 'Créez ou restaurez d’abord une session.',
    sessionSubmitEmpty: 'Saisissez un texte avant l’envoi.',
    assistantReplies: 'Historique de conversation',
    assistantEmpty: 'Les messages utilisateur et assistant apparaîtront ici après création ou restauration d’une session.',
    userRoleLabel: 'Vous',
    assistantRoleLabel: 'Compagnon',
    systemRoleLabel: 'Système',
    restoreSource: 'Source de restauration',
    storageKeyLabel: 'Clé de stockage',
    sourceEmotionApp: 'emotion_app',
  }
};

function normalizeMessage(message) {
  const metadata = message?.metadata && typeof message.metadata === 'object'
    ? message.metadata
    : {};

  return {
    message_id: typeof message?.message_id === 'string' ? message.message_id : '',
    session_id: typeof message?.session_id === 'string' ? message.session_id : null,
    trace_id: typeof message?.trace_id === 'string' ? message.trace_id : null,
    role: typeof message?.role === 'string' ? message.role : 'system',
    status: typeof message?.status === 'string' ? message.status : null,
    source_kind: typeof message?.source_kind === 'string' ? message.source_kind : 'text',
    content_text: typeof message?.content_text === 'string' ? message.content_text : '',
    submitted_at: message?.submitted_at || null,
    metadata,
  };
}

function upsertMessageById(messages, nextMessage) {
  if (!nextMessage?.message_id) {
    return Array.isArray(messages) ? messages : [];
  }

  const currentMessages = Array.isArray(messages) ? messages : [];
  const existingIndex = currentMessages.findIndex(
    (message) => message?.message_id === nextMessage.message_id,
  );

  if (existingIndex === -1) {
    return [...currentMessages, nextMessage];
  }

  const nextMessages = [...currentMessages];
  nextMessages[existingIndex] = {
    ...nextMessages[existingIndex],
    ...nextMessage,
    metadata: nextMessage.metadata || nextMessages[existingIndex]?.metadata || {},
  };
  return nextMessages;
}

function hasMessageId(messages, messageId) {
  if (!messageId) {
    return false;
  }
  return Array.isArray(messages)
    && messages.some((message) => message?.message_id === messageId);
}

function normalizeSessionStatePayload(payload) {
  const session = payload?.session && typeof payload.session === 'object'
    ? payload.session
    : null;
  const messages = Array.isArray(payload?.messages)
    ? payload.messages.reduce((items, message) => upsertMessageById(items, normalizeMessage(message)), [])
    : [];

  return {
    session,
    messages,
  };
}

function buildAcceptedMessageFromEnvelope(envelope) {
  const payload = envelope?.payload && typeof envelope.payload === 'object'
    ? envelope.payload
    : null;
  const messageId = payload?.message_id || envelope?.message_id;

  if (typeof messageId !== 'string' || !messageId.trim()) {
    return null;
  }

  return normalizeMessage({
    message_id: messageId,
    session_id: payload?.session_id || envelope?.session_id || null,
    trace_id: payload?.trace_id || envelope?.trace_id || null,
    role: payload?.role || 'user',
    status: payload?.status || 'accepted',
    source_kind: payload?.source_kind || 'text',
    content_text: payload?.content_text || '',
    submitted_at: payload?.submitted_at || envelope?.emitted_at || null,
    metadata: payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  });
}

function buildReplyMessageFromEnvelope(envelope) {
  const payload = envelope?.payload && typeof envelope.payload === 'object'
    ? envelope.payload
    : null;
  const messageId = payload?.message_id || envelope?.message_id;
  const replyText = payload?.reply;

  if (
    typeof messageId !== 'string'
    || !messageId.trim()
    || typeof replyText !== 'string'
    || !replyText.trim()
  ) {
    return null;
  }

  return normalizeMessage({
    message_id: messageId,
    session_id: payload?.session_id || envelope?.session_id || null,
    trace_id: payload?.trace_id || envelope?.trace_id || null,
    role: 'assistant',
    status: 'completed',
    source_kind: 'text',
    content_text: replyText,
    submitted_at: payload?.submitted_at || envelope?.emitted_at || null,
    metadata: {
      stage: payload?.stage,
      emotion: payload?.emotion,
      risk_level: payload?.risk_level,
      next_action: payload?.next_action,
    },
  });
}

function validateTranscriptPartialPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.transcript_kind !== 'partial') {
    return null;
  }
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    return null;
  }
  if (!Number.isFinite(payload.preview_seq) || payload.preview_seq < 1) {
    return null;
  }
  if (typeof payload.recording_id !== 'string' || !payload.recording_id.trim()) {
    return null;
  }

  return {
    text: payload.text,
    previewSeq: Number(payload.preview_seq),
    recordingId: payload.recording_id,
    generatedAt: typeof payload.generated_at === 'string' ? payload.generated_at : null,
    language: typeof payload.language === 'string' ? payload.language : null,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
  };
}

function validateTranscriptFinalPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.transcript_kind !== 'final') {
    return null;
  }
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    return null;
  }

  return {
    text: payload.text,
    messageId: typeof payload.message_id === 'string' ? payload.message_id : null,
    sourceKind: typeof payload.source_kind === 'string' ? payload.source_kind : 'audio',
    recordingId: typeof payload.recording_id === 'string' ? payload.recording_id : null,
    generatedAt: typeof payload.generated_at === 'string' ? payload.generated_at : null,
    language: typeof payload.language === 'string' ? payload.language : null,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
  };
}

function normalizeAffectPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const sourceContext = payload.source_context;
  const textResult = payload.text_result;
  const audioResult = payload.audio_result;
  const videoResult = payload.video_result;
  const fusionResult = payload.fusion_result;
  if (
    !sourceContext
    || typeof sourceContext.origin !== 'string'
    || typeof sourceContext.dataset !== 'string'
    || typeof sourceContext.record_id !== 'string'
    || !textResult
    || typeof textResult.label !== 'string'
    || !audioResult
    || typeof audioResult.label !== 'string'
    || !videoResult
    || typeof videoResult.label !== 'string'
    || !fusionResult
    || typeof fusionResult.emotion_state !== 'string'
    || typeof fusionResult.risk_level !== 'string'
  ) {
    return null;
  }

  return {
    panelState: 'ready',
    panelMessage: 'Affect snapshot updated.',
    currentStage: typeof payload.current_stage === 'string' ? payload.current_stage : 'idle',
    generatedAt: typeof payload.generated_at === 'string' ? payload.generated_at : null,
    sourceContext: {
      origin: sourceContext.origin,
      dataset: sourceContext.dataset,
      recordId: sourceContext.record_id,
      note: typeof sourceContext.note === 'string' ? sourceContext.note : '',
    },
    text: {
      status: typeof textResult.status === 'string' ? textResult.status : 'pending',
      label: textResult.label,
      confidence: typeof textResult.confidence === 'number' ? textResult.confidence : null,
      detail: typeof textResult.detail === 'string' ? textResult.detail : '',
    },
    audio: {
      status: typeof audioResult.status === 'string' ? audioResult.status : 'pending',
      label: audioResult.label,
      confidence: typeof audioResult.confidence === 'number' ? audioResult.confidence : null,
      detail: typeof audioResult.detail === 'string' ? audioResult.detail : '',
    },
    video: {
      status: typeof videoResult.status === 'string' ? videoResult.status : 'pending',
      label: videoResult.label,
      confidence: typeof videoResult.confidence === 'number' ? videoResult.confidence : null,
      detail: typeof videoResult.detail === 'string' ? videoResult.detail : '',
    },
    fusion: {
      emotionState: fusionResult.emotion_state,
      riskLevel: fusionResult.risk_level,
      confidence: typeof fusionResult.confidence === 'number' ? fusionResult.confidence : null,
      conflict: fusionResult.conflict === true,
      conflictReason: typeof fusionResult.conflict_reason === 'string' ? fusionResult.conflict_reason : '',
      detail: typeof fusionResult.detail === 'string' ? fusionResult.detail : '',
    },
  };
}

function normalizeKnowledgeRetrievedPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return {
    sourceIds: Array.isArray(payload.source_ids)
      ? payload.source_ids.filter((item) => typeof item === 'string' && item.trim())
      : [],
    groundedRefs: Array.isArray(payload.grounded_refs)
      ? payload.grounded_refs.filter((item) => typeof item === 'string' && item.trim())
      : [],
    filtersApplied: Array.isArray(payload.filters_applied)
      ? payload.filters_applied.filter((item) => typeof item === 'string' && item.trim())
      : [],
    candidateCount: Number.isFinite(payload.candidate_count) ? Number(payload.candidate_count) : null,
    retrievalAttempted: payload.retrieval_attempted === true,
    retrievalStatus: typeof payload.retrieval_status === 'string' && payload.retrieval_status.trim()
      ? payload.retrieval_status
      : 'idle',
    riskLevel: typeof payload.risk_level === 'string' ? payload.risk_level : 'pending',
    stage: typeof payload.stage === 'string' ? payload.stage : 'idle',
    errorMessage: typeof payload.error_message === 'string' ? payload.error_message : '',
  };
}

function createInitialPartialTranscriptState() {
  return {
    status: 'idle',
    text: '',
    previewSeq: 0,
    recordingId: null,
    updatedAt: null,
    language: null,
    confidence: null,
  };
}

function createInitialFinalTranscriptState() {
  return {
    text: '',
    messageId: null,
    sourceKind: 'pending',
    recordingId: null,
    updatedAt: null,
    language: null,
    confidence: null,
  };
}

function createInitialAffectSnapshot() {
  return {
    panelState: 'idle',
    panelMessage: 'Waiting for affect snapshot.',
    currentStage: 'idle',
    generatedAt: null,
    sourceContext: {
      origin: 'pending',
      dataset: 'pending',
      recordId: 'pending',
      note: '',
    },
    text: {
      status: 'pending',
      label: 'pending',
      confidence: null,
      detail: '',
    },
    audio: {
      status: 'pending',
      label: 'pending',
      confidence: null,
      detail: '',
    },
    video: {
      status: 'pending',
      label: 'pending',
      confidence: null,
      detail: '',
    },
    fusion: {
      emotionState: 'pending',
      riskLevel: 'pending',
      confidence: null,
      conflict: false,
      conflictReason: '',
      detail: '',
    },
  };
}

function createInitialKnowledgeState() {
  return {
    sourceIds: [],
    groundedRefs: [],
    filtersApplied: [],
    candidateCount: null,
    retrievalAttempted: false,
    retrievalStatus: 'idle',
    riskLevel: 'pending',
    stage: 'idle',
    errorMessage: '',
  };
}

function formatRealtimeConfidence(value) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';
}

function formatDurationMs(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0.0s';
  }
  return `${(value / 1000).toFixed(1)}s`;
}

function createRecordingId() {
  return `rec_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export default function App({ appConfig }) {
  // 语言状态管理
  const [lang, setLang] = useState('zh');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const t = i18n[lang];

  const [systemStatusIndex, setSystemStatusIndex] = useState(4);
  const [activeMessage, setActiveMessage] = useState(0);
  
  // 输入框与录音状态管理
  const [inputText, setInputText] = useState('');
  const [micPermissionState, setMicPermissionState] = useState('idle');
  const [micPermissionMessage, setMicPermissionMessage] = useState('');
  const [recordingState, setRecordingState] = useState('idle');
  const [audioUploadState, setAudioUploadState] = useState('idle');
  const [audioUploadMessage, setAudioUploadMessage] = useState('');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordingChunkCount, setRecordingChunkCount] = useState(0);
  const [lastUploadedAt, setLastUploadedAt] = useState(null);
  const [lastUploadedMediaId, setLastUploadedMediaId] = useState(null);

  // 摄像头状态管理
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraPermissionState, setCameraPermissionState] = useState('idle');
  const [cameraPermissionMessage, setCameraPermissionMessage] = useState('');
  const [cameraState, setCameraState] = useState('idle');
  const [cameraPreviewMessage, setCameraPreviewMessage] = useState('');
  const [videoUploadState, setVideoUploadState] = useState('idle');
  const [videoUploadMessage, setVideoUploadMessage] = useState('');
  const [uploadedVideoFrameCount, setUploadedVideoFrameCount] = useState(0);
  const [lastUploadedVideoFrameId, setLastUploadedVideoFrameId] = useState(null);
  const [lastVideoUploadedAt, setLastVideoUploadedAt] = useState(null);
  const [nextVideoFrameSeq, setNextVideoFrameSeq] = useState(1);
  const modalVideoRef = useRef(null);
  const mainVideoRef = useRef(null);
  const autoRestoreAttemptedRef = useRef(false);

  // 麦克风状态管理
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);

  // 用户登录/注册状态管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'

  const [sessionState, setSessionState] = useState(null);
  const [sessionRequestState, setSessionRequestState] = useState('idle');
  const [sessionStatusMessage, setSessionStatusMessage] = useState('');
  const [sessionErrorMessage, setSessionErrorMessage] = useState('');
  const [storedSessionId, setStoredSessionId] = useState(null);
  const [clientSeq, setClientSeq] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState(null);
  const [textSubmitState, setTextSubmitState] = useState('idle');
  const [dialogueReplyState, setDialogueReplyState] = useState('idle');
  const [pendingMessageId, setPendingMessageId] = useState(null);
  const [connectionStatusMessage, setConnectionStatusMessage] = useState('');
  const [partialTranscriptState, setPartialTranscriptState] = useState(createInitialPartialTranscriptState);
  const [finalTranscriptState, setFinalTranscriptState] = useState(createInitialFinalTranscriptState);
  const [affectSnapshot, setAffectSnapshot] = useState(createInitialAffectSnapshot);
  const [affectHistory, setAffectHistory] = useState([]);
  const [knowledgeState, setKnowledgeState] = useState(createInitialKnowledgeState);

  const socketRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const manualCloseRef = useRef(false);
  const connectionTokenRef = useRef(0);
  const connectRealtimeRef = useRef(null);
  const shouldRecoverOnNextConnectRef = useRef(false);
  const sessionStateRef = useRef(sessionState);
  const connectionStatusRef = useRef(connectionStatus);
  const textSubmitStateRef = useRef(textSubmitState);
  const pendingMessageIdRef = useRef(pendingMessageId);
  const recordingStateRef = useRef(recordingState);
  const audioUploadStateRef = useRef(audioUploadState);
  const recordingDurationMsRef = useRef(recordingDurationMs);
  const recordingChunkCountRef = useRef(recordingChunkCount);
  const micStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedAudioPartsRef = useRef([]);
  const pendingAudioUploadsRef = useRef(0);
  const previewInFlightRef = useRef(false);
  const finalizingAudioRef = useRef(false);
  const recordingTimerRef = useRef(null);
  const currentRecordingIdRef = useRef(null);
  const completedRecordingIdRef = useRef(null);
  const nextAudioChunkSeqRef = useRef(1);
  const nextPreviewSeqRef = useRef(1);
  const lastPreviewChunkCountRef = useRef(0);
  const recordingStartedAtMsRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const cameraStateRef = useRef(cameraState);
  const videoUploadStateRef = useRef(videoUploadState);
  const uploadedVideoFrameCountRef = useRef(uploadedVideoFrameCount);
  const nextVideoFrameSeqRef = useRef(nextVideoFrameSeq);
  const cameraStreamRef = useRef(null);
  const cameraFrameTimerRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraModalAutoStartRef = useRef(false);
  const pendingVideoUploadsRef = useRef(0);
  const affectRequestTokenRef = useRef(0);
  const affectRefreshTimerRef = useRef(null);
  const affectSnapshotTimestampRef = useRef(0);
  const pendingSessionAffectReasonRef = useRef(null);

  const runtimeConfig = useMemo(
    () => ({
      apiBaseUrl: appConfig?.apiBaseUrl || 'http://127.0.0.1:8000',
      wsUrl: appConfig?.wsUrl || 'ws://127.0.0.1:8000/ws',
      ttsBaseUrl: appConfig?.ttsBaseUrl || 'http://127.0.0.1:8040',
      affectBaseUrl: appConfig?.affectBaseUrl || 'http://127.0.0.1:8060',
      defaultAvatarId: appConfig?.defaultAvatarId || 'companion_female_01',
      activeSessionStorageKey:
        appConfig?.activeSessionStorageKey || 'virtual-human-active-session-id',
      exportCacheStorageKey:
        appConfig?.exportCacheStorageKey || 'virtual-human-last-export',
      heartbeatIntervalMs:
        Number.isFinite(Number(appConfig?.heartbeatIntervalMs)) && Number(appConfig?.heartbeatIntervalMs) > 0
          ? Number(appConfig.heartbeatIntervalMs)
          : 5000,
      reconnectDelayMs:
        Number.isFinite(Number(appConfig?.reconnectDelayMs)) && Number(appConfig?.reconnectDelayMs) > 0
          ? Number(appConfig.reconnectDelayMs)
          : 1000,
      enableAudioPreview: appConfig?.enableAudioPreview !== false,
      enableAudioFinalize: appConfig?.enableAudioFinalize !== false,
      audioPreviewChunkThreshold:
        Number.isFinite(Number(appConfig?.audioPreviewChunkThreshold)) && Number(appConfig?.audioPreviewChunkThreshold) > 0
          ? Number(appConfig.audioPreviewChunkThreshold)
          : 2,
      videoFrameUploadIntervalMs:
        Number.isFinite(Number(appConfig?.videoFrameUploadIntervalMs)) && Number(appConfig?.videoFrameUploadIntervalMs) > 0
          ? Number(appConfig.videoFrameUploadIntervalMs)
          : 1800,
      sourceLabel: appConfig?.sourceLabel || 'built-in defaults',
    }),
    [appConfig],
  );

  const activeSessionId = sessionState?.session?.session_id || null;
  const activeTraceId = sessionState?.session?.trace_id || null;

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const clearCameraFrameTimer = useCallback(() => {
    if (cameraFrameTimerRef.current) {
      window.clearInterval(cameraFrameTimerRef.current);
      cameraFrameTimerRef.current = null;
    }
  }, []);

  const clearAffectRefreshTimer = useCallback(() => {
    if (affectRefreshTimerRef.current) {
      window.clearTimeout(affectRefreshTimerRef.current);
      affectRefreshTimerRef.current = null;
    }
  }, []);

  const teardownCamera = useCallback((stopTracks = true) => {
    clearCameraFrameTimer();

    [modalVideoRef.current, mainVideoRef.current].forEach((videoElement) => {
      if (!videoElement) {
        return;
      }
      try {
        if (typeof videoElement.pause === 'function') {
          videoElement.pause();
        }
      } catch (error) {
        // Ignore preview shutdown races.
      }
      if ('srcObject' in videoElement) {
        videoElement.srcObject = null;
      }
    });

    const stream = cameraStreamRef.current;
    if (stopTracks && stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
      });
      cameraStreamRef.current = null;
    }
  }, [clearCameraFrameTimer]);

  const teardownMicrophone = useCallback(() => {
    clearRecordingTimer();
    stopRequestedRef.current = true;
    pendingAudioUploadsRef.current = 0;
    recordedAudioPartsRef.current = [];
    previewInFlightRef.current = false;
    finalizingAudioRef.current = false;
    lastPreviewChunkCountRef.current = 0;
    nextPreviewSeqRef.current = 1;
    nextAudioChunkSeqRef.current = 1;
    currentRecordingIdRef.current = null;
    completedRecordingIdRef.current = null;
    recordingStartedAtMsRef.current = null;
    recordingDurationMsRef.current = 0;
    recordingChunkCountRef.current = 0;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        // Ignore stop races during teardown.
      }
    }
    mediaRecorderRef.current = null;

    const stream = micStreamRef.current;
    micStreamRef.current = null;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
      });
    }

    setMicPermissionState('idle');
    setMicPermissionMessage('');
    setRecordingState('idle');
    setAudioUploadState('idle');
    setAudioUploadMessage('');
    setRecordingDurationMs(0);
    setRecordingChunkCount(0);
    setLastUploadedAt(null);
    setLastUploadedMediaId(null);
  }, [clearRecordingTimer]);

  const pushAffectHistory = useCallback((snapshot) => {
    if (!snapshot || snapshot.fusion?.emotionState === 'pending') {
      return;
    }
    setAffectHistory((previous) => {
      const nextItem = {
        id: `${snapshot.generatedAt || 'pending'}-${snapshot.sourceContext?.recordId || 'unknown'}`,
        generatedAt: snapshot.generatedAt || new Date().toISOString(),
        emotion: snapshot.fusion?.emotionState || 'pending',
        detail: snapshot.fusion?.detail || snapshot.text?.detail || snapshot.audio?.detail || snapshot.video?.detail || '',
        riskLevel: snapshot.fusion?.riskLevel || 'pending',
      };
      const filtered = previous.filter((item) => item.id !== nextItem.id);
      return [nextItem, ...filtered].slice(0, 8);
    });
  }, []);

  const applyAffectSnapshot = useCallback((snapshot, options = {}) => {
    if (!snapshot) {
      return;
    }
    const nextTimestamp = typeof options.timestamp === 'number'
      ? options.timestamp
      : Date.now();
    if (nextTimestamp < affectSnapshotTimestampRef.current) {
      return;
    }
    affectSnapshotTimestampRef.current = nextTimestamp;
    setAffectSnapshot(snapshot);
    pushAffectHistory(snapshot);
  }, [pushAffectHistory]);

  const finalizeVideoUploadState = useCallback((nextCameraState = cameraStateRef.current) => {
    const currentUploadState = videoUploadStateRef.current;
    const currentUploadedCount = uploadedVideoFrameCountRef.current;
    const currentSessionId = sessionStateRef.current?.session?.session_id || null;
    if (currentUploadState === 'error') {
      return;
    }

    if (!currentSessionId) {
      setVideoUploadState(nextCameraState === 'previewing' ? 'local_only' : 'idle');
      setVideoUploadMessage(
        nextCameraState === 'previewing'
          ? 'No active session. Camera preview stays local-only.'
          : 'No video frames uploaded yet.',
      );
      return;
    }

    if (nextCameraState === 'previewing' || pendingVideoUploadsRef.current > 0) {
      setVideoUploadState('uploading');
      setVideoUploadMessage(
        pendingVideoUploadsRef.current > 0
          ? `Uploading video frames. ${currentUploadedCount} completed, ${pendingVideoUploadsRef.current} still in flight.`
          : `Camera preview active. Uploaded ${currentUploadedCount} video frames.`,
      );
      return;
    }

    setVideoUploadState(currentUploadedCount > 0 ? 'completed' : 'idle');
    setVideoUploadMessage(
      currentUploadedCount > 0
        ? `Video frame upload complete. Uploaded ${currentUploadedCount} frames.`
        : 'No video frames uploaded yet.',
    );
  }, []);

  const buildAffectRequestPayload = useCallback((reason) => {
    const currentSourceContext = affectSnapshot?.sourceContext || null;
    return {
      session_id: activeSessionId,
      trace_id: activeTraceId,
      current_stage: sessionStateRef.current?.session?.stage || 'engage',
      text_input: finalTranscriptState.text || inputText.trim(),
      last_source_kind: finalTranscriptState.sourceKind || 'text',
      metadata: {
        source: currentSourceContext?.origin && currentSourceContext.origin !== 'live_web_session'
          ? currentSourceContext.origin
          : 'web-shell',
        refresh_reason: reason || 'manual_refresh',
        dataset: currentSourceContext?.dataset || 'live_web',
        record_id: currentSourceContext?.recordId && currentSourceContext.recordId !== 'pending'
          ? currentSourceContext.recordId
          : `session/${activeSessionId || 'pending'}`,
        sample_note: currentSourceContext?.note || 'Waiting for session sample information.',
      },
      capture_state: {
        camera_state: cameraState,
        video_upload_state: videoUploadState,
        uploaded_video_frame_count: uploadedVideoFrameCount,
        recording_state: recordingState,
        audio_upload_state: audioUploadState,
        uploaded_chunk_count: recordingChunkCount,
      },
    };
  }, [activeSessionId, activeTraceId, affectSnapshot, audioUploadState, cameraState, finalTranscriptState.sourceKind, finalTranscriptState.text, inputText, recordingChunkCount, recordingState, uploadedVideoFrameCount, videoUploadState]);

  const refreshAffectPanel = useCallback(async (reason) => {
    if (!activeSessionId) {
      return null;
    }

    const requestToken = affectRequestTokenRef.current + 1;
    const requestStartedAt = Date.now();
    affectRequestTokenRef.current = requestToken;
    setAffectSnapshot((previous) => ({
      ...previous,
      panelState: 'loading',
      panelMessage: 'Refreshing affect panel.',
    }));

    try {
      const payload = await requestAffectAnalysis(runtimeConfig.affectBaseUrl, buildAffectRequestPayload(reason));
      if (requestToken !== affectRequestTokenRef.current) {
        return null;
      }
      const normalized = normalizeAffectPayload(payload);
      if (!normalized) {
        if (requestStartedAt < affectSnapshotTimestampRef.current) {
          return null;
        }
        setAffectSnapshot((previous) => ({
          ...previous,
          panelState: 'error',
          panelMessage: 'Affect payload was invalid. Keeping the previous snapshot.',
        }));
        return null;
      }
      applyAffectSnapshot(normalized, { timestamp: requestStartedAt });
      return normalized;
    } catch (error) {
      if (requestToken !== affectRequestTokenRef.current || requestStartedAt < affectSnapshotTimestampRef.current) {
        return null;
      }
      setAffectSnapshot((previous) => ({
        ...previous,
        panelState: 'error',
        panelMessage: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }
  }, [activeSessionId, applyAffectSnapshot, buildAffectRequestPayload, runtimeConfig.affectBaseUrl]);

  const scheduleAffectRefresh = useCallback((reason, delayMs = 180) => {
    if (!activeSessionId) {
      pendingSessionAffectReasonRef.current = reason || pendingSessionAffectReasonRef.current;
      return;
    }
    clearAffectRefreshTimer();
    const nextReason = reason || pendingSessionAffectReasonRef.current || 'scheduled_refresh';
    pendingSessionAffectReasonRef.current = null;
    affectRefreshTimerRef.current = window.setTimeout(() => {
      affectRefreshTimerRef.current = null;
      void refreshAffectPanel(nextReason);
    }, delayMs);
  }, [activeSessionId, clearAffectRefreshTimer, refreshAffectPanel]);

  const applySessionSnapshot = useCallback((payload, statusMessage) => {
    const normalizedPayload = normalizeSessionStatePayload(payload);
    const nextSessionId = normalizedPayload?.session?.session_id || null;
    const nextMessages = normalizedPayload.messages;
    const nextUserMessageCount = nextMessages.filter((message) => message?.role === 'user').length;

    autoRestoreAttemptedRef.current = true;
    shouldRecoverOnNextConnectRef.current = false;
    sessionStateRef.current = normalizedPayload;
    setSessionState(normalizedPayload);
    setSessionErrorMessage('');
    setSessionStatusMessage(statusMessage || t.sessionReady);
    pendingMessageIdRef.current = null;
    textSubmitStateRef.current = 'idle';
    setStoredSessionId(nextSessionId);
    setClientSeq(nextUserMessageCount + 1);
    setTextSubmitState('idle');
    setDialogueReplyState('idle');
    setPendingMessageId(null);
    setLastHeartbeatAt(null);
    setConnectionStatusMessage('');
    setPartialTranscriptState(createInitialPartialTranscriptState());
    setFinalTranscriptState(createInitialFinalTranscriptState());
    affectRequestTokenRef.current += 1;
    affectSnapshotTimestampRef.current = 0;
    setAffectSnapshot(createInitialAffectSnapshot());
    setAffectHistory([]);
    setKnowledgeState(createInitialKnowledgeState());

    if (nextSessionId) {
      writeStoredSessionId(runtimeConfig.activeSessionStorageKey, nextSessionId);
    }
    if (nextSessionId) {
      scheduleAffectRefresh('session_snapshot_applied', 40);
    }
  }, [runtimeConfig.activeSessionStorageKey, scheduleAffectRefresh, t.sessionReady]);

  const recoverInFlightTurnFromState = useCallback((payload) => {
    const normalizedPayload = normalizeSessionStatePayload(payload);
    const nextSessionId = normalizedPayload?.session?.session_id || null;
    const nextMessages = normalizedPayload.messages;
    const nextUserMessageCount = nextMessages.filter((message) => message?.role === 'user').length;
    const currentTurnState = textSubmitStateRef.current;
    const expectedPendingMessageId = pendingMessageIdRef.current;
    const acceptedIndex = expectedPendingMessageId
      ? nextMessages.findIndex((message) => message?.message_id === expectedPendingMessageId)
      : -1;
    const hasAssistantAfterPending = acceptedIndex >= 0
      && nextMessages.slice(acceptedIndex + 1).some((message) => message?.role === 'assistant');
    const latestUserIndex = (() => {
      for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
        if (nextMessages[index]?.role === 'user') {
          return index;
        }
      }
      return -1;
    })();
    const hasAssistantAfterLatestUser = latestUserIndex >= 0
      && nextMessages.slice(latestUserIndex + 1).some((message) => message?.role === 'assistant');

    autoRestoreAttemptedRef.current = true;
    shouldRecoverOnNextConnectRef.current = false;
    sessionStateRef.current = normalizedPayload;
    setSessionState(normalizedPayload);
    setStoredSessionId(nextSessionId);
    setClientSeq(nextUserMessageCount + 1);
    setSessionErrorMessage('');

    if (nextSessionId) {
      writeStoredSessionId(runtimeConfig.activeSessionStorageKey, nextSessionId);
    }

    if (currentTurnState === 'awaiting_ack' && acceptedIndex === -1 && expectedPendingMessageId) {
      pendingMessageIdRef.current = expectedPendingMessageId;
      textSubmitStateRef.current = 'awaiting_ack';
      setPendingMessageId(expectedPendingMessageId);
      setTextSubmitState('awaiting_ack');
      setDialogueReplyState('idle');
      setSessionStatusMessage(t.sessionSubmitting);
      return;
    }

    if (currentTurnState === 'awaiting_ack' && acceptedIndex >= 0 && !hasAssistantAfterPending) {
      pendingMessageIdRef.current = null;
      textSubmitStateRef.current = 'awaiting_reply';
      setPendingMessageId(null);
      setTextSubmitState('awaiting_reply');
      setDialogueReplyState('idle');
      setSessionStatusMessage(t.sessionSubmitting);
      return;
    }

    if (
      (currentTurnState === 'awaiting_ack' && hasAssistantAfterPending)
      || (currentTurnState === 'awaiting_reply' && hasAssistantAfterLatestUser)
    ) {
      pendingMessageIdRef.current = null;
      textSubmitStateRef.current = 'idle';
      setPendingMessageId(null);
      setTextSubmitState('idle');
      setDialogueReplyState('received');
      setSessionStatusMessage(t.sessionSubmitSuccess);
      return;
    }

    if (currentTurnState === 'awaiting_reply' && latestUserIndex >= 0) {
      pendingMessageIdRef.current = null;
      textSubmitStateRef.current = 'awaiting_reply';
      setPendingMessageId(null);
      setTextSubmitState('awaiting_reply');
      setDialogueReplyState('idle');
      setSessionStatusMessage(t.sessionSubmitting);
      return;
    }

    pendingMessageIdRef.current = null;
    textSubmitStateRef.current = 'idle';
    setPendingMessageId(null);
    setTextSubmitState('idle');
    setDialogueReplyState('idle');
    setSessionStatusMessage(t.sessionReady);
  }, [runtimeConfig.activeSessionStorageKey, t.sessionReady, t.sessionSubmitSuccess, t.sessionSubmitting]);

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const teardownRealtime = useCallback((manualClose = true) => {
    manualCloseRef.current = manualClose;
    clearReconnectTimer();
    clearHeartbeatTimer();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
      socket.close();
    }
  }, [clearHeartbeatTimer, clearReconnectTimer]);

  const invalidateLocalSession = useCallback(({
    nextSessionRequestState = 'idle',
    nextSessionStatusMessage = t.sessionIdle,
    nextSessionErrorMessage = '',
    nextConnectionStatus = 'idle',
    nextConnectionStatusMessage = '',
  } = {}) => {
    teardownRealtime(true);
    teardownMicrophone();
    teardownCamera(true);
    clearAffectRefreshTimer();
    clearStoredSessionId(runtimeConfig.activeSessionStorageKey);
    setInputText('');
    autoRestoreAttemptedRef.current = true;
    shouldRecoverOnNextConnectRef.current = false;
    connectionTokenRef.current += 1;
    affectRequestTokenRef.current += 1;
    affectSnapshotTimestampRef.current = 0;
    sessionStateRef.current = null;
    pendingMessageIdRef.current = null;
    textSubmitStateRef.current = 'idle';
    connectionStatusRef.current = nextConnectionStatus;
    pendingVideoUploadsRef.current = 0;
    pendingSessionAffectReasonRef.current = null;
    setStoredSessionId(null);
    setSessionState(null);
    setSessionRequestState(nextSessionRequestState);
    setSessionErrorMessage(nextSessionErrorMessage);
    setSessionStatusMessage(nextSessionStatusMessage);
    setClientSeq(1);
    setTextSubmitState('idle');
    setDialogueReplyState('idle');
    setPendingMessageId(null);
    setLastHeartbeatAt(null);
    setConnectionStatus(nextConnectionStatus);
    setConnectionStatusMessage(nextConnectionStatusMessage);
    setPartialTranscriptState(createInitialPartialTranscriptState());
    setFinalTranscriptState(createInitialFinalTranscriptState());
    setAffectSnapshot(createInitialAffectSnapshot());
    setAffectHistory([]);
    setKnowledgeState(createInitialKnowledgeState());
    setCameraPermissionState('idle');
    setCameraPermissionMessage('');
    setCameraState('idle');
    setCameraPreviewMessage('');
    setVideoUploadState('idle');
    setVideoUploadMessage('');
    setUploadedVideoFrameCount(0);
    setLastUploadedVideoFrameId(null);
    setLastVideoUploadedAt(null);
    setNextVideoFrameSeq(1);
    setIsCameraModalOpen(false);
  }, [clearAffectRefreshTimer, runtimeConfig.activeSessionStorageKey, t.sessionIdle, teardownCamera, teardownMicrophone, teardownRealtime]);

  const restoreSession = useCallback(async (targetSessionId) => {
    if (!targetSessionId) {
      setSessionErrorMessage('');
      setSessionStatusMessage(t.noStoredSession);
      return;
    }

    setSessionRequestState('restoring');
    setSessionErrorMessage('');
    setSessionStatusMessage(t.sessionRestoring);

    try {
      const payload = await requestSessionState(runtimeConfig.apiBaseUrl, targetSessionId);
      applySessionSnapshot(payload, t.sessionReady);
      setSessionRequestState('ready');
    } catch (error) {
      invalidateLocalSession({
        nextSessionRequestState: 'error',
        nextSessionStatusMessage: t.sessionRestoreFailed,
        nextSessionErrorMessage: error.message || t.sessionRestoreFailed,
      });
    }
  }, [runtimeConfig.apiBaseUrl, applySessionSnapshot, invalidateLocalSession, t.noStoredSession, t.sessionReady, t.sessionRestoreFailed, t.sessionRestoring]);

  useEffect(() => {
    const cachedSessionId = readStoredSessionId(runtimeConfig.activeSessionStorageKey);
    setStoredSessionId(cachedSessionId);
    setSessionStatusMessage(cachedSessionId ? t.restoreReady : t.sessionIdle);
  }, [runtimeConfig.activeSessionStorageKey, t.restoreReady, t.sessionIdle]);

  useEffect(() => {
    if (!storedSessionId || autoRestoreAttemptedRef.current) {
      return;
    }
    autoRestoreAttemptedRef.current = true;
    restoreSession(storedSessionId);
  }, [restoreSession, storedSessionId]);

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    textSubmitStateRef.current = textSubmitState;
  }, [textSubmitState]);

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  useEffect(() => {
    audioUploadStateRef.current = audioUploadState;
  }, [audioUploadState]);

  useEffect(() => {
    recordingDurationMsRef.current = recordingDurationMs;
  }, [recordingDurationMs]);

  useEffect(() => {
    recordingChunkCountRef.current = recordingChunkCount;
  }, [recordingChunkCount]);

  useEffect(() => {
    cameraStateRef.current = cameraState;
  }, [cameraState]);

  useEffect(() => {
    videoUploadStateRef.current = videoUploadState;
  }, [videoUploadState]);

  useEffect(() => {
    uploadedVideoFrameCountRef.current = uploadedVideoFrameCount;
  }, [uploadedVideoFrameCount]);

  useEffect(() => {
    nextVideoFrameSeqRef.current = nextVideoFrameSeq;
  }, [nextVideoFrameSeq]);

  useEffect(() => {
    if (!activeSessionId || !pendingSessionAffectReasonRef.current || affectRefreshTimerRef.current) {
      return;
    }
    scheduleAffectRefresh(pendingSessionAffectReasonRef.current, 40);
  }, [activeSessionId, scheduleAffectRefresh]);

  useEffect(() => {
    pendingMessageIdRef.current = pendingMessageId;
  }, [pendingMessageId]);

  const sendHeartbeat = useCallback((connectionToken = connectionTokenRef.current) => {
    const socket = socketRef.current;
    if (!socket || connectionToken !== connectionTokenRef.current) {
      return;
    }

    if (typeof window?.WebSocket !== 'function' || socket.readyState !== window.WebSocket.OPEN) {
      return;
    }

    const activeSession = sessionStateRef.current?.session;
    if (!activeSession?.session_id) {
      return;
    }

    socket.send(
      JSON.stringify(buildHeartbeatMessage(activeSession.session_id, activeSession.trace_id)),
    );
  }, []);

  const applyRealtimeEnvelope = useCallback((envelope) => {
    if (!envelope || typeof envelope !== 'object') {
      return;
    }

    const activeSessionId = sessionStateRef.current?.session?.session_id;
    if (activeSessionId && envelope.session_id && envelope.session_id !== activeSessionId) {
      return;
    }

    if (envelope.event_type === 'session.connection.ready') {
      setConnectionStatus('connected');
      setConnectionStatusMessage('realtime ready');
      if (
        shouldRecoverOnNextConnectRef.current
        && activeSessionId
        && (textSubmitStateRef.current === 'awaiting_ack' || textSubmitStateRef.current === 'awaiting_reply')
      ) {
        shouldRecoverOnNextConnectRef.current = false;
        void requestSessionState(runtimeConfig.apiBaseUrl, activeSessionId)
          .then((payload) => {
            recoverInFlightTurnFromState(payload);
            setSessionRequestState('ready');
          })
          .catch((error) => {
            setSessionErrorMessage(error.message || t.sessionRestoreFailed);
            setSessionStatusMessage(error.message || t.sessionRestoreFailed);
            setTextSubmitState('error');
            setDialogueReplyState('error');
          });
      } else {
        shouldRecoverOnNextConnectRef.current = false;
      }
      return;
    }

    if (envelope.event_type === 'session.heartbeat') {
      const heartbeatTime = envelope?.payload?.server_time || envelope?.emitted_at || null;
      setConnectionStatus('connected');
      setLastHeartbeatAt(heartbeatTime);
      setConnectionStatusMessage('heartbeat acknowledged');
      return;
    }

    if (envelope.event_type === 'transcript.partial') {
      const partialTranscript = validateTranscriptPartialPayload(envelope.payload || null);
      if (!partialTranscript) {
        return;
      }
      if (
        completedRecordingIdRef.current
        && partialTranscript.recordingId === completedRecordingIdRef.current
        && audioUploadStateRef.current === 'completed'
      ) {
        return;
      }
      if (
        currentRecordingIdRef.current
        && partialTranscript.recordingId !== currentRecordingIdRef.current
      ) {
        return;
      }

      setPartialTranscriptState((previousState) => {
        if (
          previousState.recordingId
          && partialTranscript.recordingId !== previousState.recordingId
          && currentRecordingIdRef.current !== partialTranscript.recordingId
        ) {
          return previousState;
        }
        if (partialTranscript.previewSeq < previousState.previewSeq) {
          return previousState;
        }
        return {
          status: 'streaming',
          text: partialTranscript.text,
          previewSeq: partialTranscript.previewSeq,
          recordingId: partialTranscript.recordingId,
          updatedAt: partialTranscript.generatedAt || envelope?.emitted_at || null,
          language: partialTranscript.language,
          confidence: partialTranscript.confidence,
        };
      });
      setConnectionStatusMessage(`partial transcript ${partialTranscript.previewSeq}`);
      return;
    }

    if (envelope.event_type === 'transcript.final') {
      const finalTranscript = validateTranscriptFinalPayload(envelope.payload || null);
      if (!finalTranscript) {
        return;
      }
      if (
        currentRecordingIdRef.current
        && finalTranscript.recordingId
        && finalTranscript.recordingId !== currentRecordingIdRef.current
      ) {
        return;
      }

      setPartialTranscriptState(createInitialPartialTranscriptState());
      setFinalTranscriptState({
        text: finalTranscript.text,
        messageId: finalTranscript.messageId,
        sourceKind: finalTranscript.sourceKind,
        recordingId: finalTranscript.recordingId,
        updatedAt: finalTranscript.generatedAt || envelope?.emitted_at || null,
        language: finalTranscript.language,
        confidence: finalTranscript.confidence,
      });
      setConnectionStatusMessage('final transcript received');
      return;
    }

    if (envelope.event_type === 'message.accepted') {
      const acceptedMessage = buildAcceptedMessageFromEnvelope(envelope);
      if (!acceptedMessage) {
        setTextSubmitState('error');
        setSessionErrorMessage('Invalid message.accepted payload.');
        setSessionStatusMessage('Invalid message.accepted payload.');
        return;
      }

      setSessionState((previousState) => {
        const baseState = normalizeSessionStatePayload(previousState);
        return {
          session: baseState.session
            ? {
              ...baseState.session,
              status: 'active',
              updated_at: acceptedMessage.submitted_at || envelope?.emitted_at || baseState.session.updated_at,
            }
            : baseState.session,
          messages: upsertMessageById(baseState.messages, acceptedMessage),
        };
      });
      pendingMessageIdRef.current = null;
      setPendingMessageId(null);
      setInputText('');
      setSessionErrorMessage('');
      if (acceptedMessage.source_kind === 'audio') {
        completedRecordingIdRef.current = currentRecordingIdRef.current;
        currentRecordingIdRef.current = null;
        lastPreviewChunkCountRef.current = 0;
        nextPreviewSeqRef.current = 1;
        setPartialTranscriptState(createInitialPartialTranscriptState());
        setAudioUploadState('completed');
        setAudioUploadMessage(`Audio message accepted: ${acceptedMessage.message_id || 'message.accepted'}`);
        textSubmitStateRef.current = 'awaiting_reply';
        setTextSubmitState('awaiting_reply');
        setDialogueReplyState('idle');
        setSessionStatusMessage(t.sessionSubmitting);
      } else {
        textSubmitStateRef.current = 'awaiting_reply';
        setTextSubmitState('awaiting_reply');
        setDialogueReplyState('idle');
        setSessionStatusMessage(t.sessionSubmitting);
      }
      return;
    }

    if (envelope.event_type === 'affect.snapshot') {
      const nextAffectSnapshot = normalizeAffectPayload(envelope.payload || null);
      if (!nextAffectSnapshot) {
        return;
      }

      applyAffectSnapshot(nextAffectSnapshot, { timestamp: Date.now() + 1 });
      setConnectionStatusMessage('affect snapshot received');
      return;
    }

    if (envelope.event_type === 'knowledge.retrieved') {
      const nextKnowledgeState = normalizeKnowledgeRetrievedPayload(envelope.payload || null);
      if (!nextKnowledgeState) {
        return;
      }

      setKnowledgeState(nextKnowledgeState);
      setConnectionStatusMessage(
        nextKnowledgeState.sourceIds.length
          ? `knowledge retrieved: ${nextKnowledgeState.sourceIds.join(', ')}`
          : 'knowledge retrieved',
      );
      return;
    }

    if (envelope.event_type === 'dialogue.reply') {
      const replyMessage = buildReplyMessageFromEnvelope(envelope);
      if (!replyMessage) {
        setDialogueReplyState('invalid');
        setSessionErrorMessage('Invalid dialogue.reply payload.');
        setSessionStatusMessage('Invalid dialogue.reply payload.');
        return;
      }

      setSessionState((previousState) => {
        const baseState = normalizeSessionStatePayload(previousState);
        return {
          session: baseState.session
            ? {
              ...baseState.session,
              status: 'active',
              stage: replyMessage.metadata?.stage || baseState.session.stage,
              updated_at: replyMessage.submitted_at || envelope?.emitted_at || baseState.session.updated_at,
            }
            : baseState.session,
          messages: upsertMessageById(baseState.messages, replyMessage),
        };
      });
      pendingMessageIdRef.current = null;
      textSubmitStateRef.current = 'idle';
      setPendingMessageId(null);
      setTextSubmitState('idle');
      setDialogueReplyState('received');
      setSessionErrorMessage('');
      setSessionStatusMessage(t.sessionSubmitSuccess);
      setKnowledgeState((previousState) => ({
        ...previousState,
        groundedRefs: Array.isArray(envelope?.payload?.knowledge_refs)
          ? envelope.payload.knowledge_refs.filter((item) => typeof item === 'string' && item.trim())
          : previousState.groundedRefs,
      }));
      return;
    }

    if (envelope.event_type === 'session.error') {
      const errorPayload = envelope?.payload && typeof envelope.payload === 'object'
        ? envelope.payload
        : {};
      const errorCode = typeof errorPayload.error_code === 'string' ? errorPayload.error_code : 'session_error';
      const errorMessage = typeof errorPayload.message === 'string' && errorPayload.message.trim()
        ? errorPayload.message.trim()
        : errorCode;
      setSessionErrorMessage(errorMessage);
      setSessionStatusMessage(errorMessage);
      setConnectionStatusMessage(`error: ${errorCode}`);
      if (textSubmitStateRef.current !== 'idle' || errorCode.startsWith('dialogue_')) {
        setTextSubmitState('error');
        setDialogueReplyState('error');
      }
    }
  }, [applyAffectSnapshot, recoverInFlightTurnFromState, runtimeConfig.apiBaseUrl, t.sessionRestoreFailed, t.sessionSubmitSuccess, t.sessionSubmitting]);

  const connectRealtime = useCallback(() => {
    const activeSession = sessionStateRef.current?.session;
    if (!activeSession?.session_id || !activeSession?.trace_id) {
      return;
    }

    if (typeof window?.WebSocket !== 'function') {
      setConnectionStatus('unsupported');
      setConnectionStatusMessage('WebSocket unsupported in current runtime');
      return;
    }

    teardownRealtime(false);
    manualCloseRef.current = false;
    clearReconnectTimer();
    clearHeartbeatTimer();
    connectionTokenRef.current += 1;
    const connectionToken = connectionTokenRef.current;
    const socketUrl = buildRealtimeSocketUrl(
      runtimeConfig.wsUrl,
      activeSession.session_id,
      activeSession.trace_id,
    );
    const socket = new window.WebSocket(socketUrl);
    socketRef.current = socket;
    setConnectionStatus(
      connectionStatusRef.current === 'reconnecting' ? 'reconnecting' : 'connecting',
    );
    setConnectionStatusMessage(socketUrl);

    socket.addEventListener('open', () => {
      if (connectionToken !== connectionTokenRef.current) {
        return;
      }
      setConnectionStatus('connected');
      setConnectionStatusMessage('socket connected');
      sendHeartbeat(connectionToken);
      clearHeartbeatTimer();
      heartbeatTimerRef.current = window.setInterval(() => {
        sendHeartbeat(connectionToken);
      }, runtimeConfig.heartbeatIntervalMs);
    });

    socket.addEventListener('message', (event) => {
      if (connectionToken !== connectionTokenRef.current) {
        return;
      }
      try {
        applyRealtimeEnvelope(JSON.parse(event.data));
      } catch (error) {
        setSessionErrorMessage('Received invalid realtime payload.');
        setSessionStatusMessage('Received invalid realtime payload.');
      }
    });

    socket.addEventListener('error', () => {
      if (connectionToken !== connectionTokenRef.current) {
        return;
      }
      setConnectionStatusMessage('socket transport error');
    });

    socket.addEventListener('close', (event) => {
      if (connectionToken !== connectionTokenRef.current) {
        return;
      }
      clearHeartbeatTimer();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      if (manualCloseRef.current) {
        return;
      }
      if (isTerminalRealtimeClose(event)) {
        const closeReason = event?.reason || 'session_not_found';
        invalidateLocalSession({
          nextSessionRequestState: 'error',
          nextSessionStatusMessage: closeReason,
          nextSessionErrorMessage: closeReason,
          nextConnectionStatus: 'closed',
          nextConnectionStatusMessage: closeReason,
        });
        return;
      }

      const needsInFlightRecovery = textSubmitStateRef.current === 'awaiting_ack'
        || textSubmitStateRef.current === 'awaiting_reply';
      shouldRecoverOnNextConnectRef.current = needsInFlightRecovery;
      setConnectionStatus('reconnecting');
      setConnectionStatusMessage(`reconnect scheduled (${runtimeConfig.reconnectDelayMs}ms)`);
      clearReconnectTimer();
      reconnectTimerRef.current = window.setTimeout(() => {
        if (connectionToken !== connectionTokenRef.current) {
          return;
        }
        connectRealtimeRef.current?.();
      }, runtimeConfig.reconnectDelayMs);
    });
  }, [applyRealtimeEnvelope, clearHeartbeatTimer, clearReconnectTimer, invalidateLocalSession, runtimeConfig.heartbeatIntervalMs, runtimeConfig.reconnectDelayMs, runtimeConfig.wsUrl, sendHeartbeat, teardownRealtime]);

  useEffect(() => {
    connectRealtimeRef.current = connectRealtime;
  }, [connectRealtime]);

  useEffect(() => () => {
    teardownMicrophone();
    teardownCamera(true);
    clearAffectRefreshTimer();
  }, [clearAffectRefreshTimer, teardownCamera, teardownMicrophone]);

  useEffect(() => {
    if (!activeSessionId || !activeTraceId) {
      teardownRealtime(true);
      teardownMicrophone();
      teardownCamera(true);
      clearAffectRefreshTimer();
      setLastHeartbeatAt(null);
      if (typeof window?.WebSocket === 'function') {
        if (connectionStatusRef.current === 'closed') {
          setConnectionStatus('closed');
        } else {
          setConnectionStatus('idle');
          setConnectionStatusMessage('');
        }
      } else {
        setConnectionStatus('unsupported');
        setConnectionStatusMessage('WebSocket unsupported in current runtime');
      }
      return undefined;
    }

    connectRealtime();
    return () => {
      teardownRealtime(true);
    };
  }, [activeSessionId, activeTraceId, clearAffectRefreshTimer, connectRealtime, teardownCamera, teardownMicrophone, teardownRealtime]);

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

  const requestCameraAccess = useCallback(async () => {
    if (cameraStateRef.current === 'previewing') {
      return true;
    }

    if (!navigator?.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraPermissionState('unsupported');
      setCameraPermissionMessage('Current browser does not support camera capture.');
      setCameraState('error');
      setCameraPreviewMessage('Camera is unavailable in this runtime.');
      if (activeSessionId) {
        scheduleAffectRefresh('camera_permission_changed', 120);
      }
      return false;
    }

    setCameraPermissionState('requesting');
    setCameraPermissionMessage('Requesting camera access.');

    try {
      if (!cameraStreamRef.current) {
        cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
      }
      setCameraPermissionState('granted');
      setCameraPermissionMessage('Camera access granted.');
      if (activeSessionId) {
        scheduleAffectRefresh('camera_permission_changed', 120);
      }
      return true;
    } catch (error) {
      const errorName = error && typeof error === 'object' ? error.name : '';
      setCameraState('error');
      setCameraPreviewMessage('Camera is unavailable.');
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setCameraPermissionState('denied');
        setCameraPermissionMessage('Camera permission was denied.');
      } else {
        setCameraPermissionState('error');
        setCameraPermissionMessage(error instanceof Error ? error.message : String(error));
      }
      if (activeSessionId) {
        scheduleAffectRefresh('camera_permission_changed', 120);
      }
      return false;
    }
  }, [activeSessionId, scheduleAffectRefresh]);

  const buildVideoFramePayload = useCallback(async () => {
    const videoElement = modalVideoRef.current || mainVideoRef.current;
    const fallbackWidth = videoElement?.videoWidth || 640;
    const fallbackHeight = videoElement?.videoHeight || 360;
    const BlobCtor = window?.Blob || Blob;

    if (videoElement && typeof document?.createElement === 'function') {
      const canvas = cameraCanvasRef.current || document.createElement('canvas');
      cameraCanvasRef.current = canvas;
      canvas.width = fallbackWidth;
      canvas.height = fallbackHeight;
      const context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (context && typeof context.drawImage === 'function') {
        try {
          context.drawImage(videoElement, 0, 0, fallbackWidth, fallbackHeight);
        } catch (error) {
          // Ignore draw failures and fallback below.
        }
      }
      if (typeof canvas.toBlob === 'function') {
        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', 0.82);
        });
        if (blob) {
          return {
            blob,
            mimeType: blob.type || 'image/jpeg',
            width: fallbackWidth,
            height: fallbackHeight,
          };
        }
      }
    }

    if (typeof BlobCtor !== 'function') {
      return null;
    }

    return {
      blob: new BlobCtor([
        JSON.stringify({
          frame_seq: nextVideoFrameSeqRef.current,
          captured_at_ms: Date.now(),
          camera_state: cameraStateRef.current,
        }),
      ], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      width: fallbackWidth,
      height: fallbackHeight,
    };
  }, []);

  const uploadVideoFrame = useCallback(async (payload) => {
    if (!activeSessionId) {
      setVideoUploadState('local_only');
      setVideoUploadMessage('No active session. Camera preview stays local-only.');
      return null;
    }

    pendingVideoUploadsRef.current += 1;
    setVideoUploadState('uploading');
    setVideoUploadMessage(`Uploading video frame ${payload.frameSeq}.`);

    try {
      const responsePayload = await requestVideoFrameUpload(runtimeConfig.apiBaseUrl, activeSessionId, payload);
      setUploadedVideoFrameCount((previous) => previous + 1);
      setLastUploadedVideoFrameId(responsePayload?.media_id || null);
      setLastVideoUploadedAt(responsePayload?.created_at || new Date().toISOString());
      if (payload.frameSeq <= 2) {
        scheduleAffectRefresh('video_frame_uploaded', 120);
      }
      return responsePayload;
    } catch (error) {
      setVideoUploadState('error');
      setVideoUploadMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      pendingVideoUploadsRef.current = Math.max(0, pendingVideoUploadsRef.current - 1);
      finalizeVideoUploadState();
    }
  }, [activeSessionId, finalizeVideoUploadState, runtimeConfig.apiBaseUrl, scheduleAffectRefresh]);

  const captureAndUploadVideoFrame = useCallback(async () => {
    if (cameraStateRef.current !== 'previewing') {
      return null;
    }

    const payload = await buildVideoFramePayload();
    if (!payload) {
      setVideoUploadState('error');
      setVideoUploadMessage('Current browser does not support video frame serialization.');
      return null;
    }

    const frameSeq = nextVideoFrameSeqRef.current;
    nextVideoFrameSeqRef.current += 1;
    setNextVideoFrameSeq(nextVideoFrameSeqRef.current);
    return uploadVideoFrame({
      blob: payload.blob,
      frameSeq,
      capturedAtMs: Date.now(),
      width: payload.width,
      height: payload.height,
      mimeType: payload.mimeType,
    });
  }, [buildVideoFramePayload, uploadVideoFrame]);

  const startCameraPreview = useCallback(async () => {
    if (cameraStateRef.current === 'previewing') {
      return true;
    }

    const granted = await requestCameraAccess();
    if (!granted || !cameraStreamRef.current) {
      setCameraState('error');
      setCameraPreviewMessage('Camera is not ready for preview.');
      return false;
    }

    [modalVideoRef.current, mainVideoRef.current].forEach((videoElement) => {
      if (videoElement && 'srcObject' in videoElement) {
        videoElement.srcObject = cameraStreamRef.current;
      }
    });

    const videoElement = modalVideoRef.current || mainVideoRef.current;
    if (videoElement && typeof videoElement.play === 'function') {
      try {
        await videoElement.play();
      } catch (error) {
        setCameraState('error');
        setCameraPreviewMessage(error instanceof Error ? error.message : String(error));
        return false;
      }
    }

    clearCameraFrameTimer();
    setCameraState('previewing');
    setCameraPreviewMessage('Camera preview is active. Uploading video frames at a low frequency.');
    setVideoUploadState(activeSessionId ? 'uploading' : 'local_only');
    setVideoUploadMessage(
      activeSessionId
        ? 'Camera preview is active. Waiting for the first uploaded frame.'
        : 'Camera preview is active locally without a session.',
    );
    setUploadedVideoFrameCount(0);
    setLastUploadedVideoFrameId(null);
    setLastVideoUploadedAt(null);
    setNextVideoFrameSeq(1);
    nextVideoFrameSeqRef.current = 1;
    scheduleAffectRefresh('camera_preview_started', 80);
    void captureAndUploadVideoFrame();
    cameraFrameTimerRef.current = window.setInterval(() => {
      void captureAndUploadVideoFrame();
    }, runtimeConfig.videoFrameUploadIntervalMs);
    return true;
  }, [activeSessionId, captureAndUploadVideoFrame, clearCameraFrameTimer, requestCameraAccess, runtimeConfig.videoFrameUploadIntervalMs, scheduleAffectRefresh]);

  const stopCameraPreview = useCallback(() => {
    clearCameraFrameTimer();
    teardownCamera(true);
    setCameraState('stopped');
    setCameraPreviewMessage('Camera preview stopped.');
    finalizeVideoUploadState('stopped');
    scheduleAffectRefresh('camera_preview_stopped', 80);
    return true;
  }, [clearCameraFrameTimer, finalizeVideoUploadState, scheduleAffectRefresh, teardownCamera]);

  useEffect(() => {
    if (!isCameraModalOpen) {
      cameraModalAutoStartRef.current = false;
      return;
    }
    if (cameraModalAutoStartRef.current) {
      return;
    }
    cameraModalAutoStartRef.current = true;
    void requestCameraAccess().then((granted) => {
      if (granted) {
        void startCameraPreview();
      }
    });
  }, [isCameraModalOpen, requestCameraAccess, startCameraPreview]);

  const waitForPendingAudioUploads = useCallback(async () => {
    while (pendingAudioUploadsRef.current > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 20);
      });
    }
  }, []);

  const requestMicrophoneAccess = useCallback(async () => {
    if (recordingState === 'recording') {
      return true;
    }

    if (
      !navigator?.mediaDevices
      || typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setMicPermissionState('unsupported');
      setMicPermissionMessage('Current browser does not support microphone capture.');
      setRecordingState('error');
      return false;
    }

    setMicPermissionState('requesting');
    setMicPermissionMessage('Requesting microphone access.');

    try {
      if (micStreamRef.current) {
        setMicPermissionState('granted');
        setMicPermissionMessage('Microphone access granted.');
        return true;
      }

      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      setMicPermissionState('granted');
      setMicPermissionMessage('Microphone access granted.');
      return true;
    } catch (error) {
      const errorName = error && typeof error === 'object' ? error.name : '';
      setRecordingState('error');
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setMicPermissionState('denied');
        setMicPermissionMessage('Microphone permission was denied.');
      } else {
        setMicPermissionState('error');
        setMicPermissionMessage(error instanceof Error ? error.message : String(error));
      }
      return false;
    }
  }, [recordingState]);

  const maybeSendAudioPreview = useCallback(async () => {
    if (!runtimeConfig.enableAudioPreview) {
      return;
    }
    if (!activeSessionId || recordingStateRef.current !== 'recording') {
      return;
    }
    if (finalizingAudioRef.current || previewInFlightRef.current) {
      return;
    }
    if (recordedAudioPartsRef.current.length < runtimeConfig.audioPreviewChunkThreshold) {
      return;
    }
    if (recordedAudioPartsRef.current.length === lastPreviewChunkCountRef.current) {
      return;
    }
    const BlobCtor = window?.Blob || Blob;
    if (typeof BlobCtor !== 'function') {
      return;
    }

    const previewBlob = new BlobCtor(recordedAudioPartsRef.current, {
      type: recordedAudioPartsRef.current[recordedAudioPartsRef.current.length - 1]?.type || 'application/octet-stream',
    });
    const previewSeq = nextPreviewSeqRef.current;
    nextPreviewSeqRef.current += 1;
    previewInFlightRef.current = true;

    try {
      await requestAudioPreview(runtimeConfig.apiBaseUrl, activeSessionId, {
        blob: previewBlob,
        durationMs: Math.max(0, Math.round(recordingDurationMsRef.current)),
        previewSeq,
        recordingId: currentRecordingIdRef.current,
      });
      lastPreviewChunkCountRef.current = recordedAudioPartsRef.current.length;
    } catch (error) {
      setPartialTranscriptState((previousState) => ({
        ...previousState,
        status: 'error',
        text: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      previewInFlightRef.current = false;
      if (
        recordingStateRef.current === 'recording'
        && recordedAudioPartsRef.current.length > lastPreviewChunkCountRef.current
      ) {
        void maybeSendAudioPreview();
      }
    }
  }, [activeSessionId, runtimeConfig.apiBaseUrl, runtimeConfig.audioPreviewChunkThreshold, runtimeConfig.enableAudioPreview]);

  const uploadAudioChunk = useCallback(async (blob, options) => {
    if (!activeSessionId) {
      setAudioUploadState('error');
      setAudioUploadMessage('Create a session before starting audio recording.');
      return null;
    }

    pendingAudioUploadsRef.current += 1;
    setAudioUploadState('uploading');
    setAudioUploadMessage(`Uploading audio chunk ${options.chunkSeq}.`);

    try {
      const payload = await requestAudioChunkUpload(runtimeConfig.apiBaseUrl, activeSessionId, {
        blob,
        chunkSeq: options.chunkSeq,
        chunkStartedAtMs: options.chunkStartedAtMs,
        durationMs: options.durationMs,
        isFinal: options.isFinal,
      });
      setLastUploadedMediaId(payload?.media_id || null);
      setLastUploadedAt(payload?.created_at || new Date().toISOString());
      return payload;
    } catch (error) {
      setAudioUploadState('error');
      setAudioUploadMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      pendingAudioUploadsRef.current = Math.max(0, pendingAudioUploadsRef.current - 1);
      if (
        pendingAudioUploadsRef.current === 0
        && !finalizingAudioRef.current
        && recordingStateRef.current !== 'recording'
        && audioUploadStateRef.current !== 'error'
      ) {
        setAudioUploadState('completed');
        setAudioUploadMessage(`Uploaded ${recordingChunkCountRef.current} audio chunks.`);
      }
    }
  }, [activeSessionId, runtimeConfig.apiBaseUrl]);

  const finalizeRecordedAudio = useCallback(async () => {
    if (!runtimeConfig.enableAudioFinalize || finalizingAudioRef.current) {
      return;
    }
    if (!activeSessionId || !recordedAudioPartsRef.current.length) {
      return;
    }

    const BlobCtor = window?.Blob || Blob;
    if (typeof BlobCtor !== 'function') {
      setAudioUploadState('error');
      setAudioUploadMessage('Current browser does not support Blob.');
      return;
    }

    const finalBlob = new BlobCtor(recordedAudioPartsRef.current, {
      type: recordedAudioPartsRef.current[recordedAudioPartsRef.current.length - 1]?.type || 'application/octet-stream',
    });

    finalizingAudioRef.current = true;
    setDialogueReplyState('idle');
    setAudioUploadState('processing_final');
    setAudioUploadMessage('Submitting final audio and waiting for ASR result.');

    try {
      await waitForPendingAudioUploads();
      await requestAudioFinalize(runtimeConfig.apiBaseUrl, activeSessionId, {
        blob: finalBlob,
        durationMs: Math.max(0, Math.round(recordingDurationMsRef.current)),
      });
      setAudioUploadState('awaiting_realtime');
      setAudioUploadMessage('Final audio submitted, waiting for realtime message.accepted.');
    } catch (error) {
      setAudioUploadState('error');
      setAudioUploadMessage(error instanceof Error ? error.message : String(error));
    } finally {
      finalizingAudioRef.current = false;
    }
  }, [activeSessionId, runtimeConfig.apiBaseUrl, runtimeConfig.enableAudioFinalize, waitForPendingAudioUploads]);

  const startRecording = useCallback(async () => {
    if (recordingState === 'recording') {
      return;
    }
    if (!activeSessionId) {
      setRecordingState('error');
      setAudioUploadState('error');
      setAudioUploadMessage('Create a session before recording.');
      return;
    }
    if (connectionStatusRef.current !== 'connected') {
      setRecordingState('error');
      setAudioUploadState('error');
      setAudioUploadMessage('Realtime connection must be ready before recording.');
      return;
    }

    const granted = await requestMicrophoneAccess();
    if (!granted || !micStreamRef.current) {
      return;
    }

    const MediaRecorderCtor = window?.MediaRecorder;
    if (typeof MediaRecorderCtor !== 'function') {
      setMicPermissionState('unsupported');
      setMicPermissionMessage('Current browser does not support MediaRecorder.');
      setRecordingState('error');
      return;
    }

    clearRecordingTimer();
    stopRequestedRef.current = false;
    pendingAudioUploadsRef.current = 0;
    recordedAudioPartsRef.current = [];
    finalizingAudioRef.current = false;
    previewInFlightRef.current = false;
    lastPreviewChunkCountRef.current = 0;
    nextPreviewSeqRef.current = 1;
    nextAudioChunkSeqRef.current = 1;
    currentRecordingIdRef.current = createRecordingId();
    recordingStartedAtMsRef.current = Date.now();

    setRecordingState('recording');
    setRecordingDurationMs(0);
    setRecordingChunkCount(0);
    setAudioUploadState('uploading');
    setAudioUploadMessage('Recording started, waiting for audio chunk uploads.');
    setLastUploadedAt(null);
    setLastUploadedMediaId(null);
    setPartialTranscriptState(createInitialPartialTranscriptState());
    setFinalTranscriptState(createInitialFinalTranscriptState());

    const recorder = new MediaRecorderCtor(micStreamRef.current);
    mediaRecorderRef.current = recorder;
    recorder.addEventListener('dataavailable', (event) => {
      if (!event?.data || (typeof event.data.size === 'number' && event.data.size <= 0)) {
        return;
      }

      recordedAudioPartsRef.current.push(event.data);
      setRecordingChunkCount((previous) => previous + 1);
      const chunkSeq = nextAudioChunkSeqRef.current;
      nextAudioChunkSeqRef.current += 1;
      const isFinal = stopRequestedRef.current && recorder.state !== 'recording';
      void uploadAudioChunk(event.data, {
        chunkSeq,
        chunkStartedAtMs: (chunkSeq - 1) * 250,
        durationMs: 250,
        isFinal,
      });
      void maybeSendAudioPreview();
    });
    recorder.addEventListener('stop', () => {
      clearRecordingTimer();
      mediaRecorderRef.current = null;
      setRecordingState('stopped');
      if (runtimeConfig.enableAudioFinalize) {
        void finalizeRecordedAudio();
      }
    });
    recorder.addEventListener('error', (event) => {
      clearRecordingTimer();
      mediaRecorderRef.current = null;
      setRecordingState('error');
      setMicPermissionMessage(event?.error?.message || 'Recording failed.');
      setAudioUploadState('error');
      setAudioUploadMessage(event?.error?.message || 'Recording failed.');
    });

    recorder.start(250);
    recordingTimerRef.current = window.setInterval(() => {
      if (!recordingStartedAtMsRef.current) {
        return;
      }
      setRecordingDurationMs(Math.max(0, Date.now() - recordingStartedAtMsRef.current));
    }, 100);
  }, [activeSessionId, clearRecordingTimer, finalizeRecordedAudio, maybeSendAudioPreview, recordingState, requestMicrophoneAccess, runtimeConfig.enableAudioFinalize, uploadAudioChunk]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return;
    }
    try {
      stopRequestedRef.current = true;
      mediaRecorderRef.current.stop();
    } catch (error) {
      clearRecordingTimer();
      mediaRecorderRef.current = null;
      setRecordingState('error');
      setMicPermissionMessage(error instanceof Error ? error.message : String(error));
      setAudioUploadState('error');
      setAudioUploadMessage(error instanceof Error ? error.message : String(error));
    }
  }, [clearRecordingTimer]);

  const handleMicAction = useCallback(async () => {
    setIsMicModalOpen(true);
    if (recordingState === 'recording') {
      stopRecording();
      return;
    }
    await startRecording();
  }, [recordingState, startRecording, stopRecording]);

  useEffect(() => {
    if (modalVideoRef.current && cameraStreamRef.current) {
      modalVideoRef.current.srcObject = cameraStreamRef.current;
    }
    if (mainVideoRef.current && cameraStreamRef.current) {
      mainVideoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraPermissionState, cameraState, isCameraModalOpen]);

  const createSession = useCallback(async () => {
    setSessionRequestState('creating');
    setSessionErrorMessage('');
    setSessionStatusMessage(t.sessionCreating);

    try {
      const payload = await requestSession(runtimeConfig.apiBaseUrl, runtimeConfig.defaultAvatarId);
      applySessionSnapshot({ session: payload, messages: [] }, t.sessionReady);
      setSessionRequestState('ready');
    } catch (error) {
      setSessionState(null);
      setSessionRequestState('error');
      setSessionErrorMessage(error.message || t.sessionRestoreFailed);
      setSessionStatusMessage(error.message || t.sessionRestoreFailed);
      setConnectionStatus('idle');
      setConnectionStatusMessage('');
      setLastHeartbeatAt(null);
      setTextSubmitState('idle');
      setDialogueReplyState('idle');
      setPendingMessageId(null);
    }
  }, [runtimeConfig.apiBaseUrl, runtimeConfig.defaultAvatarId, applySessionSnapshot, t.sessionCreating, t.sessionReady, t.sessionRestoreFailed]);

  const clearSession = useCallback(() => {
    invalidateLocalSession();
  }, [invalidateLocalSession]);

  const submitText = useCallback(async () => {
    const contentText = inputText.trim();

    if (!contentText) {
      setTextSubmitState('error');
      setSessionErrorMessage(t.sessionSubmitEmpty);
      setSessionStatusMessage(t.sessionSubmitEmpty);
      return;
    }

    const activeSession = sessionStateRef.current?.session;
    const activeSessionId = activeSession?.session_id || storedSessionId;
    if (!activeSessionId) {
      setTextSubmitState('error');
      setSessionErrorMessage(t.sessionSubmitNeedSession);
      setSessionStatusMessage(t.sessionSubmitNeedSession);
      return;
    }

    if (connectionStatusRef.current !== 'connected') {
      setTextSubmitState('error');
      setSessionErrorMessage('Realtime connection is not ready.');
      setSessionStatusMessage('Realtime connection is not ready.');
      return;
    }

    if (textSubmitStateRef.current !== 'idle') {
      setTextSubmitState('error');
      setSessionErrorMessage('A text turn is already in flight.');
      setSessionStatusMessage('A text turn is already in flight.');
      return;
    }

    setSessionRequestState('submitting');
    setSessionErrorMessage('');
    setSessionStatusMessage(t.sessionSubmitting);
    setTextSubmitState('sending');
    setDialogueReplyState('idle');
    setPendingMessageId(null);

    try {
      const payload = await requestTextMessage(
        runtimeConfig.apiBaseUrl,
        activeSessionId,
        contentText,
        clientSeq,
      );
      shouldRecoverOnNextConnectRef.current = false;
      setSessionRequestState('ready');
      if (textSubmitStateRef.current === 'sending') {
        pendingMessageIdRef.current = payload?.message_id || null;
        setPendingMessageId(payload?.message_id || null);
        if (hasMessageId(sessionStateRef.current?.messages, payload?.message_id)) {
          textSubmitStateRef.current = 'awaiting_reply';
          setTextSubmitState('awaiting_reply');
        } else {
          textSubmitStateRef.current = 'awaiting_ack';
          setTextSubmitState('awaiting_ack');
        }
      }
      sendHeartbeat();
    } catch (error) {
      setSessionRequestState('error');
      setTextSubmitState('error');
      setDialogueReplyState('error');
      setSessionErrorMessage(error.message || t.sessionRestoreFailed);
      setSessionStatusMessage(error.message || t.sessionRestoreFailed);
    }
  }, [clientSeq, inputText, runtimeConfig.apiBaseUrl, sendHeartbeat, storedSessionId, t.sessionRestoreFailed, t.sessionSubmitEmpty, t.sessionSubmitNeedSession, t.sessionSubmitting]);

  const sessionSummary = sessionState?.session || null;
  const sessionMessages = Array.isArray(sessionState?.messages) ? sessionState.messages : [];
  const micDetailMessage = micPermissionState === 'requesting'
    ? 'Requesting microphone access.'
    : micPermissionState === 'granted'
      ? recordingState === 'recording'
        ? 'Microphone access granted, recording in progress.'
        : 'Microphone access granted, ready to record.'
      : micPermissionState === 'denied'
        ? (micPermissionMessage || 'Microphone permission was denied.')
        : micPermissionState === 'unsupported'
          ? 'Current browser does not support microphone capture.'
          : micPermissionState === 'error'
            ? (micPermissionMessage || 'Microphone initialization failed.')
            : (micPermissionMessage || 'Microphone is idle.');
  const cameraDetailMessage = cameraPermissionState === 'requesting'
    ? 'Requesting camera access.'
    : cameraPermissionState === 'granted'
      ? (cameraPreviewMessage || 'Camera access granted.')
      : cameraPermissionState === 'denied'
        ? (cameraPermissionMessage || 'Camera permission was denied.')
        : cameraPermissionState === 'unsupported'
          ? 'Current browser does not support camera capture.'
          : cameraPermissionState === 'error'
            ? (cameraPermissionMessage || 'Camera initialization failed.')
            : (cameraPermissionMessage || 'Camera is idle.');
  const recordingDetailMessage = recordingState === 'recording'
    ? `Recording ${recordingChunkCount} chunks over ${formatDurationMs(recordingDurationMs)}.`
    : recordingState === 'stopped'
      ? `Recording stopped after ${recordingChunkCount} chunks over ${formatDurationMs(recordingDurationMs)}.`
      : recordingState === 'error'
        ? (micPermissionMessage || 'Recording failed.')
        : 'Recording not started.';
  const latestAssistantMessage = [...sessionMessages].reverse().find((message) => message.role === 'assistant') || null;
  const latestUserMessage = [...sessionMessages].reverse().find((message) => message.role === 'user') || null;
  const displayedEmotionLabel = affectSnapshot.fusion.emotionState || t.emoState;
  const displayedEmotionDetail = affectSnapshot.fusion.detail || t.emoDesc;
  const displayedEmotionQuote = affectSnapshot.sourceContext.note || latestAssistantMessage?.content_text || t.emoQuote;
  const liveTranscriptText = partialTranscriptState.status === 'streaming' && partialTranscriptState.text
    ? partialTranscriptState.text
    : finalTranscriptState.text || latestUserMessage?.content_text || '';
  const knowledgeSummary = knowledgeState.sourceIds.length
    ? knowledgeState.sourceIds.join(', ')
    : knowledgeState.retrievalStatus;
  const affectLaneItems = [
    { key: 'fusion', label: 'fusion', value: affectSnapshot.fusion },
    { key: 'text', label: 'text', value: affectSnapshot.text },
    { key: 'audio', label: 'audio', value: affectSnapshot.audio },
    { key: 'video', label: 'video', value: affectSnapshot.video },
  ];
  const liveTimelineData = affectHistory.map((item) => ({
    time: item.generatedAt,
    emotion: item.emotion,
    desc: item.detail,
    color: item.riskLevel === 'high'
      ? 'bg-red-100 text-red-700'
      : item.riskLevel === 'medium'
        ? 'bg-orange-100 text-orange-700'
        : 'bg-green-100 text-green-700',
  }));

  const visibleStatuses = useMemo(() => {
    const statusMap = {
      idle: t.sessionIdle,
      creating: t.sessionCreating,
      restoring: t.sessionRestoring,
      ready: t.sessionReady,
      submitting: t.sessionSubmitting,
      error: sessionErrorMessage || t.sessionRestoreFailed,
    };

    const realtimeStatusMap = {
      idle: 'realtime idle',
      connecting: 'realtime connecting',
      connected: 'realtime connected',
      reconnecting: 'realtime reconnecting',
      closed: 'realtime closed',
      unsupported: 'realtime unsupported',
    };

    const submitStatusMap = {
      idle: sessionStatusMessage || statusMap[sessionRequestState] || t.statuses[4],
      sending: 'text sending',
      awaiting_ack: 'waiting for message.accepted',
      awaiting_reply: 'waiting for dialogue.reply',
      error: sessionErrorMessage || 'text submit error',
    };

    return [
      realtimeStatusMap[connectionStatus] || t.statuses[0],
      lastHeartbeatAt ? `heartbeat ${lastHeartbeatAt}` : t.statuses[1],
      connectionStatusMessage || t.statuses[2],
      submitStatusMap[textSubmitState] || statusMap[sessionRequestState] || t.statuses[4],
      sessionStatusMessage || statusMap[sessionRequestState] || t.statuses[4],
    ];
  }, [connectionStatus, connectionStatusMessage, lastHeartbeatAt, sessionErrorMessage, sessionRequestState, sessionStatusMessage, t, textSubmitState]);

  const storedSessionNotice = storedSessionId ? t.restoreReady : t.noStoredSession;
  const heartbeatLabel = lastHeartbeatAt || '—';
  const canSubmitText = Boolean(inputText.trim())
    && connectionStatus === 'connected'
    && textSubmitState === 'idle'
    && sessionRequestState !== 'creating'
    && sessionRequestState !== 'restoring';

  const formatRoleLabel = useCallback((role) => {
    if (role === 'assistant') {
      return t.assistantRoleLabel;
    }
    if (role === 'user') {
      return t.userRoleLabel;
    }
    return t.systemRoleLabel;
  }, [t.assistantRoleLabel, t.systemRoleLabel, t.userRoleLabel]);

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

        {/* Phase A: runtime config / bootstrap compatibility */}
        <section className="bg-white/85 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col gap-4">
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

        <section className="bg-white/85 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#A6998E]">{t.phaseTitle}</p>
              <h2 className="text-lg font-semibold text-[#5C4D42] mt-1">WS-first session create / restore / text submit</h2>
              <p className="text-sm text-[#8C7A6B] mt-2 leading-relaxed">{t.phaseDesc}</p>
            </div>
            <div className="self-start text-xs text-[#6B9080] bg-[#E8F3EE] border border-green-100 rounded-full px-3 py-1.5">
              {t.restoreSource}: {t.sourceEmotionApp}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
            <div className="rounded-3xl border border-[#F0E5D8] bg-[#FDFBF7] p-4 flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={createSession}
                  disabled={sessionRequestState === 'creating' || textSubmitState !== 'idle'}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-[#D97757] text-white shadow-md hover:bg-[#c26649] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {sessionRequestState === 'creating' ? t.sessionCreating : t.createSession}
                </button>
                <button
                  type="button"
                  onClick={() => restoreSession(storedSessionId)}
                  disabled={!storedSessionId || sessionRequestState === 'creating' || sessionRequestState === 'restoring' || textSubmitState !== 'idle'}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-[#FFF0E5] text-[#D97757] border border-[#F0E5D8] hover:bg-[#FFE5D0] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {sessionRequestState === 'restoring' ? t.restoring : t.restoreState}
                </button>
                <button
                  type="button"
                  onClick={clearSession}
                  disabled={!storedSessionId && !sessionSummary}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-white text-[#8C7A6B] border border-[#F0E5D8] hover:bg-[#F8F2EA] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {t.clearSession}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">{t.sessionLabel}</div>
                  <div className="break-all text-[#5C4D42] font-medium">{sessionSummary?.session_id || storedSessionId || t.sessionPending}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">{t.traceLabel}</div>
                  <div className="break-all text-[#5C4D42] font-medium">{sessionSummary?.trace_id || '—'}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">{t.stageLabel}</div>
                  <div className="text-[#5C4D42] font-medium">{sessionSummary?.stage || 'idle'}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">{t.statusLabel}</div>
                  <div className="text-[#5C4D42] font-medium">{sessionSummary?.status || sessionRequestState}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">{t.messageCountLabel}</div>
                  <div className="text-[#5C4D42] font-medium">{sessionMessages.length}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">Connection</div>
                  <div className="text-[#5C4D42] font-medium">{connectionStatus}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">Last heartbeat</div>
                  <div className="break-all text-[#5C4D42] font-medium">{heartbeatLabel}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">Text submit</div>
                  <div className="text-[#5C4D42] font-medium">{textSubmitState}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">Dialogue reply</div>
                  <div className="text-[#5C4D42] font-medium">{dialogueReplyState}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">Pending message</div>
                  <div className="break-all text-[#5C4D42] font-medium">{pendingMessageId || '—'}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">{t.storageKeyLabel}</div>
                  <div className="break-all text-[#5C4D42] font-medium">{runtimeConfig.activeSessionStorageKey}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#F0E5D8] bg-[#FFF9F3] px-4 py-3 text-sm text-[#8C7A6B]">
                <div>{storedSessionNotice}</div>
                <div className="mt-1 text-[#5C4D42]">{sessionStatusMessage || t.sessionIdle}</div>
                <div className="mt-2 text-xs text-[#8C7A6B]">realtime: {connectionStatus}</div>
                <div className="mt-1 text-xs text-[#8C7A6B]">heartbeat: {heartbeatLabel}</div>
                {connectionStatusMessage && (
                  <div className="mt-1 text-xs text-[#8C7A6B]">{connectionStatusMessage}</div>
                )}
                {sessionErrorMessage && (
                  <div className="mt-2 text-red-500">{sessionErrorMessage}</div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">Realtime transcript</div>
                  <div className="text-[#5C4D42] font-medium">{partialTranscriptState.status}</div>
                  <div className="mt-2 text-sm text-[#5C4D42] whitespace-pre-wrap">{liveTranscriptText || 'waiting for transcript'}</div>
                  <div className="mt-2 text-xs text-[#8C7A6B]">final confidence: {formatRealtimeConfidence(finalTranscriptState.confidence)}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4">
                  <div className="text-xs text-[#A6998E] mb-1">Audio runtime</div>
                  <div className="text-[#5C4D42] font-medium">{audioUploadState}</div>
                  <div className="mt-2 text-xs text-[#8C7A6B]">mic: {micPermissionState}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">recording: {recordingState}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">duration: {formatDurationMs(recordingDurationMs)}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">chunks: {recordingChunkCount}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">preview enabled: {String(runtimeConfig.enableAudioPreview)}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">finalize enabled: {String(runtimeConfig.enableAudioFinalize)}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">last upload: {lastUploadedAt || '—'}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">last media id: {lastUploadedMediaId || '—'}</div>
                  <div className="mt-2 text-sm text-[#5C4D42] whitespace-pre-wrap">{audioUploadMessage || micDetailMessage}</div>
                </div>
                <div className="rounded-2xl border border-[#F0E5D8] bg-white p-4 md:col-span-2">
                  <div className="text-xs text-[#A6998E] mb-1">Knowledge retrieval</div>
                  <div className="text-[#5C4D42] font-medium">{knowledgeSummary}</div>
                  <div className="mt-2 text-xs text-[#8C7A6B]">status: {knowledgeState.retrievalStatus}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">filters: {knowledgeState.filtersApplied.length ? knowledgeState.filtersApplied.join(', ') : '—'}</div>
                  <div className="mt-1 text-xs text-[#8C7A6B]">grounded refs: {knowledgeState.groundedRefs.length ? knowledgeState.groundedRefs.join(', ') : '—'}</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[#F0E5D8] bg-[#FDFBF7] p-4 flex flex-col gap-3 min-h-[280px]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-[#8C7A6B]">{t.assistantReplies}</h3>
                <span className="text-xs text-[#A6998E]">client_seq {clientSeq}</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
                {sessionMessages.length ? sessionMessages.map((message) => (
                  <div key={message.message_id} className="rounded-2xl border border-[#F0E5D8] bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-[#A6998E] mb-1">
                      <span>{formatRoleLabel(message.role)}</span>
                      <span>{message.source_kind}</span>
                    </div>
                    <p className="text-sm text-[#5C4D42] leading-relaxed whitespace-pre-wrap">{message.content_text}</p>
                  </div>
                )) : (
                  <div className="h-full min-h-[180px] rounded-2xl border border-dashed border-[#E5D8C8] bg-white/60 flex items-center justify-center text-sm text-[#A6998E] text-center px-6">
                    {t.assistantEmpty}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 2. 标题下方功能区 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* 左侧：外设调试按钮 */}
          <div className="md:col-span-1 flex flex-col gap-4">
            {cameraState === 'previewing' || cameraState === 'stopped' ? (
              <div className="group relative overflow-hidden flex items-center justify-between gap-2 bg-white/80 backdrop-blur-sm p-4 rounded-3xl border border-green-200/60 shadow-sm transition-all duration-300 min-h-[88px]">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-sm shrink-0 border border-green-200 bg-black/5">
                    <video ref={mainVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-[#5C4D42] text-sm">{cameraState === 'previewing' ? t.camOn : 'Camera stopped'}</span>
                    <span className="text-xs text-[#6B9080] mt-0.5">{videoUploadMessage || cameraDetailMessage}</span>
                  </div>
                </div>
                <button
                  onClick={() => { stopCameraPreview(); setIsCameraModalOpen(false); }}
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
              onClick={(e) => { e.stopPropagation(); void handleMicAction(); }}
              className="group relative overflow-hidden flex items-center gap-4 bg-white/80 backdrop-blur-sm p-5 rounded-3xl border border-[#F0E5D8] shadow-sm hover:shadow-md hover:bg-[#FFFBF5] transition-all duration-300 hover:-translate-y-1"
            >
              <div className={`p-3 rounded-2xl transition-transform duration-300 ${recordingState === 'recording' ? 'bg-red-50 text-red-500' : 'bg-[#FFF0E5] text-[#D97757] group-hover:scale-110'}`}>
                <Mic size={26} strokeWidth={recordingState === 'recording' ? 2.5 : 2} className={recordingState === 'recording' ? 'animate-pulse' : ''} />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-[#5C4D42]">{recordingState === 'recording' ? 'Stop recording' : t.micTest}</span>
                <span className="text-xs text-[#8C7A6B] mt-0.5">{recordingState === 'recording' ? recordingDetailMessage : micDetailMessage}</span>
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
                <div className="flex items-end gap-4 flex-wrap">
                  <span className="text-4xl font-bold text-[#D97757] tracking-wider">{displayedEmotionLabel}</span>
                  <span className="text-sm text-[#8C7A6B] mb-1 bg-white/60 px-3 py-1 rounded-full">
                    {displayedEmotionDetail}
                  </span>
                </div>
                <p className="mt-4 text-[#5C4D42] text-sm leading-relaxed italic">
                  {displayedEmotionQuote}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#8C7A6B]">
                  <div className="rounded-2xl bg-white/70 px-3 py-2 border border-[#F0E5D8]">
                    <div className="text-[#A6998E]">panel</div>
                    <div className="text-[#5C4D42] font-medium">{affectSnapshot.panelState}</div>
                    <div className="mt-1 text-[#8C7A6B] whitespace-pre-wrap">{affectSnapshot.panelMessage}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 px-3 py-2 border border-[#F0E5D8]">
                    <div className="text-[#A6998E]">risk / confidence</div>
                    <div className="text-[#5C4D42] font-medium">{affectSnapshot.fusion.riskLevel} / {formatRealtimeConfidence(affectSnapshot.fusion.confidence)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 px-3 py-2 border border-[#F0E5D8] col-span-2">
                    <div className="text-[#A6998E]">source context</div>
                    <div className="text-[#5C4D42] font-medium break-all">{affectSnapshot.sourceContext.origin} / {affectSnapshot.sourceContext.dataset} / {affectSnapshot.sourceContext.recordId}</div>
                    <div className="mt-1 text-[#8C7A6B] whitespace-pre-wrap">{affectSnapshot.sourceContext.note || 'No source note.'}</div>
                  </div>
                  {affectSnapshot.fusion.conflict && (
                    <div className="rounded-2xl bg-red-50 px-3 py-2 border border-red-100 col-span-2">
                      <div className="text-[#A6998E]">conflict</div>
                      <div className="text-[#5C4D42] font-medium">{affectSnapshot.fusion.conflictReason || 'Lane conflict detected.'}</div>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#8C7A6B]">
                  {affectLaneItems.map((lane) => (
                    <div key={lane.key} className="rounded-2xl bg-white/70 px-3 py-2 border border-[#F0E5D8]">
                      <div className="text-[#A6998E]">{lane.label}</div>
                      <div className="text-[#5C4D42] font-medium">{lane.value.label || lane.value.emotionState}</div>
                      <div className="mt-1">status: {lane.value.status || 'ready'}</div>
                      <div>confidence: {formatRealtimeConfidence(lane.value.confidence)}</div>
                      <div className="mt-1 whitespace-pre-wrap">{lane.value.detail || lane.value.conflictReason || 'No detail.'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 历史情绪时间轴 */}
            <div className="flex-1 bg-white/80 backdrop-blur-sm p-6 rounded-3xl border border-[#F0E5D8] shadow-sm flex flex-col h-48">
              <h3 className="text-sm font-medium text-[#8C7A6B] mb-4 flex items-center gap-2">
                <Clock size={16} /> {t.logTitle}
              </h3>
              <div className="overflow-y-auto custom-scrollbar pr-2 flex-1 space-y-4">
                {liveTimelineData.length ? liveTimelineData.map((item, idx) => (
                  <div key={`${item.time}-${idx}`} className="flex items-start gap-3">
                    <div className="text-xs font-medium text-[#A6998E] w-20 pt-0.5 break-all">{item.time}</div>
                    <div className="relative flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-[#D97757]/40 ring-4 ring-[#FFFBF5] z-10"></div>
                      {idx !== liveTimelineData.length - 1 && (
                        <div className="w-0.5 h-full bg-[#F0E5D8] absolute top-2"></div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-md ${item.color}`}>
                        {item.emotion}
                      </span>
                      <span className="text-sm text-[#5C4D42]">{item.desc}</span>
                    </div>
                  </div>
                )) : (
                  <div className="h-full min-h-[120px] rounded-2xl border border-dashed border-[#E5D8C8] bg-white/60 flex items-center justify-center text-sm text-[#A6998E] text-center px-6">
                    Waiting for real affect history.
                  </div>
                )}
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
                {liveTranscriptText || t.bubble1}
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
                {latestAssistantMessage?.content_text || t.bubble2}
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
              {visibleStatuses[systemStatusIndex]}
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
                {recordingState === 'recording' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>}
                {recordingState === 'recording' ? `${t.recording} ${formatDurationMs(recordingDurationMs)}` : audioUploadMessage || micDetailMessage}
              </span>

              <button
                onClick={() => { void handleMicAction(); }}
                className={`p-2.5 rounded-full transition-all duration-300 ${recordingState === 'recording' ? 'bg-red-50 text-red-500 shadow-inner' : 'text-[#8C7A6B] hover:bg-[#FFF0E5] hover:text-[#D97757] hover:scale-105'}`}
                title={recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
              >
                <Mic size={18} strokeWidth={recordingState === 'recording' ? 2.5 : 2} className={recordingState === 'recording' ? 'animate-pulse' : ''} />
              </button>
              
              <button
                onClick={submitText}
                className={`p-2.5 rounded-full transition-all duration-300 flex items-center justify-center ${canSubmitText ? 'bg-[#D97757] text-white shadow-md hover:bg-[#c26649] hover:-translate-y-0.5' : 'bg-[#F0E5D8] text-[#A6998E] cursor-not-allowed opacity-60'}`}
                disabled={!canSubmitText}
                title={textSubmitState === 'sending' ? t.sending : t.submitText}
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
              {cameraPermissionState === 'idle' || cameraPermissionState === 'requesting' ? (
                <div className="flex flex-col items-center gap-3 text-[#A6998E] animate-pulse">
                  <Video size={36} strokeWidth={1.5} />
                  <span className="text-sm">{t.camReq}</span>
                </div>
              ) : cameraPermissionState === 'granted' ? (
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
                  <span className="text-sm">{cameraDetailMessage}</span>
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center mt-2 min-h-8 gap-3">
              <div className="text-sm font-medium flex-1">
                <div className="text-[#5C4D42]">permission: {cameraPermissionState}</div>
                <div className="text-[#5C4D42]">preview: {cameraState}</div>
                <div className="text-[#5C4D42]">upload: {videoUploadState}</div>
                <div className="text-xs text-[#8C7A6B] whitespace-pre-wrap">{cameraPermissionMessage || cameraPreviewMessage || videoUploadMessage}</div>
                <div className="text-xs text-[#8C7A6B] whitespace-pre-wrap">frames: {uploadedVideoFrameCount} / last media: {lastUploadedVideoFrameId || '—'} / last upload: {lastVideoUploadedAt || '—'}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { if (cameraState === 'previewing') { stopCameraPreview(); } else { void startCameraPreview(); } }}
                  className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${cameraState === 'previewing' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-[#FFF0E5] text-[#D97757] hover:bg-[#FFE5D0]'}`}
                >
                  {cameraState === 'previewing' ? 'Stop preview' : 'Start preview'}
                </button>
                <button
                  onClick={() => setIsCameraModalOpen(false)}
                  className="px-5 py-2 rounded-xl text-sm font-medium transition-all bg-[#D97757] text-white shadow-md hover:bg-[#c26649]"
                >
                  {cameraPermissionState === 'granted' ? t.done : t.cancel}
                </button>
              </div>
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

            <div className="w-full min-h-40 bg-white rounded-2xl border-2 border-[#F0E5D8] overflow-hidden relative flex flex-col justify-center shadow-inner p-4 gap-3">
              <div>
                <div className="text-xs text-[#A6998E] mb-1">Permission</div>
                <div className="text-sm text-[#5C4D42] font-medium">{micPermissionState}</div>
                <div className="mt-1 text-xs text-[#8C7A6B] whitespace-pre-wrap">{micDetailMessage}</div>
              </div>
              <div>
                <div className="text-xs text-[#A6998E] mb-1">Recording</div>
                <div className="text-sm text-[#5C4D42] font-medium">{recordingState}</div>
                <div className="mt-1 text-xs text-[#8C7A6B] whitespace-pre-wrap">{recordingDetailMessage}</div>
              </div>
              <div>
                <div className="text-xs text-[#A6998E] mb-1">Upload</div>
                <div className="text-sm text-[#5C4D42] font-medium">{audioUploadState}</div>
                <div className="mt-1 text-xs text-[#8C7A6B] whitespace-pre-wrap">{audioUploadMessage || 'No audio uploads yet.'}</div>
              </div>
              <div>
                <div className="text-xs text-[#A6998E] mb-1">Transcript</div>
                <div className="text-sm text-[#5C4D42] whitespace-pre-wrap">{liveTranscriptText || 'Waiting for transcript.'}</div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-2">
              <div className="text-sm font-medium h-8 flex items-center">
                {audioUploadState === 'completed' && (
                  <span className="text-green-600 flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    {t.micSuccess}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { void handleMicAction(); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${recordingState === 'recording' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-[#FFF0E5] text-[#D97757] hover:bg-[#FFE5D0]'}`}
                >
                  {recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
                </button>
                <button
                  onClick={() => setIsMicModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all bg-[#D97757] text-white shadow-md hover:bg-[#c26649]"
                >
                  {recordingState === 'recording' ? t.cancel : t.micClose}
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