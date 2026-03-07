# QC Report

Generated at: 2026-03-07T11:01:46.301704+00:00

## 1. Scope

- Manifest path: `data/manifests/val_manifest.jsonl`
- Transcript template path: `data/derived/transcripts/val_transcripts_template.jsonl`
- Total records: `1126`

## 2. Dataset Summary

| Dataset | Records |
| --- | ---: |
| noxi | 1106 |
| recola | 20 |

## 3. Role Summary

| Dataset | Canonical role | Records |
| --- | --- | ---: |
| noxi | speaker_a | 553 |
| noxi | speaker_b | 553 |
| recola | speaker_a | 10 |
| recola | speaker_b | 10 |

## 4. Coverage Summary

- Complete AV + emotion + 3D samples: `1124`
- Records missing emotion labels: `2`
- Records missing 3D features: `0`
- Alignment mismatches: `1124`
- Hidden files filtered from source tree: `2486`

## 5. Coverage By Dataset And Role

| Dataset | Canonical role | Records | Complete multimodal | Missing emotion | Missing video | Missing 3D | Alignment mismatch | Alignment unverified |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| noxi | speaker_a | 553 | 553 | 0 | 0 | 0 | 553 | 0 |
| noxi | speaker_b | 553 | 553 | 0 | 0 | 0 | 553 | 0 |
| recola | speaker_a | 10 | 9 | 1 | 0 | 0 | 9 | 1 |
| recola | speaker_b | 10 | 9 | 1 | 0 | 0 | 9 | 1 |

## 6. Transcript Workflow Status

| Workflow status | Count |
| --- | ---: |
| draft_ready | 8 |
| pending_asr | 1118 |

### Transcript Workflow By Dataset And Role

| Dataset | Canonical role | pending_asr | draft_ready | pending_review | verified |
| --- | --- | ---: | ---: | ---: | ---: |
| noxi | speaker_a | 551 | 2 | 0 | 0 |
| noxi | speaker_b | 551 | 2 | 0 | 0 |
| recola | speaker_a | 8 | 2 | 0 | 0 |
| recola | speaker_b | 8 | 2 | 0 | 0 |

## 7. Mapping Status

| Status | Count |
| --- | ---: |
| assumed | 1124 |
| unlinked | 2 |

## 8. Alignment Status

| Status | Count |
| --- | ---: |
| mismatch | 1124 |
| unverified | 2 |

## 9. Problem Breakdown

### Missing Emotion By Dataset And Role

| Dataset | Canonical role | Count | Example records |
| --- | --- | ---: | --- |
| recola | speaker_a | 1 | `recola/group-2/speaker_a/10` |
| recola | speaker_b | 1 | `recola/group-2/speaker_b/10` |

### Alignment Mismatch By Dataset And Role

| Dataset | Canonical role | Count | Delta summary | Example records |
| --- | --- | ---: | --- | --- |
| noxi | speaker_a | 553 | 1 | `noxi/001_2016-03-17_Paris/speaker_a/1`, `noxi/001_2016-03-17_Paris/speaker_a/2`, `noxi/001_2016-03-17_Paris/speaker_a/3`, `noxi/001_2016-03-17_Paris/speaker_a/4`, `noxi/001_2016-03-17_Paris/speaker_a/5` |
| noxi | speaker_b | 553 | 1 | `noxi/001_2016-03-17_Paris/speaker_b/1`, `noxi/001_2016-03-17_Paris/speaker_b/2`, `noxi/001_2016-03-17_Paris/speaker_b/3`, `noxi/001_2016-03-17_Paris/speaker_b/4`, `noxi/001_2016-03-17_Paris/speaker_b/5` |
| recola | speaker_a | 9 | 1 | `recola/group-2/speaker_a/1`, `recola/group-2/speaker_a/2`, `recola/group-2/speaker_a/3`, `recola/group-2/speaker_a/4`, `recola/group-2/speaker_a/5` |
| recola | speaker_b | 9 | 1 | `recola/group-2/speaker_b/1`, `recola/group-2/speaker_b/2`, `recola/group-2/speaker_b/3`, `recola/group-2/speaker_b/4`, `recola/group-2/speaker_b/5` |

## 10. Known Issues

- RECOLA currently contains AV and 3D samples without matching emotion CSV for some segment IDs.
- Emotion CSV data rows and 3D time steps commonly differ by one step and must be normalized before fusion training.
- Transcript workflow is initialized but remains pending ASR draft generation and manual review before formal ASR evaluation.

### Missing Emotion Examples

- `recola/group-2/speaker_a/10`
- `recola/group-2/speaker_b/10`

### Alignment Mismatch Examples

- `noxi/001_2016-03-17_Paris/speaker_a/1`
- `noxi/001_2016-03-17_Paris/speaker_a/2`
- `noxi/001_2016-03-17_Paris/speaker_a/3`
- `noxi/001_2016-03-17_Paris/speaker_a/4`
- `noxi/001_2016-03-17_Paris/speaker_a/5`
- `noxi/001_2016-03-17_Paris/speaker_a/6`
- `noxi/001_2016-03-17_Paris/speaker_a/7`
- `noxi/001_2016-03-17_Paris/speaker_a/8`
- `noxi/001_2016-03-17_Paris/speaker_a/9`
- `noxi/001_2016-03-17_Paris/speaker_a/10`

## 11. Manual Follow-up

- Confirm whether NoXI `P1/P2` exactly match `Expert_video/Novice_video` for all sessions.
- Confirm whether RECOLA segment 10 is intentionally unlabeled or missing during export.
- Decide a single preprocessing rule for the common `750/751` off-by-one alignment case.
- Start filling `data/derived/transcripts/val_transcripts_template.jsonl` with ASR draft outputs, then move records into manual review and final verification states.
