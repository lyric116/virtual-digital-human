# Demo Video Frame Sample

- asset id: `demo_video_frame_packet_v1`
- purpose: camera-frame replay for affect-service and frontend placeholders
- source shape:
  - `session_id`
  - `trace_id`
  - `frame_index`
  - `captured_at`
  - `image_path`
- reference visual state:
  - frontal face
  - low head movement
  - neutral background
  - slightly tense brow and reduced smile intensity
- expected mock affect output:
  - `emotion_state=anxious`
  - `confidence=0.71`
  - `fusion_reason=visual_tension_detected`

Use this description to keep early mock payloads aligned before real camera upload is added.
