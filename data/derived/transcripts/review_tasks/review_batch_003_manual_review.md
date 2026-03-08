# Manual Review Checklist: review_batch_003

## Scope

- Batch file: `data/derived/transcripts/batches/review_batch_003.jsonl`
- Transcript source: `data/derived/transcripts/val_transcripts_template.jsonl`
- Reviewer role: `asr_reviewer`
- Total records: `4`

## Review Procedure

1. Listen to the full `audio_path_16k_mono` file for each record.
2. Compare the audio against `draft_text_raw` and correct omissions, misrecognitions, punctuation, and sentence boundaries.
3. Fill `final_text` and `final_text_normalized` only after the draft is fully checked.
4. Use `scripts/manage_transcript_review.py start-review` when work begins, then use `complete-review` when the item is finished.
5. If the language metadata is wrong, correct `language` during review.
6. Let the review script move `workflow_status` to `pending_review` or `verified`; do not hand-edit state fields unless recovery is required.

## Batch Summary

| Record ID | Dataset | Role | Current status | Draft chars | Review flags |
| --- | --- | --- | --- | ---: | --- |
| noxi/001_2016-03-17_Paris/speaker_a/3 | noxi | speaker_a | draft_ready | 522 | language_metadata_needs_check, no_segment_timestamps |
| noxi/001_2016-03-17_Paris/speaker_b/3 | noxi | speaker_b | draft_ready | 42 | language_metadata_needs_check, no_segment_timestamps |
| recola/group-2/speaker_a/3 | recola | speaker_a | draft_ready | 156 | language_metadata_needs_check, no_segment_timestamps |
| recola/group-2/speaker_b/3 | recola | speaker_b | draft_ready | 220 | language_metadata_needs_check, no_segment_timestamps |

## Record Details

### 1. `noxi/001_2016-03-17_Paris/speaker_a/3`

- Audio: `data/derived/audio_16k_mono/NoXI/001_2016-03-17_Paris/Expert_video/3.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-08T10:34:52.318225Z`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `de réflexe mais compact, je sais pas si tu connais un petit peu, c'est genre les, c'est des appareils photo qu'ont la taille de, d'appareils compacts, mais tu peux, au lieu d'avoir un objectif qui se rentre comme ça, tu peux choisir des objectifs, les changer, etc. Et en fait la photo, les trois quarts de, ce qui va faire une bonne photo souvent c'est l'optique, si t'as une bonne optique, tu vas pouvoir laisser passer plus ou moins de lumière et avoir des, des détails, des, des plans qui vont être plus ou moins fins.`

Reviewer actions:
- Start review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py start-review --record-id noxi/001_2016-03-17_Paris/speaker_a/3 --reviewer <reviewer>`
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized` via the review CLI.
- Complete review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py complete-review --record-id noxi/001_2016-03-17_Paris/speaker_a/3 --reviewer <reviewer> --decision approved --final-text "..."`
- If the draft is not acceptable, complete review with `--decision needs_revision` and add notes or quality flags.

### 2. `noxi/001_2016-03-17_Paris/speaker_b/3`

- Audio: `data/derived/audio_16k_mono/NoXI/001_2016-03-17_Paris/Novice_video/3.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-08T10:34:53.053023Z`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `Pas beaucoup, non. D'accord. D'accord. Ok.`

Reviewer actions:
- Start review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py start-review --record-id noxi/001_2016-03-17_Paris/speaker_b/3 --reviewer <reviewer>`
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized` via the review CLI.
- Complete review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py complete-review --record-id noxi/001_2016-03-17_Paris/speaker_b/3 --reviewer <reviewer> --decision approved --final-text "..."`
- If the draft is not acceptable, complete review with `--decision needs_revision` and add notes or quality flags.

### 3. `recola/group-2/speaker_a/3`

- Audio: `data/derived/audio_16k_mono/RECOLA/group-2/P41/3.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-08T10:34:53.916279Z`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `Le couteau, si j'ose demander ? Non, je suis d'accord. Ah ouais, ok, d'accord, je comprends. Bon, je savais pas si, bon, ok, la prochaine ville est là, 128.`

Reviewer actions:
- Start review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py start-review --record-id recola/group-2/speaker_a/3 --reviewer <reviewer>`
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized` via the review CLI.
- Complete review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py complete-review --record-id recola/group-2/speaker_a/3 --reviewer <reviewer> --decision approved --final-text "..."`
- If the draft is not acceptable, complete review with `--decision needs_revision` and add notes or quality flags.

### 4. `recola/group-2/speaker_b/3`

- Audio: `data/derived/audio_16k_mono/RECOLA/group-2/P42/3.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-08T10:34:54.721205Z`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `Parce que c'est utile pour beaucoup de choses. Non, mais parce que je sais pas. Vu qu'ils sont dans une région où il y a des branchages et tout, je me suis dit, je sais pas, genre histoire. Et toi, pourquoi la boussole ?`

Reviewer actions:
- Start review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py start-review --record-id recola/group-2/speaker_b/3 --reviewer <reviewer>`
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized` via the review CLI.
- Complete review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py complete-review --record-id recola/group-2/speaker_b/3 --reviewer <reviewer> --decision approved --final-text "..."`
- If the draft is not acceptable, complete review with `--decision needs_revision` and add notes or quality flags.

