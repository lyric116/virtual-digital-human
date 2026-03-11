FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY apps/web /usr/share/nginx/html
COPY infra/docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/docker/web/config.js.template /opt/web/config.js.template
COPY infra/docker/web/entrypoint.sh /docker-entrypoint.d/40-render-app-config.sh

RUN chmod +x /docker-entrypoint.d/40-render-app-config.sh
