import httpx
import pytest

from halo_agents.halo_client import (
    ComplianceBlocked,
    CostBlocked,
    HaloInternalClient,
    IntegrationUnavailable,
    InternalApiError,
)


def make_client(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_BASE_URL", "http://api.test/api")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "t" * 40)
    return HaloInternalClient(account_id="tenant-1")


def test_chat_completion_sends_tenant_header_and_attribution(monkeypatch):
    client = make_client(monkeypatch)
    captured = {}

    def fake_post(self, url, json=None, headers=None):  # noqa: A002 - httpx kwarg name
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        return httpx.Response(200, json={"content": "ok", "tokensIn": 12, "tokensOut": 3, "model": "gpt-4o"})

    monkeypatch.setattr(httpx.Client, "post", fake_post)
    out = client.chat_completion("gpt-4o", [{"role": "user", "content": "hi"}], deal_id="deal-1")

    assert captured["url"] == "http://api.test/api/internal/ai/chat-completion"
    assert captured["headers"]["x-halo-account-id"] == "tenant-1"
    assert captured["headers"]["Authorization"] == "Bearer " + "t" * 40
    assert captured["json"]["dealId"] == "deal-1"
    assert (out.content, out.tokens_in, out.tokens_out) == ("ok", 12, 3)


@pytest.mark.parametrize(
    "status, body, exc",
    [
        (429, {"code": "COST_BLOCKED", "reason": "BLOCK_OVER_BUDGET", "provider": "openai"}, CostBlocked),
        (403, {"code": "COMPLIANCE_BLOCKED", "reason": "DNC_BLOCKED"}, ComplianceBlocked),
        (503, {"code": "INTEGRATION_UNAVAILABLE", "provider": "openai", "reason": "NOT_CONFIGURED"}, IntegrationUnavailable),
        (500, {"message": "boom"}, InternalApiError),
    ],
)
def test_error_mapping_matches_the_worker_client(status, body, exc):
    res = httpx.Response(status, json=body)
    with pytest.raises(exc):
        HaloInternalClient._unwrap("ai/chat-completion", res)


def test_refuses_to_start_without_configuration(monkeypatch):
    monkeypatch.delenv("INTERNAL_API_BASE_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_TOKEN", raising=False)
    with pytest.raises(RuntimeError):
        HaloInternalClient(account_id="tenant-1")
