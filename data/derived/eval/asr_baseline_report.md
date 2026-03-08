# ASR Baseline Report

## Scope

- Generated at: `2026-03-08T14:01:49.244127+00:00`
- Transcript workflow: `data/derived/transcripts/val_transcripts_template.jsonl`
- Hypothesis source: `draft`
- Eligible records: `0`
- Gate: `workflow_status=verified && locked_for_eval=true && text_status=human_verified`

## Gating Summary

| Item | Count |
| --- | ---: |
| total_rows | 1126 |
| eligible_records | 0 |
| not_verified | 1126 |
| not_locked_for_eval | 0 |
| not_human_verified | 0 |
| missing_final_text | 0 |

## Status

Blocked: no transcript rows currently satisfy the formal ASR evaluation gate.

## Next Action

- Finish manual review on a small subset.
- Mark approved rows with `locked_for_eval=true`.
- Re-run `scripts/eval_asr_baseline.py` to generate the first formal WER/SER baseline.

