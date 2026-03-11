FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY README.md /app/

COPY apps /app/apps
COPY services /app/services
COPY scripts /app/scripts
COPY libs /app/libs
COPY infra /app/infra
COPY docs /app/docs
COPY data/kb /app/data/kb
COPY .env.example /app/.env.example

RUN mkdir -p /app/data/derived/live_media /app/data/exports
