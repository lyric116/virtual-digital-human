# Manual Review Checklist: review_batch_001

## Scope

- Batch file: `data/derived/transcripts/batches/review_batch_001.jsonl`
- Transcript source: `data/derived/transcripts/val_transcripts_template.jsonl`
- Reviewer role: `asr_reviewer`
- Total records: `8`

## Review Procedure

1. Listen to the full `audio_path_16k_mono` file for each record.
2. Compare the audio against `draft_text_raw` and correct omissions, misrecognitions, punctuation, and sentence boundaries.
3. Fill `final_text` and `final_text_normalized` only after the draft is fully checked.
4. Update `review_status`, `review_decision`, `reviewer`, `reviewed_at`, and `quality_flags` in the transcript workflow file.
5. If the language metadata is wrong, correct `language` during review.
6. Keep `workflow_status=draft_ready` until review starts; move to `pending_review` or `verified` according to the review result.

## Batch Summary

| Record ID | Dataset | Role | Current status | Draft chars | Review flags |
| --- | --- | --- | --- | ---: | --- |
| noxi/001_2016-03-17_Paris/speaker_a/1 | noxi | speaker_a | draft_ready | 308 | language_metadata_needs_check, no_segment_timestamps |
| noxi/001_2016-03-17_Paris/speaker_a/2 | noxi | speaker_a | draft_ready | 470 | language_metadata_needs_check, no_segment_timestamps |
| noxi/001_2016-03-17_Paris/speaker_b/1 | noxi | speaker_b | draft_ready | 61 | language_metadata_needs_check, no_segment_timestamps |
| noxi/001_2016-03-17_Paris/speaker_b/2 | noxi | speaker_b | draft_ready | 13 | language_metadata_needs_check, short_utterance_confirm_audio, no_segment_timestamps |
| recola/group-2/speaker_a/1 | recola | speaker_a | draft_ready | 236 | language_metadata_needs_check, no_segment_timestamps |
| recola/group-2/speaker_a/2 | recola | speaker_a | draft_ready | 331 | language_metadata_needs_check, no_segment_timestamps |
| recola/group-2/speaker_b/1 | recola | speaker_b | draft_ready | 48 | language_metadata_needs_check, no_segment_timestamps |
| recola/group-2/speaker_b/2 | recola | speaker_b | draft_ready | 83 | language_metadata_needs_check, no_segment_timestamps |

## Record Details

### 1. `noxi/001_2016-03-17_Paris/speaker_a/1`

- Audio: `data/derived/audio_16k_mono/NoXI/001_2016-03-17_Paris/Expert_video/1.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-07T10:45:48.940825+00:00`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `Bonjour, tu m'entends ? Ok. Donc si j'ai bien compris, on doit parler de photographie, c'est ça ? Ok. Bon, j'ai dit que j'étais expert, mais enfin, je suis un expert amateur, quoi. Je vais juste faire un petit peu ce qui m'a amené à la photographie, ce que j'aime essayer de faire dedans et présenter un peu.`

Reviewer actions:
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized`.
- If the draft is acceptable, set `review_decision=approved`; otherwise use `needs_revision` and add notes.
- Add any reviewer observations into `quality_flags` and `notes`.

### 2. `noxi/001_2016-03-17_Paris/speaker_a/2`

- Audio: `data/derived/audio_16k_mono/NoXI/001_2016-03-17_Paris/Expert_video/2.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-07T10:45:50.329527+00:00`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `ça et si t'as des questions t'hésites pas du coup la photo en gros j'ai toujours joué avec des appareils quand j'étais petit ou des argentiques des numériques etc quand ça commençait à se démocratiser et c'est surtout pendant des voyages où j'ai commencé à prendre l'habitude de faire des photos de monuments de gens qui m'entouraient et petit à petit avec mon premier salaire en fait je me suis payé un des appareils photo objectif interchangeables les petits sortes de`

Reviewer actions:
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized`.
- If the draft is acceptable, set `review_decision=approved`; otherwise use `needs_revision` and add notes.
- Add any reviewer observations into `quality_flags` and `notes`.

### 3. `noxi/001_2016-03-17_Paris/speaker_b/1`

- Audio: `data/derived/audio_16k_mono/NoXI/001_2016-03-17_Paris/Novice_video/1.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-07T10:45:50.977593+00:00`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `Bonjour. Oui. C'est ce que j'ai compris aussi, oui. D'accord.`

Reviewer actions:
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized`.
- If the draft is acceptable, set `review_decision=approved`; otherwise use `needs_revision` and add notes.
- Add any reviewer observations into `quality_flags` and `notes`.

### 4. `noxi/001_2016-03-17_Paris/speaker_b/2`

- Audio: `data/derived/audio_16k_mono/NoXI/001_2016-03-17_Paris/Novice_video/2.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-07T10:45:51.374246+00:00`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, short_utterance_confirm_audio, no_segment_timestamps`
- Draft text: `D'accord. Ok.`

Reviewer actions:
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized`.
- If the draft is acceptable, set `review_decision=approved`; otherwise use `needs_revision` and add notes.
- Add any reviewer observations into `quality_flags` and `notes`.

### 5. `recola/group-2/speaker_a/1`

- Audio: `data/derived/audio_16k_mono/RECOLA/group-2/P41/1.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-07T10:45:52.361006+00:00`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `Cyril, ah pardon, excuse Cyril. Donc je crois, c'est ok là ? Ok. Ils t'ont passé aussi un super film comme chez moi juste avant ? Non, ils viennent de me montrer en fait un super film qui était assez négatif en tout cas. Mais bon, donc.`

Reviewer actions:
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized`.
- If the draft is acceptable, set `review_decision=approved`; otherwise use `needs_revision` and add notes.
- Add any reviewer observations into `quality_flags` and `notes`.

### 6. `recola/group-2/speaker_a/2`

- Audio: `data/derived/audio_16k_mono/RECOLA/group-2/P41/2.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-07T10:45:53.794546+00:00`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `Pour les machins, je sais pas, qu'est-ce que tu penses qui est le plus important ? Moi, j'ai commencé par queue et compagnie. Ouais, moi aussi, j'ai mis ça. Pour le deux perso, j'ai mis la boussole. Bon, là, je pense qu'on peut déjà commencer à se disputer. Je sais pas, toi, Tami, quoi ? Ah, intéressant. Violent, là, directement.`

Reviewer actions:
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized`.
- If the draft is acceptable, set `review_decision=approved`; otherwise use `needs_revision` and add notes.
- Add any reviewer observations into `quality_flags` and `notes`.

### 7. `recola/group-2/speaker_b/1`

- Audio: `data/derived/audio_16k_mono/RECOLA/group-2/P42/1.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-07T10:45:54.301736+00:00`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `Oui. Oui, moi je sais pas ton prénom. Ok. Quoi ?`

Reviewer actions:
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized`.
- If the draft is acceptable, set `review_decision=approved`; otherwise use `needs_revision` and add notes.
- Add any reviewer observations into `quality_flags` and `notes`.

### 8. `recola/group-2/speaker_b/2`

- Audio: `data/derived/audio_16k_mono/RECOLA/group-2/P42/2.wav`
- ASR engine: `qwen3-asr-flash`
- Generated at: `2026-03-07T10:45:54.906917+00:00`
- Current workflow status: `draft_ready`
- Current text status: `asr_generated`
- Current language: `zh-CN`
- Review flags: `language_metadata_needs_check, no_segment_timestamps`
- Draft text: `J'ai commencé par pull et pantalon supplémentaire. Nickel. Moi j'ai mis un couteau.`

Reviewer actions:
- Confirm the spoken language and update `language` if needed.
- Correct transcript content into `final_text` and `final_text_normalized`.
- If the draft is acceptable, set `review_decision=approved`; otherwise use `needs_revision` and add notes.
- Add any reviewer observations into `quality_flags` and `notes`.

