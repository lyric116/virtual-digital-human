# Shared Schema

## Purpose

This directory will hold machine-readable shared schema assets once service code is added.
Until then, the human-readable source of truth is:

- `docs/shared_contracts.md`

## Planned Contents

- `event-envelope.schema.json`
- `session.schema.json`
- `transcript-result.schema.json`
- `dialogue-result.schema.json`
- `avatar-command.schema.json`
- `error-response.schema.json`

Do not add service-specific payloads here unless they are consumed by more than one app or
service.
