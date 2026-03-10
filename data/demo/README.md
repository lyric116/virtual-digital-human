# Demo Assets

## Purpose

This directory contains lightweight assets for mock flow development and demo-mode replay
before all runtime services are connected.

## Files

- `text_session_script.json`
  - fixed text-first session script for gateway, orchestrator, and frontend mock flow
- `audio_sample.md`
  - description of the demo audio clip that later ASR and upload mocks should emulate
- `video_frame_sample.md`
  - description of the demo video-frame packet used by affect and replay mocks
- `session_export_sample.json`
  - sample exported session payload for download and replay checks
- `session_replay_export.json`
  - sample exported session payload with `events` used by the step-48 replay mode

## Usage

1. Use `text_session_script.json` for mock `session.created`, `message.accepted`, and
   `dialogue.reply` loops.
2. Use `audio_sample.md` to keep fake audio chunk metadata consistent across gateway and
   ASR mocks.
3. Use `video_frame_sample.md` to keep camera-frame replay shape stable before real upload
   logic exists.
4. Use `session_export_sample.json` as the target shape for early export endpoints.
5. Use `session_replay_export.json` when you need a deterministic local replay source
   that includes transcript, affect, retrieval, dialogue, TTS, and avatar runtime events.
