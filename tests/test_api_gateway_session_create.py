from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

from pydantic import ValidationError


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"


def load_gateway_module():
    spec = importlib.util.spec_from_file_location("api_gateway_main_test", GATEWAY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load api gateway module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeSessionRepository:
    def __init__(self) -> None:
        self.session_calls: list[dict] = []
        self.message_calls: list[dict] = []
        self.event_calls: list[dict] = []
        self.memory_calls: list[dict] = []
        self.summary_update_calls: list[dict] = []
        self.deleted_media_ids: list[str] = []
        self.user_turn_count = 1
        self.session_metadata: dict = {}

    def create_session(self, payload):
        dumped = payload.model_dump()
        self.session_calls.append(dumped)
        return {
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
            "status": "created",
            "stage": "engage",
            "input_modes": dumped["input_modes"],
            "avatar_id": dumped.get("avatar_id") or "companion_female_01",
            "metadata": dumped.get("metadata") or {},
            "started_at": "2026-03-07T14:00:00Z",
            "updated_at": "2026-03-07T14:00:00Z",
        }

    def get_session_summary(self, session_id: str):
        return {
            "session_id": session_id,
            "trace_id": "trace_fake_001",
            "status": "active",
            "stage": "engage",
            "metadata": self.session_metadata,
            "updated_at": "2026-03-07T14:01:00Z",
        }

    def get_session_state(self, session_id: str):
        return {
            "session": {
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "status": "active",
                "stage": "assess",
                "input_modes": ["text", "audio"],
                "avatar_id": "companion_female_01",
                "metadata": self.session_metadata,
                "started_at": "2026-03-07T14:00:00Z",
                "updated_at": "2026-03-07T14:02:00Z",
            },
            "messages": [
                {
                    "message_id": "msg_user_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "最近睡不好。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                    "metadata": {"client_seq": 1},
                },
                {
                    "message_id": "msg_assistant_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "role": "assistant",
                    "status": "completed",
                    "source_kind": "text",
                    "content_text": "这种情况是晚上更明显吗？",
                    "submitted_at": "2026-03-07T14:01:03Z",
                    "metadata": {"stage": "assess", "risk_level": "medium"},
                },
            ],
        }

    def get_session_export(self, session_id: str):
        return {
            "session_id": session_id,
            "trace_id": "trace_fake_001",
            "status": "active",
            "stage": "assess",
            "input_modes": ["text", "audio"],
            "avatar_id": "companion_female_01",
            "metadata": self.session_metadata,
            "started_at": "2026-03-07T14:00:00Z",
            "updated_at": "2026-03-07T14:02:00Z",
            "exported_at": "2026-03-07T14:03:00Z",
            "messages": [
                {
                    "message_id": "msg_user_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "最近睡不好。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                    "metadata": {"client_seq": 1},
                },
                {
                    "message_id": "msg_assistant_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "role": "assistant",
                    "status": "completed",
                    "source_kind": "text",
                    "content_text": "这种情况是晚上更明显吗？",
                    "submitted_at": "2026-03-07T14:01:03Z",
                    "metadata": {
                        "stage": "assess",
                        "risk_level": "medium",
                        "emotion": "anxious",
                        "next_action": "ask_followup",
                    },
                },
            ],
            "stage_history": [
                {
                    "stage": "engage",
                    "trace_id": "trace_fake_001",
                    "changed_at": "2026-03-07T14:00:00Z",
                    "message_id": None,
                },
                {
                    "stage": "assess",
                    "trace_id": "trace_fake_001",
                    "changed_at": "2026-03-07T14:01:03Z",
                    "message_id": "msg_assistant_001",
                },
            ],
            "events": [
                {
                    "event_id": "evt_session_created_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "message_id": None,
                    "event_type": "session.created",
                    "schema_version": "v1alpha1",
                    "source_service": "api_gateway",
                    "payload": {"stage": "engage"},
                    "emitted_at": "2026-03-07T14:00:00Z",
                },
                {
                    "event_id": "evt_dialogue_reply_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "message_id": "msg_assistant_001",
                    "event_type": "dialogue.reply",
                    "schema_version": "v1alpha1",
                    "source_service": "orchestrator",
                    "payload": {"stage": "assess"},
                    "emitted_at": "2026-03-07T14:01:03Z",
                },
            ],
        }

    def get_recent_dialogue_context(
        self,
        session_id: str,
        *,
        limit: int = 6,
        exclude_message_id: str | None = None,
    ):
        self.memory_calls.append(
            {
                "session_id": session_id,
                "limit": limit,
                "exclude_message_id": exclude_message_id,
            }
        )
        return [
            {
                "message_id": "msg_user_000",
                "role": "user",
                "source_kind": "text",
                "content_text": "我叫小李。",
                "stage": None,
                "submitted_at": "2026-03-07T14:00:30Z",
            },
            {
                "message_id": "msg_assistant_000",
                "role": "assistant",
                "source_kind": "text",
                "content_text": "你好，小李。",
                "stage": "engage",
                "submitted_at": "2026-03-07T14:00:40Z",
            },
        ][:limit]

    def count_user_turns(self, session_id: str):
        return self.user_turn_count

    def update_dialogue_summary(self, session_id: str, summary_payload: dict):
        self.summary_update_calls.append(
            {
                "session_id": session_id,
                "summary_payload": summary_payload,
            }
        )
        self.session_metadata = {
            **self.session_metadata,
            "dialogue_summary": summary_payload,
        }
        return {
            "session_id": session_id,
            "trace_id": "trace_fake_001",
            "status": "active",
            "stage": "intervene",
            "metadata": self.session_metadata,
            "updated_at": "2026-03-07T14:01:05Z",
        }

    def create_user_text_message(self, session_id: str, payload):
        dumped = payload.model_dump()
        self.message_calls.append({"session_id": session_id, **dumped})
        return {
            "session": {
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "status": "active",
                "stage": "engage",
                "updated_at": "2026-03-07T14:01:00Z",
            },
            "message": {
                "message_id": "msg_fake_001",
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "role": "user",
                "status": "accepted",
                "source_kind": "text",
                "content_text": dumped["content_text"],
                "submitted_at": "2026-03-07T14:01:00Z",
                "client_seq": dumped.get("client_seq"),
                "metadata": dumped.get("metadata") or {},
            },
        }

    def create_assistant_dialogue_message(self, session_id: str, payload):
        return {
            "session": {
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "status": "active",
                "stage": payload.stage,
                "updated_at": "2026-03-07T14:01:03Z",
            },
            "message": {
                "message_id": payload.message_id,
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "role": "assistant",
                "status": "completed",
                "source_kind": "text",
                "content_text": payload.reply,
                "submitted_at": "2026-03-07T14:01:03Z",
                "metadata": {
                    "stage": payload.stage,
                    "next_action": payload.next_action,
                    "risk_level": payload.risk_level,
                    "safety_flags": payload.safety_flags,
                    "model_stage": payload.stage,
                    "model_next_action": payload.next_action,
                    "stage_before": "engage",
                    "stage_machine_reason": "accept_next_stage",
                    "next_action_machine_reason": "preserve_model_action",
                    "risk_rule_precheck": "high_risk_rule_precheck" in payload.safety_flags,
                    "risk_rule_flags": [
                        flag for flag in payload.safety_flags if flag.startswith("rule_hit:")
                    ],
                },
            },
        }

    def record_system_event(self, envelope: dict):
        self.event_calls.append(envelope)

    def delete_media_asset(self, media_id: str) -> None:
        self.deleted_media_ids.append(media_id)


def test_create_session_endpoint_returns_contract_shape():
    module = load_gateway_module()
    repository = FakeSessionRepository()
    payload = module.SessionCreateRequest()
    body = module.create_session_record(repository, payload)

    assert isinstance(body, dict)
    assert body["session_id"] == "sess_fake_001"
    assert body["trace_id"] == "trace_fake_001"
    assert body["status"] == "created"
    assert body["stage"] == "engage"
    assert body["input_modes"] == ["text", "audio"]


def test_build_event_envelope_copies_session_lineage_into_payload():
    module = load_gateway_module()
    envelope = module.build_event_envelope(
        session={
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
            "record_id": "noxi/sample/1",
            "dataset": "noxi",
            "canonical_role": "speaker_a",
            "segment_id": "1",
        },
        event_type="affect.snapshot",
        payload={"stage": "assess"},
        source_service="affect_service",
    )

    assert envelope["payload"]["record_id"] == "noxi/sample/1"
    assert envelope["payload"]["dataset"] == "noxi"
    assert envelope["payload"]["canonical_role"] == "speaker_a"
    assert envelope["payload"]["segment_id"] == "1"


def test_create_client_runtime_event_record_accepts_supported_event_type():
    module = load_gateway_module()
    repository = FakeSessionRepository()
    response = module.create_client_runtime_event_record(
        repository,
        "sess_fake_001",
        module.ClientRuntimeEventRequest(
            event_type="tts.synthesized",
            message_id="msg_assistant_001",
            payload={"voice_id": "zh-CN-XiaoxiaoNeural"},
        ),
    )

    assert response.event_type == "tts.synthesized"
    assert repository.event_calls[-1]["source_service"] == "web_client"
    assert repository.event_calls[-1]["message_id"] == "msg_assistant_001"
    assert repository.event_calls[-1]["payload"]["voice_id"] == "zh-CN-XiaoxiaoNeural"


def test_create_session_rejects_invalid_input_modes():
    module = load_gateway_module()
    try:
        module.SessionCreateRequest(input_modes=[])
    except ValidationError:
        assert True
        return
    raise AssertionError("expected SessionCreateRequest validation to fail for empty input_modes")


def test_stage_machine_prevents_forward_skip_and_backward_jump():
    module = load_gateway_module()

    forward_stage, forward_reason = module.resolve_session_stage_transition(
        current_stage="assess",
        proposed_stage="reassess",
        risk_level="medium",
    )
    backward_stage, backward_reason = module.resolve_session_stage_transition(
        current_stage="intervene",
        proposed_stage="engage",
        risk_level="low",
    )

    assert forward_stage == "intervene"
    assert forward_reason == "prevent_forward_skip"
    assert backward_stage == "intervene"
    assert backward_reason == "prevent_backward_jump"


def test_stage_machine_allows_reassess_loopback_and_handoff():
    module = load_gateway_module()

    loop_stage, loop_reason = module.resolve_session_stage_transition(
        current_stage="reassess",
        proposed_stage="intervene",
        risk_level="low",
    )
    handoff_stage, handoff_reason = module.resolve_session_stage_transition(
        current_stage="engage",
        proposed_stage="assess",
        risk_level="high",
    )

    assert loop_stage == "intervene"
    assert loop_reason == "reassess_loopback"
    assert handoff_stage == "handoff"
    assert handoff_reason == "handoff_requested"


def test_next_action_syncs_when_stage_is_rewritten():
    module = load_gateway_module()

    action, reason = module.resolve_next_action_for_stage(
        proposed_stage="reassess",
        resolved_stage="intervene",
        proposed_next_action="reassess",
    )
    handoff_action, handoff_reason = module.resolve_next_action_for_stage(
        proposed_stage="assess",
        resolved_stage="handoff",
        proposed_next_action="ask_open_question",
    )

    assert action == "intervene"
    assert reason == "sync_to_resolved_stage"
    assert handoff_action == "handoff"
    assert handoff_reason == "sync_to_resolved_stage"


def test_high_risk_rule_detects_obvious_self_harm_language():
    module = load_gateway_module()

    match = module.detect_high_risk_rule_match("我觉得活着没意义，甚至想伤害自己。")
    no_match = module.detect_high_risk_rule_match("这周压力很大，但我想继续找办法调整。")

    assert match is not None
    assert match["risk_level"] == "high"
    assert "suicide_intent" in match["matched_labels"]
    assert "self_harm_intent" in match["matched_labels"]
    assert no_match is None


def test_text_message_accept_returns_contract_shape():
    module = load_gateway_module()
    repository = FakeSessionRepository()
    payload = module.TextMessageSubmitRequest(content_text="今天压力有点大", client_seq=3)
    body = module.create_text_message_record(repository, "sess_fake_001", payload)

    assert isinstance(body, dict)
    assert body["message"]["message_id"] == "msg_fake_001"
    assert body["message"]["session_id"] == "sess_fake_001"
    assert body["message"]["trace_id"] == "trace_fake_001"
    assert body["message"]["status"] == "accepted"
    assert body["message"]["content_text"] == "今天压力有点大"
    assert repository.message_calls[0]["client_seq"] == 3


def test_request_dialogue_reply_includes_short_term_memory(monkeypatch):
    module = load_gateway_module()
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return (
                b'{"session_id":"sess_fake_001","trace_id":"trace_fake_001","message_id":"msg_assistant_001",'
                b'"reply":"\xe4\xbd\xa0\xe5\xa5\xbd\xef\xbc\x8c\xe5\xb0\x8f\xe6\x9d\x8e\xe3\x80\x82","emotion":"neutral",'
                b'"risk_level":"low","stage":"engage","next_action":"ask_followup",'
                b'"knowledge_refs":[],"avatar_style":"warm_support","safety_flags":[]}'
            )

    def fake_urlopen(request, timeout):
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(module.urllib_request, "urlopen", fake_urlopen)

    response = module.request_dialogue_reply(
        module.GatewaySettings.from_env(),
        {
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
            "stage": "engage",
        },
        {
            "message_id": "msg_user_001",
            "content_text": "你还记得我叫什么吗？",
        },
        short_term_memory=[
            {
                "message_id": "msg_user_000",
                "role": "user",
                "source_kind": "text",
                "content_text": "我叫小李。",
                "stage": None,
                "submitted_at": "2026-03-07T14:00:30Z",
            }
        ],
        dialogue_summary={
            "summary_text": "用户自述最近烦躁，并说明自己叫小李。",
            "user_turn_count": 3,
        },
    )

    assert response.reply == "你好，小李。"
    assert captured["body"]["metadata"]["short_term_memory"][0]["content_text"] == "我叫小李。"
    assert captured["body"]["metadata"]["dialogue_summary"]["user_turn_count"] == 3
    assert "affect_snapshot" not in captured["body"]["metadata"]


def test_request_dialogue_reply_includes_affect_snapshot(monkeypatch):
    module = load_gateway_module()
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return (
                b'{"session_id":"sess_fake_001","trace_id":"trace_fake_001","message_id":"msg_assistant_002",'
                b'"reply":"\xe6\x88\x91\xe6\x83\xb3\xe5\x85\x88\xe5\x86\x8d\xe7\xa1\xae\xe8\xae\xa4\xe4\xb8\x80\xe4\xb8\x8b\xe4\xbd\xa0\xe7\x8e\xb0\xe5\x9c\xa8\xe7\x9a\x84\xe7\x8a\xb6\xe6\x80\x81\xe3\x80\x82","emotion":"guarded",'
                b'"risk_level":"medium","stage":"assess","next_action":"ask_followup",'
                b'"knowledge_refs":[],"avatar_style":"calm_guarded","safety_flags":["affect_conflict_clarification"]}'
            )

    def fake_urlopen(request, timeout):
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(module.urllib_request, "urlopen", fake_urlopen)

    affect_snapshot = module.AffectAnalyzeResponse(
        session_id="sess_fake_001",
        trace_id="trace_fake_001",
        current_stage="engage",
        generated_at="2026-03-10T12:00:00Z",
        source_context=module.AffectSourceContext(
            origin="test",
            dataset="live_web",
            record_id="session/sess_fake_001",
            note="test conflict",
        ),
        text_result=module.AffectLaneResult(
            status="ready",
            label="neutral",
            confidence=0.64,
            evidence=[],
            detail="text",
        ),
        audio_result=module.AffectLaneResult(
            status="ready",
            label="slow_low_energy_proxy",
            confidence=0.74,
            evidence=[],
            detail="audio",
        ),
        video_result=module.AffectLaneResult(
            status="ready",
            label="stable_gaze_proxy",
            confidence=0.74,
            evidence=[],
            detail="video",
        ),
        fusion_result=module.AffectFusionResult(
            emotion_state="needs_clarification",
            risk_level="medium",
            confidence=0.74,
            conflict=True,
            conflict_reason="text-neutral; audio-slow_low_energy_proxy; video-stable_gaze_proxy",
            detail="fusion",
        ),
    )

    response = module.request_dialogue_reply(
        module.GatewaySettings.from_env(),
        {
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
            "stage": "engage",
        },
        {
            "message_id": "msg_user_001",
            "content_text": "今天就普通聊聊，先说说最近的情况。",
        },
        affect_snapshot=affect_snapshot,
    )

    assert response.next_action == "ask_followup"
    assert captured["body"]["metadata"]["affect_snapshot"]["fusion_result"]["conflict"] is True
    assert captured["body"]["metadata"]["affect_snapshot"]["fusion_result"]["conflict_reason"].startswith(
        "text-neutral"
    )


def test_dialogue_summary_refresh_rule_respects_turn_interval():
    module = load_gateway_module()

    assert not module.should_refresh_dialogue_summary(user_turn_count=2, existing_summary=None)
    assert module.should_refresh_dialogue_summary(user_turn_count=3, existing_summary=None)
    assert not module.should_refresh_dialogue_summary(
        user_turn_count=3,
        existing_summary={"summary_text": "已有摘要", "user_turn_count": 3},
    )
    assert module.should_refresh_dialogue_summary(
        user_turn_count=6,
        existing_summary={"summary_text": "旧摘要", "user_turn_count": 3},
    )


def test_request_affect_snapshot_uses_message_metadata(monkeypatch):
    module = load_gateway_module()
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return json.dumps(
                {
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "current_stage": "engage",
                    "generated_at": "2026-03-10T12:00:00Z",
                    "source_context": {
                        "origin": "test",
                        "dataset": "noxi",
                        "record_id": "noxi/sample/1",
                        "note": "bound test sample",
                    },
                    "text_result": {
                        "status": "ready",
                        "label": "neutral",
                        "confidence": 0.64,
                        "evidence": [],
                        "detail": "text",
                    },
                    "audio_result": {
                        "status": "ready",
                        "label": "slow_low_energy_proxy",
                        "confidence": 0.74,
                        "evidence": [],
                        "detail": "audio",
                    },
                    "video_result": {
                        "status": "ready",
                        "label": "stable_gaze_proxy",
                        "confidence": 0.74,
                        "evidence": [],
                        "detail": "video",
                    },
                    "fusion_result": {
                        "emotion_state": "needs_clarification",
                        "risk_level": "medium",
                        "confidence": 0.74,
                        "conflict": True,
                        "conflict_reason": "text-neutral; audio-slow_low_energy_proxy; video-stable_gaze_proxy",
                        "detail": "fusion",
                    },
                },
                ensure_ascii=False,
            ).encode("utf-8")

    def fake_urlopen(request, timeout):
        captured["body"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(module.urllib_request, "urlopen", fake_urlopen)

    response = module.request_affect_snapshot(
        module.GatewaySettings.from_env(),
        {
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
            "stage": "engage",
            "metadata": {"source": "session-default"},
        },
        {
            "message_id": "msg_user_001",
            "source_kind": "text",
            "content_text": "今天就普通聊聊，先说说最近的情况。",
            "metadata": {
                "source": "verify_dialogue_conflict_clarification",
                "dataset": "noxi",
                "record_id": "noxi/sample/1",
                "audio_path_16k_mono": "data/derived/audio.wav",
                "video_frame_path": "data/derived/frame.npy",
            },
        },
    )

    assert response.fusion_result.conflict is True
    assert captured["body"]["metadata"]["audio_path_16k_mono"] == "data/derived/audio.wav"
    assert captured["body"]["metadata"]["video_frame_path"] == "data/derived/frame.npy"
    assert captured["body"]["metadata"]["source"] == "verify_dialogue_conflict_clarification"
    assert captured["timeout"] == 10


def test_dispatch_pipeline_excludes_current_message_from_memory_and_syncs_next_action(monkeypatch):
    module = load_gateway_module()
    repository = FakeSessionRepository()
    connection_registry = module.ConnectionRegistry()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                session_repository=repository,
                settings=module.GatewaySettings.from_env(),
                connection_registry=connection_registry,
            )
        )
    )

    def fake_request_dialogue_reply(
        settings,
        session,
        message,
        *,
        short_term_memory=None,
        dialogue_summary=None,
        affect_snapshot=None,
    ):
        assert short_term_memory is not None
        assert all(item["message_id"] != message["message_id"] for item in short_term_memory)
        assert dialogue_summary is None
        return module.DialogueReplyResponse(
            session_id=session["session_id"],
            trace_id=session["trace_id"],
            message_id="msg_assistant_002",
            reply="我们先做一次简单练习。",
            emotion="supportive",
            risk_level="medium",
            stage="reassess",
            next_action="reassess",
            knowledge_refs=[],
            avatar_style="warm_support",
            safety_flags=[],
        )

    def fake_create_assistant_dialogue_message(session_id, payload):
        resolved_stage, stage_reason = module.resolve_session_stage_transition(
            current_stage="assess",
            proposed_stage=payload.stage,
            risk_level=payload.risk_level,
        )
        resolved_action, action_reason = module.resolve_next_action_for_stage(
            proposed_stage=payload.stage,
            resolved_stage=resolved_stage,
            proposed_next_action=payload.next_action,
        )
        return {
            "session": {
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "status": "active",
                "stage": resolved_stage,
                "updated_at": "2026-03-07T14:01:03Z",
            },
            "message": {
                "message_id": payload.message_id,
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "role": "assistant",
                "status": "completed",
                "source_kind": "text",
                "content_text": payload.reply,
                "submitted_at": "2026-03-07T14:01:03Z",
                "metadata": {
                    "stage": resolved_stage,
                    "next_action": resolved_action,
                    "model_stage": payload.stage,
                    "model_next_action": payload.next_action,
                    "stage_before": "assess",
                    "stage_machine_reason": stage_reason,
                    "next_action_machine_reason": action_reason,
                },
            },
        }

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "request_dialogue_reply", fake_request_dialogue_reply)
    repository.create_assistant_dialogue_message = fake_create_assistant_dialogue_message

    asyncio.run(
        module.dispatch_message_pipeline(
            request,
            "sess_fake_001",
            {
                "session": {
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "status": "active",
                    "stage": "assess",
                    "updated_at": "2026-03-07T14:01:00Z",
                },
                "message": {
                    "message_id": "msg_fake_001",
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "我还是很紧绷。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                },
            },
        )
    )

    assert repository.memory_calls[-1]["exclude_message_id"] == "msg_fake_001"
    dialogue_event = repository.event_calls[-1]
    assert dialogue_event["event_type"] == "dialogue.reply"
    assert dialogue_event["payload"]["stage"] == "intervene"
    assert dialogue_event["payload"]["next_action"] == "intervene"
    assert dialogue_event["payload"]["next_action_requested"] == "reassess"


def test_dispatch_pipeline_short_circuits_on_high_risk_rule(monkeypatch):
    module = load_gateway_module()
    repository = FakeSessionRepository()
    connection_registry = module.ConnectionRegistry()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                session_repository=repository,
                settings=module.GatewaySettings.from_env(),
                connection_registry=connection_registry,
            )
        )
    )
    called = {"llm": False}

    def forbidden_request_dialogue_reply(*args, **kwargs):
        called["llm"] = True
        raise AssertionError("high-risk precheck should bypass llm call")

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "request_dialogue_reply", forbidden_request_dialogue_reply)

    asyncio.run(
        module.dispatch_message_pipeline(
            request,
            "sess_fake_001",
            {
                "session": {
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "status": "active",
                    "stage": "engage",
                    "updated_at": "2026-03-07T14:01:00Z",
                },
                "message": {
                    "message_id": "msg_fake_001",
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "我觉得活着没意义，甚至想伤害自己。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                },
            },
        )
    )

    assert called["llm"] is False
    dialogue_event = repository.event_calls[-1]
    assert dialogue_event["event_type"] == "dialogue.reply"
    assert dialogue_event["source_service"] == "api_gateway"
    assert dialogue_event["payload"]["stage"] == "handoff"
    assert dialogue_event["payload"]["risk_level"] == "high"
    assert dialogue_event["payload"]["rule_precheck_triggered"] is True
    assert "high_risk_rule_precheck" in dialogue_event["payload"]["safety_flags"]
    assert repository.memory_calls == []


def test_dispatch_pipeline_enqueues_message_accepted_before_llm_reply(monkeypatch):
    module = load_gateway_module()
    repository = FakeSessionRepository()

    class RecordingConnectionRegistry:
        def __init__(self) -> None:
            self.enqueued: list[str] = []

        async def enqueue_event(self, session_id: str, envelope: dict) -> None:
            self.enqueued.append(envelope["event_type"])

    connection_registry = RecordingConnectionRegistry()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                session_repository=repository,
                settings=module.GatewaySettings.from_env(),
                connection_registry=connection_registry,
            )
        )
    )
    observed = {"before_llm": []}

    def fake_request_dialogue_reply(
        settings,
        session,
        message,
        *,
        short_term_memory=None,
        dialogue_summary=None,
        affect_snapshot=None,
    ):
        observed["before_llm"] = list(connection_registry.enqueued)
        return module.DialogueReplyResponse(
            session_id=session["session_id"],
            trace_id=session["trace_id"],
            message_id="msg_assistant_early_ack",
            reply="我们先慢慢说。",
            emotion="supportive",
            risk_level="low",
            stage="assess",
            next_action="ask_followup",
            knowledge_refs=[],
            avatar_style="warm_support",
            safety_flags=[],
        )

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "request_dialogue_reply", fake_request_dialogue_reply)

    asyncio.run(
        module.dispatch_message_pipeline(
            request,
            "sess_fake_001",
            {
                "session": {
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "status": "active",
                    "stage": "engage",
                    "updated_at": "2026-03-07T14:01:00Z",
                },
                "message": {
                    "message_id": "msg_fake_early_ack",
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "最近总觉得脑子停不下来。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                },
            },
        )
    )

    assert observed["before_llm"] == ["message.accepted"]
    assert connection_registry.enqueued == ["message.accepted", "dialogue.reply"]


def test_dispatch_pipeline_records_knowledge_retrieval_event(monkeypatch):
    module = load_gateway_module()
    repository = FakeSessionRepository()
    connection_registry = module.ConnectionRegistry()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                session_repository=repository,
                settings=module.GatewaySettings.from_env(),
                connection_registry=connection_registry,
            )
        )
    )

    def fake_request_dialogue_reply(
        settings,
        session,
        message,
        *,
        short_term_memory=None,
        dialogue_summary=None,
        affect_snapshot=None,
    ):
        return module.DialogueReplyResponse(
            session_id=session["session_id"],
            trace_id=session["trace_id"],
            message_id="msg_assistant_rag_001",
            reply="我们先试着把睡前担忧暂存下来。",
            emotion="anxious",
            risk_level="medium",
            stage="intervene",
            next_action="intervene",
            knowledge_refs=["sleep_worry_container"],
            retrieval_context={
                "source_ids": ["sleep_worry_container", "sleep_hygiene_basic"],
                "filters_applied": ["stage:intervene", "risk_level:medium"],
                "candidate_count": 2,
            },
            avatar_style="warm_support",
            safety_flags=["rag_grounded_response"],
        )

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "request_dialogue_reply", fake_request_dialogue_reply)

    asyncio.run(
        module.dispatch_message_pipeline(
            request,
            "sess_fake_001",
            {
                "session": {
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "status": "active",
                    "stage": "assess",
                    "updated_at": "2026-03-07T14:01:00Z",
                },
                "message": {
                    "message_id": "msg_fake_001",
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "最近总觉得睡前停不下来。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                },
            },
        )
    )

    event_types = [event["event_type"] for event in repository.event_calls]
    assert "knowledge.retrieved" in event_types
    knowledge_event = next(event for event in repository.event_calls if event["event_type"] == "knowledge.retrieved")
    assert knowledge_event["payload"]["source_ids"] == ["sleep_worry_container", "sleep_hygiene_basic"]
    assert knowledge_event["payload"]["grounded_refs"] == ["sleep_worry_container"]
    assert knowledge_event["payload"]["candidate_count"] == 2


def test_dispatch_pipeline_generates_dialogue_summary_every_third_user_turn(monkeypatch):
    module = load_gateway_module()
    repository = FakeSessionRepository()
    repository.user_turn_count = 3
    connection_registry = module.ConnectionRegistry()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                session_repository=repository,
                settings=module.GatewaySettings.from_env(),
                connection_registry=connection_registry,
            )
        )
    )

    def fake_request_dialogue_reply(
        settings,
        session,
        message,
        *,
        short_term_memory=None,
        dialogue_summary=None,
        affect_snapshot=None,
    ):
        assert short_term_memory is not None
        assert dialogue_summary is None
        return module.DialogueReplyResponse(
            session_id=session["session_id"],
            trace_id=session["trace_id"],
            message_id="msg_assistant_003",
            reply="我们先把主要压力点整理一下。",
            emotion="anxious",
            risk_level="medium",
            stage="intervene",
            next_action="intervene",
            knowledge_refs=["breathing_478"],
            avatar_style="warm_support",
            safety_flags=[],
        )

    def fake_request_dialogue_summary(
        settings,
        session,
        *,
        user_turn_count,
        previous_summary,
        recent_messages,
    ):
        assert user_turn_count == 3
        assert previous_summary is None
        assert len(recent_messages) >= 2
        return module.DialogueSummaryResponse(
            session_id=session["session_id"],
            trace_id=session["trace_id"],
            summary_text="用户反复提到睡眠和课堂分心，当前进入 intervene 阶段。",
            current_stage=session["stage"],
            user_turn_count=user_turn_count,
            generated_at="2026-03-07T14:01:05Z",
        )

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "request_dialogue_reply", fake_request_dialogue_reply)
    monkeypatch.setattr(module, "request_dialogue_summary", fake_request_dialogue_summary)

    asyncio.run(
        module.dispatch_message_pipeline(
            request,
            "sess_fake_001",
            {
                "session": {
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "status": "active",
                    "stage": "assess",
                    "updated_at": "2026-03-07T14:01:00Z",
                },
                "message": {
                    "message_id": "msg_fake_001",
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "我还是有点乱，先帮我总结一下。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                },
            },
        )
    )

    assert repository.summary_update_calls[0]["summary_payload"]["summary_text"].startswith("用户反复提到")
    assert repository.session_metadata["dialogue_summary"]["generated_from_message_id"] == "msg_assistant_003"
    assert repository.event_calls[-1]["event_type"] == "dialogue.summary.updated"
    assert repository.event_calls[-1]["payload"]["user_turn_count"] == 3


def test_dispatch_pipeline_persists_affect_snapshot_and_routes_conflict_to_clarification(monkeypatch):
    module = load_gateway_module()
    repository = FakeSessionRepository()
    connection_registry = module.ConnectionRegistry()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                session_repository=repository,
                settings=module.GatewaySettings.from_env(),
                connection_registry=connection_registry,
            )
        )
    )

    affect_snapshot = module.AffectAnalyzeResponse(
        session_id="sess_fake_001",
        trace_id="trace_fake_001",
        current_stage="engage",
        generated_at="2026-03-10T12:00:00Z",
        source_context=module.AffectSourceContext(
            origin="verify_dialogue_conflict_clarification",
            dataset="noxi",
            record_id="noxi/sample/1",
            note="test conflict",
        ),
        text_result=module.AffectLaneResult(
            status="ready",
            label="neutral",
            confidence=0.64,
            evidence=[],
            detail="text",
        ),
        audio_result=module.AffectLaneResult(
            status="ready",
            label="slow_low_energy_proxy",
            confidence=0.74,
            evidence=[],
            detail="audio",
        ),
        video_result=module.AffectLaneResult(
            status="ready",
            label="stable_gaze_proxy",
            confidence=0.74,
            evidence=[],
            detail="video",
        ),
        fusion_result=module.AffectFusionResult(
            emotion_state="needs_clarification",
            risk_level="medium",
            confidence=0.74,
            conflict=True,
            conflict_reason="text-neutral; audio-slow_low_energy_proxy; video-stable_gaze_proxy",
            detail="fusion",
        ),
    )

    def fake_request_affect_snapshot(settings, session, message):
        return affect_snapshot

    def fake_request_dialogue_reply(
        settings,
        session,
        message,
        *,
        short_term_memory=None,
        dialogue_summary=None,
        affect_snapshot=None,
    ):
        assert affect_snapshot is not None
        assert affect_snapshot.fusion_result.conflict is True
        return module.DialogueReplyResponse(
            session_id=session["session_id"],
            trace_id=session["trace_id"],
            message_id="msg_assistant_affect_conflict",
            reply="我想先再确认一下你现在的真实状态。",
            emotion="guarded",
            risk_level="medium",
            stage="assess",
            next_action="ask_followup",
            knowledge_refs=[],
            avatar_style="calm_guarded",
            safety_flags=["affect_conflict_clarification"],
        )

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "request_affect_snapshot", fake_request_affect_snapshot)
    monkeypatch.setattr(module, "request_dialogue_reply", fake_request_dialogue_reply)

    asyncio.run(
        module.dispatch_message_pipeline(
            request,
            "sess_fake_001",
            {
                "session": {
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "status": "active",
                    "stage": "engage",
                    "updated_at": "2026-03-07T14:01:00Z",
                    "metadata": {},
                },
                "message": {
                    "message_id": "msg_fake_conflict",
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "今天就普通聊聊，先说说最近的情况。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                    "metadata": {
                        "audio_path_16k_mono": "data/derived/audio.wav",
                        "video_frame_path": "data/derived/frame.npy",
                    },
                },
            },
        )
    )

    event_types = [event["event_type"] for event in repository.event_calls]
    assert "affect.snapshot" in event_types
    dialogue_event = repository.event_calls[-1]
    assert dialogue_event["event_type"] == "dialogue.reply"
    assert dialogue_event["payload"]["affect_conflict"] is True
    assert dialogue_event["payload"]["affect_emotion_state"] == "needs_clarification"
    assert dialogue_event["payload"]["affect_conflict_reason"].startswith("text-neutral")
    assert "affect_conflict_clarification" in dialogue_event["payload"]["safety_flags"]


def test_dispatch_pipeline_falls_back_when_dialogue_summary_request_fails(monkeypatch):
    module = load_gateway_module()
    repository = FakeSessionRepository()
    repository.user_turn_count = 3
    repository.session_metadata = {
        "dialogue_summary": {
            "summary_text": "用户之前提到睡眠和课堂分心。",
            "user_turn_count": 0,
        }
    }
    connection_registry = module.ConnectionRegistry()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                session_repository=repository,
                settings=module.GatewaySettings.from_env(),
                connection_registry=connection_registry,
            )
        )
    )

    def fake_request_dialogue_reply(
        settings,
        session,
        message,
        *,
        short_term_memory=None,
        dialogue_summary=None,
        affect_snapshot=None,
    ):
        return module.DialogueReplyResponse(
            session_id=session["session_id"],
            trace_id=session["trace_id"],
            message_id="msg_assistant_004",
            reply="我们先继续把注意力放回最主要的压力点。",
            emotion="anxious",
            risk_level="medium",
            stage="intervene",
            next_action="intervene",
            knowledge_refs=["breathing_478"],
            avatar_style="warm_support",
            safety_flags=[],
        )

    def boom_summary(*args, **kwargs):
        raise RuntimeError("dialogue-service http 502: invalid summary")

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "request_dialogue_reply", fake_request_dialogue_reply)
    monkeypatch.setattr(module, "request_dialogue_summary", boom_summary)

    asyncio.run(
        module.dispatch_message_pipeline(
            request,
            "sess_fake_001",
            {
                "session": {
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "status": "active",
                    "stage": "assess",
                    "updated_at": "2026-03-07T14:01:00Z",
                },
                "message": {
                    "message_id": "msg_fake_002",
                    "session_id": "sess_fake_001",
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "继续吧，帮我收一下重点。",
                    "submitted_at": "2026-03-07T14:02:00Z",
                },
            },
        )
    )

    summary_payload = repository.summary_update_calls[0]["summary_payload"]
    assert summary_payload["summary_source"] == "fallback"
    assert summary_payload["summary_fallback_reason"] == "invalid_output"
    assert summary_payload["generated_from_message_id"] == "msg_assistant_004"
    assert "当前进入 intervene 阶段" in summary_payload["summary_text"]
    assert repository.event_calls[-1]["event_type"] == "dialogue.summary.updated"


def test_connection_registry_does_not_requeue_when_any_connection_receives_event():
    module = load_gateway_module()
    registry = module.ConnectionRegistry()
    delivered: list[dict] = []

    class HealthyWebSocket:
        async def send_json(self, envelope: dict) -> None:
            delivered.append(envelope)

    class BrokenWebSocket:
        async def send_json(self, envelope: dict) -> None:
            raise RuntimeError("socket closed")

    asyncio.run(registry.add("sess_fake_001", HealthyWebSocket()))
    asyncio.run(registry.add("sess_fake_001", BrokenWebSocket()))

    envelope = {"event_id": "evt_001", "event_type": "message.accepted"}
    asyncio.run(registry.enqueue_event("sess_fake_001", envelope))

    assert delivered == [envelope]
    assert registry._pending_events.get("sess_fake_001") is None
    assert len(registry._connections["sess_fake_001"]) == 1


def test_connection_registry_flush_keeps_queue_when_send_fails():
    module = load_gateway_module()
    registry = module.ConnectionRegistry()
    registry._pending_events["sess_fake_001"] = [
        module.PendingRealtimeEvent(
            envelope={"event_id": "evt_001", "event_type": "message.accepted"},
            enqueued_at=datetime.now(timezone.utc),
        )
    ]

    class BrokenWebSocket:
        async def send_json(self, envelope: dict) -> None:
            raise RuntimeError("network down")

    try:
        asyncio.run(registry.flush("sess_fake_001", BrokenWebSocket()))
    except RuntimeError:
        pass
    else:
        raise AssertionError("expected flush to propagate websocket send failure")

    assert registry._pending_events["sess_fake_001"][0].envelope["event_id"] == "evt_001"


def test_connection_registry_prunes_expired_pending_events():
    module = load_gateway_module()
    registry = module.ConnectionRegistry()
    registry._pending_events["sess_fake_001"] = [
        module.PendingRealtimeEvent(
            envelope={"event_id": "evt_old", "event_type": "message.accepted"},
            enqueued_at=datetime.now(timezone.utc)
            - timedelta(seconds=module.DEFAULT_PENDING_EVENT_TTL_SECONDS + 5),
        )
    ]

    asyncio.run(
        registry.enqueue_event(
            "sess_fake_001",
            {"event_id": "evt_new", "event_type": "message.accepted"},
        )
    )

    assert len(registry._pending_events["sess_fake_001"]) == 1
    assert registry._pending_events["sess_fake_001"][0].envelope["event_id"] == "evt_new"


def test_connection_registry_caps_pending_event_queue(monkeypatch):
    module = load_gateway_module()
    monkeypatch.setattr(module, "DEFAULT_MAX_PENDING_EVENTS_PER_SESSION", 3)
    registry = module.ConnectionRegistry()

    for index in range(5):
        asyncio.run(
            registry.enqueue_event(
                "sess_fake_001",
                {"event_id": f"evt_{index}", "event_type": "message.accepted"},
            )
        )

    assert [item.envelope["event_id"] for item in registry._pending_events["sess_fake_001"]] == [
        "evt_2",
        "evt_3",
        "evt_4",
    ]


def test_submit_text_route_schedules_background_pipeline(monkeypatch):
    module = load_gateway_module()
    repository = FakeSessionRepository()
    app = module.create_app(repository=repository)
    route = next(
        route
        for route in app.routes
        if route.path == "/api/session/{session_id}/text" and "POST" in getattr(route, "methods", set())
    )
    scheduled: dict[str, object] = {}

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    async def fake_dispatch_message_pipeline(app_or_request, session_id, result):
        scheduled["awaited"] = True

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "dispatch_message_pipeline", fake_dispatch_message_pipeline)

    def fake_schedule_background_task(app_value, coro, *, task_name: str):
        scheduled["task_name"] = task_name
        scheduled["coro"] = coro
        coro.close()
        return SimpleNamespace()

    monkeypatch.setattr(module, "schedule_background_task", fake_schedule_background_task)

    response = asyncio.run(
        route.endpoint(
            "sess_fake_001",
            module.TextMessageSubmitRequest(content_text="先记录一下。"),
            SimpleNamespace(app=app),
        )
    )

    assert response["message_id"] == "msg_fake_001"
    assert scheduled["task_name"] == "dispatch_message_pipeline:sess_fake_001:text"
    assert "coro" in scheduled
    assert "awaited" not in scheduled


def test_finalize_audio_route_schedules_background_pipeline(monkeypatch):
    module = load_gateway_module()

    class RouteRepository(FakeSessionRepository):
        def create_audio_final_asset(self, session_id: str, **kwargs):
            return {
                "media_id": "media_audio_final_001",
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "media_kind": "audio_final",
                "storage_backend": "local",
                "storage_path": "data/derived/live_media/audio_final/sess_fake/media_audio_final_001.webm",
                "mime_type": kwargs["mime_type"],
                "duration_ms": kwargs.get("duration_ms"),
                "byte_size": len(kwargs["content"]),
                "created_at": "2026-03-07T14:01:00Z",
            }

        def create_user_audio_message(self, session_id: str, *, content_text: str, metadata: dict | None = None):
            return {
                "session": {
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "status": "active",
                    "stage": "engage",
                    "updated_at": "2026-03-07T14:01:00Z",
                },
                "message": {
                    "message_id": "msg_audio_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "audio",
                    "content_text": content_text,
                    "submitted_at": "2026-03-07T14:01:00Z",
                },
            }

    repository = RouteRepository()
    app = module.create_app(repository=repository)
    route = next(
        route
        for route in app.routes
        if route.path == "/api/session/{session_id}/audio/finalize"
        and "POST" in getattr(route, "methods", set())
    )
    scheduled: dict[str, object] = {}

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    async def fake_dispatch_message_pipeline(app_or_request, session_id, result):
        scheduled["awaited"] = True

    def fake_request_asr_transcription(settings, *, body: bytes, mime_type: str):
        return module.ASRServiceTranscriptionResponse(
            request_id="req_asr_001",
            provider="dashscope",
            model="qwen3-asr-flash",
            transcript_text="测试语音。",
            transcript_language="zh-CN",
            duration_ms=200,
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
            audio={"filename": "recording.webm", "content_type": mime_type, "byte_size": len(body)},
            generated_at="2026-03-07T14:01:00Z",
        )

    monkeypatch.setattr(module.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(module, "dispatch_message_pipeline", fake_dispatch_message_pipeline)
    monkeypatch.setattr(module, "request_asr_transcription", fake_request_asr_transcription)

    def fake_schedule_background_task(app_value, coro, *, task_name: str):
        scheduled["task_name"] = task_name
        scheduled["coro"] = coro
        coro.close()
        return SimpleNamespace()

    monkeypatch.setattr(module, "schedule_background_task", fake_schedule_background_task)

    async def fake_body() -> bytes:
        return b"webm-bytes"

    response = asyncio.run(
        route.endpoint(
            "sess_fake_001",
            SimpleNamespace(
                app=app,
                headers={"content-type": "audio/webm;codecs=opus"},
                body=fake_body,
            ),
            200,
        )
    )

    assert response["message_id"] == "msg_audio_001"
    assert response["mime_type"] == "audio/webm"
    assert scheduled["task_name"] == "dispatch_message_pipeline:sess_fake_001:audio"
    assert "coro" in scheduled
    assert "awaited" not in scheduled


def test_text_message_rejects_blank_content():
    module = load_gateway_module()
    try:
        module.TextMessageSubmitRequest(content_text="   ")
    except ValidationError:
        assert True
        return
    raise AssertionError("expected TextMessageSubmitRequest validation to fail for blank content")


def test_gateway_app_and_readme_document_endpoints():
    module = load_gateway_module()
    app = module.create_app(repository=FakeSessionRepository())
    paths = {route.path for route in app.routes}

    assert "/health" in paths
    assert "/api/runtime/config" in paths
    assert "/api/session/create" in paths
    assert "/api/session/{session_id}/state" in paths
    assert "/api/session/{session_id}/export" in paths
    assert "/api/session/{session_id}/text" in paths
    assert "/ws/session/{session_id}" in paths

    content = GATEWAY_README.read_text(encoding="utf-8")
    assert "GET /api/runtime/config" in content
    assert "POST /api/session/create" in content
    assert "GET /api/session/{session_id}/state" in content
    assert "GET /api/session/{session_id}/export" in content
    assert "POST /api/session/{session_id}/text" in content
    assert "uvicorn" in content


def test_gateway_event_envelope_matches_shared_shape():
    module = load_gateway_module()
    envelope = module.build_event_envelope(
        session={
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
        },
        event_type="message.accepted",
        payload={"connection_status": "alive"},
        message_id="msg_fake_001",
    )

    assert envelope["event_type"] == "message.accepted"
    assert envelope["schema_version"] == "v1alpha1"
    assert envelope["source_service"] == "api_gateway"
    assert envelope["session_id"] == "sess_fake_001"
    assert envelope["trace_id"] == "trace_fake_001"
    assert envelope["message_id"] == "msg_fake_001"


def test_gateway_message_accepted_event_is_json_serializable_after_encoding():
    module = load_gateway_module()
    envelope = module.build_event_envelope(
        session={
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
        },
        event_type="message.accepted",
        payload={
            "message_id": "msg_fake_001",
            "submitted_at": datetime(2026, 3, 8, 10, 30, tzinfo=timezone.utc),
        },
        message_id="msg_fake_001",
    )

    encoded = module.jsonable_encoder(envelope)

    assert encoded["payload"]["submitted_at"] == "2026-03-08T10:30:00+00:00"
    assert json.loads(json.dumps(encoded))["message_id"] == "msg_fake_001"


def test_session_state_record_returns_ordered_messages():
    module = load_gateway_module()
    repository = FakeSessionRepository()

    body = module.create_session_state_record(repository, "sess_fake_001")

    assert isinstance(body, dict)
    assert body["session"]["session_id"] == "sess_fake_001"
    assert body["session"]["stage"] == "assess"
    assert len(body["messages"]) == 2
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][1]["role"] == "assistant"


def test_session_export_record_returns_messages_stage_history_and_events():
    module = load_gateway_module()
    repository = FakeSessionRepository()

    body = module.create_session_export_record(repository, None, "sess_fake_001")

    assert isinstance(body, dict)
    assert body["session_id"] == "sess_fake_001"
    assert body["trace_id"] == "trace_fake_001"
    assert body["stage"] == "assess"
    assert len(body["messages"]) == 2
    assert body["stage_history"][0]["stage"] == "engage"
    assert body["stage_history"][0]["trace_id"] == "trace_fake_001"
    assert body["stage_history"][1]["stage"] == "assess"
    assert body["events"][0]["event_type"] == "session.created"
    assert body["events"][1]["event_type"] == "dialogue.reply"


def test_session_export_record_persists_snapshot_when_export_dir_is_configured(tmp_path):
    module = load_gateway_module()
    repository = FakeSessionRepository()
    settings = module.GatewaySettings.from_env()
    settings.session_export_dir = str(tmp_path)

    body = module.create_session_export_record(repository, settings, "sess_fake_001")

    assert isinstance(body, dict)
    export_file = tmp_path / "sess_fake_001.json"
    assert export_file.exists()
    persisted = json.loads(export_file.read_text(encoding="utf-8"))
    assert persisted["session_id"] == "sess_fake_001"
    assert persisted["events"][0]["event_type"] == "session.created"


def test_runtime_config_record_uses_public_urls():
    module = load_gateway_module()
    settings = module.GatewaySettings.from_env()
    settings.gateway_public_base_url = "https://demo.example.com/api"
    settings.gateway_ws_path = "/ws/session"
    settings.affect_service_base_url = "https://demo.example.com/affect"
    settings.tts_service_base_url = "https://demo.example.com/tts"
    settings.session_export_dir = "exports/runtime"

    payload = module.build_runtime_config_record(settings)

    assert payload.api_base_url == "https://demo.example.com/api"
    assert payload.ws_url == "wss://demo.example.com/ws/session"
    assert payload.affect_base_url == "https://demo.example.com/affect"
    assert payload.tts_base_url == "https://demo.example.com/tts"
    assert payload.session_export_dir == "exports/runtime"


def test_schedule_background_task_tracks_and_cleans_completed_tasks():
    module = load_gateway_module()
    app = SimpleNamespace(state=SimpleNamespace(background_tasks=set()))

    async def run_case():
        async def sample_coro():
            return "ok"

        task = module.schedule_background_task(app, sample_coro(), task_name="sample")
        assert task in app.state.background_tasks
        await asyncio.sleep(0)
        await task
        assert not app.state.background_tasks

    asyncio.run(run_case())
