# Label Mapping

## 1. Purpose

This document is the implementation-facing companion to [data_spec.md](/home/lyricx/code/virtual_huamn/docs/data_spec.md). It defines how raw enterprise emotion labels are converted into the project's internal label space for data processing, offline evaluation, and multimodal fusion.

## 2. Raw Label Sources

Emotion CSV files currently expose:

- Facial action units: `AU1`, `AU2`, `AU4`, `AU6`, `AU7`, `AU9`, `AU10`, `AU12`, `AU14`, `AU15`, `AU17`, `AU23`, `AU24`, `AU25`, `AU26`
- Continuous dimensions: `valence`, `arousal`
- Discrete emotion probabilities: `Neutral`, `Happy`, `Sad`, `Surprise`, `Fear`, `Disgust`, `Anger`, `Contempt`

## 3. Internal Label Layers

The project should keep three label layers:

- `fine_emotion`
- `coarse_emotion`
- `affect_state`

## 4. Fine Emotion Mapping

| Raw column | Internal value |
| --- | --- |
| `Neutral` | `neutral` |
| `Happy` | `happy` |
| `Sad` | `sad` |
| `Surprise` | `surprise` |
| `Fear` | `fear` |
| `Disgust` | `disgust` |
| `Anger` | `anger` |
| `Contempt` | `contempt` |

Rule:

- Select the maximum discrete emotion probability as `fine_emotion`
- Save the corresponding score as `fine_emotion_confidence`

## 5. Coarse Emotion Mapping

| Fine emotion | Coarse emotion |
| --- | --- |
| `neutral` | `neutral` |
| `happy` | `positive` |
| `sad` | `low_mood` |
| `fear` | `anxious` |
| `surprise` | `high_arousal_ambiguous` |
| `anger` | `negative_activated` |
| `disgust` | `negative_activated` |
| `contempt` | `negative_activated` |

## 6. Affect State Rules

Use a rule-based first version:

- `valence >= 0.2` and `coarse_emotion = positive` -> `positive_engaged`
- `valence <= -0.2` and `coarse_emotion = low_mood` -> `negative_low_arousal`
- `arousal >= 0.35` and `coarse_emotion in {anxious, high_arousal_ambiguous, negative_activated}` -> `negative_high_arousal`
- all other cases -> `neutral_or_mixed`

## 7. AU Usage

Action units are not treated as final supervision labels in V1.

Recommended usage:

- expression explainability
- AU activity summaries
- future facial behavior control

Suggested derived fields:

- `au_active_count`
- `au_top_k`
- `au_signature`

## 8. Risk Boundary

These enterprise labels describe emotion and facial behavior, not clinical risk.

Therefore:

- do not map `valence` or `arousal` directly to `risk_level`
- do not treat `sad` as equivalent to depression
- do not use this mapping as a standalone safety classifier

## 9. Output Schema Suggestion

Any label conversion step should output at least:

- `fine_emotion`
- `fine_emotion_confidence`
- `coarse_emotion`
- `affect_state`
- `valence`
- `arousal`
- `au_active_count`
- `label_source`

## 10. Validation Checklist

Before using converted labels downstream, verify:

1. raw CSV columns match the expected schema
2. hidden files were filtered before counting samples
3. discrete probabilities are numeric and non-empty
4. `fine_emotion` was derived from the actual maximum probability
5. `risk_level` was not generated directly from this mapping

## 11. Manifest Integration Notes

This mapping should be used together with `data/manifests/val_manifest.jsonl`, not as a standalone label source.

- attach converted labels back to the same `record_id`
- preserve `canonical_role` from the manifest
- keep `label_status` and `alignment_status` visible in downstream outputs
- treat the common `emotion_num_rows=750` and `face3d_num_steps=751` pattern as a preprocessing issue, not as a reason to rewrite labels
- the current mapping baseline applies to `1124` labeled records and excludes the `2` RECOLA records that currently have no emotion CSV
