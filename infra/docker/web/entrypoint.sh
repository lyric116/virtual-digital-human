#!/bin/sh
set -eu

export WEB_PUBLIC_API_BASE_URL="${WEB_PUBLIC_API_BASE_URL:-http://localhost:8000}"
export WEB_PUBLIC_WS_URL="${WEB_PUBLIC_WS_URL:-ws://localhost:8000/ws}"
export WEB_PUBLIC_TTS_BASE_URL="${WEB_PUBLIC_TTS_BASE_URL:-http://localhost:8040}"
export WEB_PUBLIC_AFFECT_BASE_URL="${WEB_PUBLIC_AFFECT_BASE_URL:-http://localhost:8060}"
export WEB_DEFAULT_AVATAR_ID="${WEB_DEFAULT_AVATAR_ID:-companion_female_01}"
export WEB_AUTOPLAY_ASSISTANT_AUDIO="${WEB_AUTOPLAY_ASSISTANT_AUDIO:-true}"

envsubst '
${WEB_PUBLIC_API_BASE_URL}
${WEB_PUBLIC_WS_URL}
${WEB_PUBLIC_TTS_BASE_URL}
${WEB_PUBLIC_AFFECT_BASE_URL}
${WEB_DEFAULT_AVATAR_ID}
${WEB_AUTOPLAY_ASSISTANT_AUDIO}
' < /opt/web/config.js.template > /usr/share/nginx/html/config.js
