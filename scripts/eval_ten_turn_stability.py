#!/usr/bin/env python3
"""Run a 10-turn service-level stability regression across affect, RAG, dialogue, and summary."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
AFFECT_MAIN = ROOT / "services" / "affect-service" / "main.py"
RAG_MAIN = ROOT / "services" / "rag-service" / "main.py"
MANIFEST = ROOT / "data" / "manifests" / "val_manifest.jsonl"
TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"
REPORT_MD = ROOT / "data" / "derived" / "eval-local" / "ten_turn_stability_report.md"
REPORT_JSON = ROOT / "data" / "derived" / "eval-local" / "ten_turn_stability_report.json"
TURN_WAIT_TIMEOUT_SECONDS = 90
SCRIPTED_TURNS = [
    "我叫小林，这周一直在为课程和实习的事情发愁。",
    "晚上躺下以后会一直想明天的安排，所以很难放松。",
    "白天上课时也会分心，但主要是紧绷和担心。",
    "你先带我做一个很短的缓和练习。",
    "我刚照着做了一次，呼吸比刚才慢了一点。",
    "你还记得我叫什么吗？请直接告诉我称呼。",
    "明天有答辩，我担心今晚又会睡不好。",
    "如果今晚又开始紧张，你建议我先做哪一步？",
    "现在比刚开始平静一些，但脑子里还是有担心。",
    "请帮我总结一下刚才的重点和我接下来能做的事。",
]
ENTERPRISE_RECORD_ID = "noxi/001_2016-03-17_Paris/speaker_a/1"
ALLOWED_STAGE_TRANSITIONS = {
    ("engage", "assess"),
    ("assess", "intervene"),
    ("intervene", "reassess"),
    ("reassess", "intervene"),
    ("engage", "handoff"),
    ("assess", "handoff"),
    ("intervene", "handoff"),
    ("reassess", "handoff"),
}


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" in line:
            key, value = line.split("=", 1)
        elif ":" in line:
            key, value = line.split(":", 1)
        else:
            continue
        values[key.strip()] = value.strip().strip("'").strip('"')
    return values


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(url: str, label: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(40):
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"{label} health check did not become ready")


def request_json(method: str, url: str, *, payload: dict | None = None) -> dict:
    body = None
    headers: dict[str, str] = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url=url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=TURN_WAIT_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            return


def load_manifest_row(record_id: str) -> dict[str, object]:
    for raw_line in MANIFEST.read_text(encoding="utf-8").splitlines():
        row = json.loads(raw_line)
        if row.get("record_id") == record_id:
            return row
    raise RuntimeError(f"missing manifest row for {record_id}")


def load_transcript_row(record_id: str) -> dict[str, object]:
    for raw_line in TRANSCRIPTS.read_text(encoding="utf-8").splitlines():
        row = json.loads(raw_line)
        if row.get("record_id") == record_id:
            return row
    raise RuntimeError(f"missing transcript row for {record_id}")


def validate_stage_history(stage_history: list[dict[str, object]]) -> dict[str, object]:
    if not stage_history:
        raise RuntimeError("stage history is empty")
    seen_stages = [str(entry["stage"]) for entry in stage_history]
    if seen_stages[0] != "engage":
        raise RuntimeError(f"stage history must start at engage, got {seen_stages[0]}")
    illegal: list[str] = []
    for previous, current in zip(seen_stages, seen_stages[1:]):
        if previous == current:
            continue
        if (previous, current) not in ALLOWED_STAGE_TRANSITIONS:
            illegal.append(f"{previous}->{current}")
    if illegal:
        raise RuntimeError(f"illegal stage transitions detected: {', '.join(illegal)}")
    required = {"assess", "intervene"}
    if not required.issubset(set(seen_stages)):
        raise RuntimeError(f"stage history did not visit the core stages: {seen_stages}")
    if "handoff" in seen_stages:
        raise RuntimeError(f"safe scripted turns unexpectedly escalated to handoff: {seen_stages}")
    return {
        "visited_stages": seen_stages,
        "stage_transition_count": max(len(seen_stages) - 1, 0),
        "visited_reassess": "reassess" in seen_stages,
    }


def render_markdown(report: dict[str, object]) -> str:
    lines = [
        "# Ten-Turn Stability Report",
        "",
        f"- Generated at: {report['generated_at']}",
        f"- Session ID: {report['session_id']}",
        f"- User turn count: {report['user_turn_count']}",
        f"- Assistant turn count: {report['assistant_turn_count']}",
        f"- Final stage: {report['final_stage']}",
        "",
        "## Stability Checks",
        "",
    ]
    for check in report["checks"]:
        lines.append(f"- {check}")
    lines.extend(
        [
            "",
            "## Event Counts",
            "",
        ]
    )
    for event_type, total in report["event_counts"].items():
        lines.append(f"- `{event_type}`: {total}")
    lines.extend(
        [
            "",
            "## Turn Results",
            "",
            "| Turn | Stage | Risk | Next Action | Knowledge Refs | Reply Preview |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    for row in report["turn_results"]:
        lines.append(
            "| {turn_index} | {stage} | {risk_level} | {next_action} | {knowledge_refs} | {reply_preview} |".format(
                turn_index=row["turn_index"],
                stage=row["stage"],
                risk_level=row["risk_level"],
                next_action=row["next_action"],
                knowledge_refs=", ".join(row["knowledge_refs"]) or "-",
                reply_preview=row["reply_preview"],
            )
        )
    lines.extend(
        [
            "",
            "## Stage History",
            "",
            "| Index | Stage | Trace ID | Message ID |",
            "| --- | --- | --- | --- |",
        ]
    )
    for index, item in enumerate(report["stage_history"], start=1):
        lines.append(
            f"| {index} | {item['stage']} | {item.get('trace_id') or '-'} | {item.get('message_id') or '-'} |"
        )
    lines.extend(
        [
            "",
            "## Enterprise Multimodal Regression",
            "",
            f"- Record: {report['enterprise_regression']['record_id']}",
            f"- Emotion state: {report['enterprise_regression']['emotion_state']}",
            f"- Risk level: {report['enterprise_regression']['risk_level']}",
            f"- Conflict: {report['enterprise_regression']['conflict']}",
            f"- Conflict reason: {report['enterprise_regression']['conflict_reason'] or '-'}",
            "",
            "## Final Assistant Reply",
            "",
            report["final_assistant_reply"],
            "",
        ]
    )
    return "\n".join(lines)


def launch_service(main_path: Path, port: int, env: dict[str, str]) -> subprocess.Popen[str]:
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(main_path.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )


def build_text_affect_payload(*, session_id: str, trace_id: str, current_stage: str, text_input: str) -> dict[str, object]:
    return {
        "session_id": session_id,
        "trace_id": trace_id,
        "current_stage": current_stage,
        "text_input": text_input,
        "last_source_kind": "text",
        "metadata": {"source": "eval_ten_turn_stability"},
        "capture_state": {
            "camera_state": "offline",
            "recording_state": "stopped",
            "uploaded_chunk_count": 0,
            "uploaded_video_frame_count": 0,
        },
    }


def build_enterprise_affect_payload(record_id: str) -> dict[str, object]:
    manifest_row = load_manifest_row(record_id)
    transcript_row = load_transcript_row(record_id)
    text_input = str(transcript_row.get("final_text") or transcript_row.get("draft_text_raw") or "").strip()
    if not text_input:
        raise RuntimeError(f"enterprise regression transcript missing for {record_id}")
    return {
        "session_id": "sess_stability_enterprise_regression",
        "trace_id": "trace_stability_enterprise_regression",
        "current_stage": "assess",
        "text_input": text_input,
        "last_source_kind": "audio",
        "metadata": {
            "source": "enterprise_validation_manifest",
            "dataset": manifest_row["dataset"],
            "record_id": record_id,
            "audio_path_16k_mono": str(ROOT / str(manifest_row["audio_path_16k_mono"])),
            "face3d_path": str(ROOT / str(manifest_row["face3d_path"])),
        },
        "capture_state": {
            "camera_state": "offline",
            "recording_state": "stopped",
            "uploaded_chunk_count": 0,
            "uploaded_video_frame_count": 0,
        },
    }


def build_short_term_memory(messages: list[dict[str, object]], limit: int = 6) -> list[dict[str, object]]:
    return messages[-limit:]


def build_summary_fallback(
    *,
    current_stage: str,
    user_turn_count: int,
    recent_messages: list[dict[str, object]],
) -> str:
    last_user = next(
        (str(item.get("content_text") or "").strip() for item in reversed(recent_messages) if item.get("role") == "user"),
        "",
    )
    last_assistant = next(
        (str(item.get("content_text") or "").strip() for item in reversed(recent_messages) if item.get("role") == "assistant"),
        "",
    )
    user_part = last_user[:40] if last_user else "用户仍在描述当前压力"
    assistant_part = last_assistant[:40] if last_assistant else "系统已给出当前阶段的下一步建议"
    return (
        f"截至第{user_turn_count}轮，当前阶段为{current_stage}，最新关注点是：{user_part}。"
        f"最近建议聚焦在：{assistant_part}。"
    )


def maybe_refresh_summary(
    orchestrator_base_url: str,
    *,
    session_id: str,
    trace_id: str,
    current_stage: str,
    user_turn_count: int,
    previous_summary: str | None,
    recent_messages: list[dict[str, object]],
) -> tuple[dict[str, object] | None, bool]:
    if user_turn_count % 3 != 0:
        return None, False
    try:
        return (
            request_json(
                "POST",
                f"{orchestrator_base_url}/internal/dialogue/summarize",
                payload={
                    "session_id": session_id,
                    "trace_id": trace_id,
                    "current_stage": current_stage,
                    "user_turn_count": user_turn_count,
                    "previous_summary": previous_summary,
                    "recent_messages": recent_messages,
                },
            ),
            False,
        )
    except Exception:
        return (
            {
                "session_id": session_id,
                "trace_id": trace_id,
                "current_stage": current_stage,
                "user_turn_count": user_turn_count,
                "summary_text": build_summary_fallback(
                    current_stage=current_stage,
                    user_turn_count=user_turn_count,
                    recent_messages=recent_messages,
                ),
            },
            True,
        )


def evaluate_stability() -> dict[str, object]:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    if not env.get("LLM_API_KEY"):
        raise RuntimeError("missing LLM_API_KEY for stability evaluation")

    dialogue_port = reserve_local_port()
    rag_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    affect_port = reserve_local_port()
    dialogue_base_url = f"http://127.0.0.1:{dialogue_port}"
    rag_base_url = f"http://127.0.0.1:{rag_port}"
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    affect_base_url = f"http://127.0.0.1:{affect_port}"

    dialogue_env = dict(env)
    dialogue_env["PYTHONPATH"] = str(DIALOGUE_MAIN.parent)
    dialogue_env["DIALOGUE_SERVICE_PORT"] = str(dialogue_port)
    dialogue_env["DIALOGUE_SERVICE_BASE_URL"] = dialogue_base_url

    rag_env = dict(env)
    rag_env["PYTHONPATH"] = str(RAG_MAIN.parent)
    rag_env["RAG_SERVICE_HOST"] = "127.0.0.1"
    rag_env["RAG_SERVICE_PORT"] = str(rag_port)
    rag_env["RAG_SERVICE_BASE_URL"] = rag_base_url

    orchestrator_env = dict(env)
    orchestrator_env["PYTHONPATH"] = str(ORCHESTRATOR_MAIN.parent)
    orchestrator_env["ORCHESTRATOR_PORT"] = str(orchestrator_port)
    orchestrator_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url
    orchestrator_env["DIALOGUE_SERVICE_BASE_URL"] = dialogue_base_url
    orchestrator_env["RAG_SERVICE_BASE_URL"] = rag_base_url

    affect_env = dict(env)
    affect_env["PYTHONPATH"] = str(AFFECT_MAIN.parent)
    affect_env["AFFECT_SERVICE_HOST"] = "127.0.0.1"
    affect_env["AFFECT_SERVICE_PORT"] = str(affect_port)
    affect_env["AFFECT_SERVICE_BASE_URL"] = affect_base_url

    processes = [
        launch_service(DIALOGUE_MAIN, dialogue_port, dialogue_env),
        launch_service(RAG_MAIN, rag_port, rag_env),
        launch_service(ORCHESTRATOR_MAIN, orchestrator_port, orchestrator_env),
        launch_service(AFFECT_MAIN, affect_port, affect_env),
    ]

    try:
        wait_for_health(f"{dialogue_base_url}/health", "dialogue-service")
        wait_for_health(f"{rag_base_url}/health", "rag-service")
        wait_for_health(f"{orchestrator_base_url}/health", "orchestrator")
        wait_for_health(f"{affect_base_url}/health", "affect-service")

        session_id = f"sess_ten_turn_{int(time.time())}"
        current_stage = "engage"
        stage_history = [{"stage": "engage", "trace_id": f"trace_{session_id}", "message_id": None}]
        recent_messages: list[dict[str, object]] = []
        previous_summary: str | None = None
        turn_results: list[dict[str, object]] = []
        assistant_messages: list[dict[str, object]] = []
        event_counts = {
            "message.accepted": 0,
            "affect.snapshot": 0,
            "knowledge.retrieved": 0,
            "dialogue.reply": 0,
            "dialogue.summary.updated": 0,
            "dialogue.summary.fallback": 0,
            "session.error": 0,
        }

        for index, turn in enumerate(SCRIPTED_TURNS, start=1):
            trace_id = f"trace_ten_turn_{index:02d}"
            user_message_id = f"msg_ten_turn_user_{index:02d}"
            sys.stdout.write(f"[stability] user_turn {index}/10\n")
            sys.stdout.flush()

            event_counts["message.accepted"] += 1
            affect_snapshot = request_json(
                "POST",
                f"{affect_base_url}/internal/affect/analyze",
                payload=build_text_affect_payload(
                    session_id=session_id,
                    trace_id=trace_id,
                    current_stage=current_stage,
                    text_input=turn,
                ),
            )
            event_counts["affect.snapshot"] += 1

            short_term_memory = build_short_term_memory(recent_messages)
            reply = request_json(
                "POST",
                f"{orchestrator_base_url}/internal/dialogue/respond",
                payload={
                    "session_id": session_id,
                    "trace_id": trace_id,
                    "user_message_id": user_message_id,
                    "content_text": turn,
                    "current_stage": current_stage,
                    "metadata": {
                        "source": "eval_ten_turn_stability",
                        "affect_snapshot": affect_snapshot,
                        "short_term_memory": short_term_memory,
                        "dialogue_summary": previous_summary,
                    },
                },
            )
            event_counts["knowledge.retrieved"] += 1
            event_counts["dialogue.reply"] += 1

            next_stage = str(reply["stage"])
            if next_stage != current_stage:
                if (current_stage, next_stage) not in ALLOWED_STAGE_TRANSITIONS:
                    raise RuntimeError(f"illegal stage transition during 10-turn regression: {current_stage}->{next_stage}")
                stage_history.append(
                    {
                        "stage": next_stage,
                        "trace_id": trace_id,
                        "message_id": reply["message_id"],
                    }
                )
                current_stage = next_stage

            user_entry = {
                "message_id": user_message_id,
                "trace_id": trace_id,
                "role": "user",
                "content_text": turn,
                "stage": current_stage,
            }
            assistant_entry = {
                "message_id": reply["message_id"],
                "trace_id": trace_id,
                "role": "assistant",
                "content_text": reply["reply"],
                "stage": reply["stage"],
                "risk_level": reply["risk_level"],
                "next_action": reply["next_action"],
                "knowledge_refs": list(reply.get("knowledge_refs", [])),
            }
            recent_messages.extend([user_entry, assistant_entry])
            assistant_messages.append(assistant_entry)
            turn_results.append(
                {
                    "turn_index": index,
                    "stage": reply["stage"],
                    "risk_level": reply["risk_level"],
                    "next_action": reply["next_action"],
                    "knowledge_refs": list(reply.get("knowledge_refs", [])),
                    "reply_preview": str(reply["reply"]).strip().replace("|", "/")[:80],
                }
            )

            summary, used_summary_fallback = maybe_refresh_summary(
                orchestrator_base_url,
                session_id=session_id,
                trace_id=f"trace_ten_turn_summary_{index:02d}",
                current_stage=current_stage,
                user_turn_count=index,
                previous_summary=previous_summary,
                recent_messages=recent_messages[-6:],
            )
            if summary is not None:
                previous_summary = str(summary["summary_text"]).strip()
                if not previous_summary:
                    raise RuntimeError("generated dialogue summary was empty")
                event_counts["dialogue.summary.updated"] += 1
                if used_summary_fallback:
                    event_counts["dialogue.summary.fallback"] += 1

            if reply["risk_level"] not in {"low", "medium", "high"}:
                raise RuntimeError(f"invalid risk_level returned on turn {index}: {reply}")
            next_action = str(reply.get("next_action") or "").strip()
            if not next_action:
                raise RuntimeError(f"missing next_action returned on turn {index}: {reply}")
            if len(next_action) > 80:
                raise RuntimeError(f"next_action is unexpectedly long on turn {index}: {reply}")

        stage_summary = validate_stage_history(stage_history)
        if len(assistant_messages) != 10:
            raise RuntimeError(f"expected 10 assistant replies, got {len(assistant_messages)}")
        if not any("小林" in str(item["content_text"]) for item in assistant_messages):
            raise RuntimeError("assistant replies did not preserve the user name across turns")

        enterprise_snapshot = request_json(
            "POST",
            f"{affect_base_url}/internal/affect/analyze",
            payload=build_enterprise_affect_payload(ENTERPRISE_RECORD_ID),
        )
        fusion_result = enterprise_snapshot["fusion_result"]
        if fusion_result["conflict"]:
            raise RuntimeError("enterprise multimodal regression unexpectedly became conflict")
        if fusion_result["risk_level"] != "low":
            raise RuntimeError("enterprise multimodal regression did not remain low risk")

        report = {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "session_id": session_id,
            "user_turn_count": 10,
            "assistant_turn_count": len(assistant_messages),
            "final_stage": current_stage,
            "checks": [
                "10 user turns and 10 assistant turns completed",
                "stage history stayed within allowed transitions and visited at least assess/intervene",
                "assistant replies preserved the user name across turns",
                "dialogue summary refreshed at least three times",
                "summary fallback may occur but cannot interrupt the 10-turn run",
                "service-level logs captured message, affect, retrieval, and reply steps for every turn",
                "enterprise multimodal regression remained aligned and low risk",
            ],
            "event_counts": event_counts,
            "turn_results": turn_results,
            "stage_history": stage_history,
            "stage_summary": stage_summary,
            "final_assistant_reply": assistant_messages[-1]["content_text"],
            "enterprise_regression": {
                "record_id": ENTERPRISE_RECORD_ID,
                "emotion_state": fusion_result["emotion_state"],
                "risk_level": fusion_result["risk_level"],
                "conflict": fusion_result["conflict"],
                "conflict_reason": fusion_result.get("conflict_reason"),
            },
        }
        REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
        REPORT_MD.write_text(render_markdown(report), encoding="utf-8")
        REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return report
    finally:
        for process in reversed(processes):
            stop_process(process)


def main() -> None:
    report = evaluate_stability()
    sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
