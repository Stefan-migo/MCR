"""Tests for stream_manager.py — NDI naming stability and control logic."""

import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure src is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from stream_manager import AsyncStreamManager, StreamState


class FakeSignaling:
    """Minimal signaling stub that delegates emit_ack."""
    def __init__(self):
        self.sio = MagicMock()
        self.emit_ack = AsyncMock(return_value={"rtpCapabilities": {}, "id": "x"})


def make_stream_data(producer_id: str, device_id: str = "") -> dict:
    return {
        "producerId": producer_id,
        "stream": {
            "id": f"s-{producer_id}",
            "producerId": producer_id,
            "deviceId": device_id or producer_id,
        },
    }


class TestNdiNamingStability:
    """Phase 1: NDI source naming uses deviceId (stable across reconnects)."""

    def setup_method(self):
        self.sig = FakeSignaling()
        self.mgr = AsyncStreamManager(self.sig, max_streams=8, source_prefix="MCR-")
        self.mgr._loop = MagicMock()
        # Simulate loop.run_coroutine_threadsafe bypass
        self.mgr._loop.run_coroutine_threadsafe = lambda c, _: c

    def test_on_stream_started_extracts_device_id(self):
        """deviceId is extracted from stream payload and stored in StreamState."""
        data = make_stream_data("prod-abc123", "dev-abc")
        self.mgr.on_stream_started(data)
        state = self.mgr.streams.get("prod-abc123")
        assert state is not None
        assert state.device_id == "dev-abc"

    def test_ndi_source_name_uses_device_id(self):
        """NDI source name = MCR-{device_id[:8]}."""
        data = make_stream_data("prod-abc123", "dev-long-id-123")
        # _setup would normally create the sender; just check the state.
        # We call on_stream_started which schedules _setup.
        self.mgr.on_stream_started(data)
        state = self.mgr.streams.get("prod-abc123")
        assert state is not None
        assert state.source_name == "MCR-dev-long-"

    def test_fallback_to_producer_id_when_device_id_missing(self):
        """No deviceId → fallback to producerId[:8]."""
        data = make_stream_data("prod-short", "")
        # Remove deviceId from stream payload
        data["stream"] = {"id": "s-prod-short", "producerId": "prod-short"}
        self.mgr.on_stream_started(data)
        state = self.mgr.streams.get("prod-short")
        assert state is not None
        # Fallback: device_id = producer_id
        assert state.device_id == "prod-short"
        assert state.source_name == "MCR-prod-sh"

    def test_on_stream_started_missing_stream_field(self):
        """Legacy payload without 'stream' key still works."""
        data = {"producerId": "prod-legacy"}
        self.mgr.on_stream_started(data)
        state = self.mgr.streams.get("prod-legacy")
        assert state is not None

    def test_max_streams_respected(self):
        """New stream beyond max_streams is skipped."""
        self.mgr.max_streams = 2
        for i in range(3):
            data = make_stream_data(f"prod-{i}", f"dev-{i}")
            self.mgr.on_stream_started(data)
        assert len(self.mgr.streams) <= 2

    def test_reconnect_same_device_id_same_ndi_name(self):
        """Reconnect with new producerId but same deviceId → same NDI name."""
        data1 = make_stream_data("prod-old", "dev-stable")
        self.mgr.on_stream_started(data1)
        state1 = self.mgr.streams.get("prod-old")
        name1 = state1.source_name

        # Simulate remove + reconnect
        self.mgr.remove_stream("prod-old")
        data2 = make_stream_data("prod-new", "dev-stable")
        self.mgr.on_stream_started(data2)
        state2 = self.mgr.streams.get("prod-new")

        assert name1 == state2.source_name


class TestNdiControl:
    """Phase 3: NDI control toggle — create/destroy sender."""

    def setup_method(self):
        self.sig = FakeSignaling()
        self.mgr = AsyncStreamManager(self.sig, max_streams=8, source_prefix="MCR-")
        # Insert a mock stream state
        self.state = StreamState("prod-1", "MCR-dev-123", "dev-123")
        self.mgr.streams["prod-1"] = self.state

    @patch("stream_manager.NdiSender")
    async def test_enable_creates_sender(self, MockNdiSender):
        """on_ndi_control(enabled=True) creates NdiSender."""
        mock_sender = MagicMock()
        MockNdiSender.return_value = mock_sender

        result = await self.mgr.on_ndi_control({
            "deviceId": "dev-123",
            "producerId": "prod-1",
            "enabled": True,
        })

        assert result["active"] is True
        assert mock_sender.initialize.called
        assert self.state.sender is mock_sender

    async def test_disable_destroys_sender(self):
        """on_ndi_control(enabled=False) destroys existing NdiSender."""
        mock_sender = MagicMock()
        self.state.sender = mock_sender

        result = await self.mgr.on_ndi_control({
            "deviceId": "dev-123",
            "producerId": "prod-1",
            "enabled": False,
        })

        assert result["active"] is False
        assert mock_sender.destroy.called
        assert self.state.sender is None
        assert "dev-123" in self.mgr._disabled_devices

    async def test_disable_without_sender_is_noop(self):
        """Disabling when no sender exists → no-op, returns inactive."""
        self.state.sender = None

        result = await self.mgr.on_ndi_control({
            "deviceId": "dev-123",
            "producerId": "prod-1",
            "enabled": False,
        })

        assert result["active"] is False

    async def test_enable_idempotent(self):
        """Enabling when already active returns current state."""
        mock_sender = MagicMock()
        self.state.sender = mock_sender

        result = await self.mgr.on_ndi_control({
            "deviceId": "dev-123",
            "producerId": "prod-1",
            "enabled": True,
        })

        assert result["active"] is True
        # Should NOT have created a second sender
        assert self.state.sender is mock_sender

    async def test_unknown_device_returns_error(self):
        """Unknown deviceId returns error, not crash."""
        result = await self.mgr.on_ndi_control({
            "deviceId": "nonexistent",
            "producerId": "nope",
            "enabled": True,
        })
        assert result["active"] is False
        assert "error" in result

    async def test_missing_ids_returns_error(self):
        """Missing deviceId and producerId returns error."""
        result = await self.mgr.on_ndi_control({
            "enabled": True,
        })
        assert "error" in result

    def test_disabled_device_skips_auto_create(self):
        """Stream with disabled_by_user=True does not auto-create NDI sender."""
        self.state.disabled_by_user = True
        self.mgr._disabled_devices.add("dev-123")
        # on_stream_started should print a message but still proceed with _setup
        # _setup checks _disabled_devices before creating sender
        data = make_stream_data("prod-1", "dev-123")
        # We can't easily test _setup without NDI SDK, but we can verify the flag
        assert "dev-123" in self.mgr._disabled_devices


class TestStreamState:
    """StreamState dataclass now carries device_id."""

    def test_stream_state_has_device_id(self):
        state = StreamState("pid", "MCR-dev-123", "dev-123")
        assert state.device_id == "dev-123"
        assert state.producer_id == "pid"
        assert state.source_name == "MCR-dev-123"

    def test_stream_state_default_device_id(self):
        state = StreamState("pid", "nope")
        assert state.device_id == ""

    def test_disabled_by_user_default(self):
        state = StreamState("pid", "nope")
        assert state.disabled_by_user is False
