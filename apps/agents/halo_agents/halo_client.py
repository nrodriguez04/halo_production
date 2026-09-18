"""HTTP client for the api's service-to-service surface (``/api/internal/*``).

Mirrors ``apps/worker/src/internal-api.client.ts``: the same bearer token, the
same ``x-halo-account-id`` header naming the tenant the spend belongs to, and
the same error mapping so a caller can tell a budget block from a compliance
block from an outage.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import httpx


class InternalApiNotConfigured(RuntimeError):
    """INTERNAL_API_BASE_URL / INTERNAL_API_TOKEN are not set."""


class CostBlocked(RuntimeError):
    """The api refused the call on cost grounds (HTTP 429 COST_BLOCKED)."""

    def __init__(self, reason: str, provider: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason
        self.provider = provider


class ComplianceBlocked(RuntimeError):
    """DNC / consent / quiet hours refused a send (HTTP 403 COMPLIANCE_BLOCKED)."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


class IntegrationUnavailable(RuntimeError):
    """The provider could not be called (HTTP 503 INTEGRATION_UNAVAILABLE)."""

    def __init__(self, provider: str, reason: str, message: str) -> None:
        super().__init__(message)
        self.provider = provider
        self.reason = reason


class InternalApiError(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class ChatCompletion:
    content: str
    tokens_in: int
    tokens_out: int
    model: str


@dataclass
class HaloInternalClient:
    """One client per tenant: ``account_id`` is stamped on every request."""

    account_id: str
    base_url: str = field(default_factory=lambda: os.environ.get("INTERNAL_API_BASE_URL", ""))
    token: str = field(default_factory=lambda: os.environ.get("INTERNAL_API_TOKEN", ""))
    timeout_s: float = 60.0

    def __post_init__(self) -> None:
        if not self.base_url or not self.token:
            raise InternalApiNotConfigured(
                "INTERNAL_API_BASE_URL and INTERNAL_API_TOKEN must be set"
            )
        self.base_url = self.base_url.rstrip("/")

    # ------------------------------------------------------------------ core
    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        with httpx.Client(timeout=self.timeout_s) as http:
            res = http.post(
                f"{self.base_url}/internal/{path}",
                json=body,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "x-halo-account-id": self.account_id,
                    "Content-Type": "application/json",
                },
            )
        return self._unwrap(path, res)

    @staticmethod
    def _unwrap(path: str, res: httpx.Response) -> dict[str, Any]:
        def payload() -> dict[str, Any]:
            try:
                data = res.json()
                return data if isinstance(data, dict) else {}
            except ValueError:
                return {}

        if res.status_code == 429:
            p = payload()
            if p.get("code") == "COST_BLOCKED":
                raise CostBlocked(p.get("reason", "UNKNOWN"), p.get("provider", "unknown"), p.get("message", "Call blocked by cost control"))
            raise InternalApiError(429, p.get("message", "Rate limited"))
        if res.status_code == 403:
            p = payload()
            if p.get("code") == "COMPLIANCE_BLOCKED":
                raise ComplianceBlocked(p.get("reason", "UNKNOWN"), p.get("message", "Blocked by compliance rules"))
            raise InternalApiError(403, p.get("message", "Forbidden"))
        if res.status_code == 503:
            p = payload()
            if p.get("code") == "INTEGRATION_UNAVAILABLE":
                raise IntegrationUnavailable(p.get("provider", "unknown"), p.get("reason", "UPSTREAM_ERROR"), p.get("message", "Integration unavailable"))
            raise InternalApiError(503, p.get("message", "Service unavailable"))
        if res.status_code >= 400:
            raise InternalApiError(res.status_code, f"internal/{path} failed: {res.status_code} {res.text[:300]}")
        data = res.json()
        return data if isinstance(data, dict) else {}

    # ----------------------------------------------------------------- calls
    def chat_completion(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        deal_id: str | None = None,
        lead_id: str | None = None,
        automation_run_id: str | None = None,
    ) -> ChatCompletion:
        body: dict[str, Any] = {"model": model, "messages": messages}
        if temperature is not None:
            body["temperature"] = temperature
        if max_tokens is not None:
            body["maxTokens"] = max_tokens
        if deal_id:
            body["dealId"] = deal_id
        if lead_id:
            body["leadId"] = lead_id
        if automation_run_id:
            body["automationRunId"] = automation_run_id
        data = self._post("ai/chat-completion", body)
        return ChatCompletion(
            content=str(data.get("content", "")),
            tokens_in=int(data.get("tokensIn", 0)),
            tokens_out=int(data.get("tokensOut", 0)),
            model=str(data.get("model", model)),
        )
