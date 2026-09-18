"""A CrewAI LLM that spends through Halo's cost control instead of a vendor key.

CrewAI's default LLM path calls the model provider directly (via LiteLLM)
with a key in the process environment. Used as-is that would recreate the
exact problem #84 closed for the worker: agent tokens outside preflight,
budgets and the ledger. This class implements CrewAI's custom-LLM interface
and posts every completion to the api's ``/internal/ai/chat-completion``
route, attributed to the tenant and, when known, the deal or lead.
"""
from __future__ import annotations

from typing import Any

from crewai import BaseLLM

from .halo_client import HaloInternalClient


class HaloGovernedLLM(BaseLLM):
    def __init__(
        self,
        client: HaloInternalClient,
        model: str = "gpt-4o",
        temperature: float | None = None,
        *,
        deal_id: str | None = None,
        lead_id: str | None = None,
        automation_run_id: str | None = None,
    ) -> None:
        super().__init__(model=model, temperature=temperature)
        self.client = client
        self.deal_id = deal_id
        self.lead_id = lead_id
        self.automation_run_id = automation_run_id
        self.total_tokens_in = 0
        self.total_tokens_out = 0

    def call(
        self,
        messages: str | list[dict[str, str]],
        tools: list[dict[str, Any]] | None = None,
        callbacks: list[Any] | None = None,
        available_functions: dict[str, Any] | None = None,
        from_task: Any | None = None,
        from_agent: Any | None = None,
        response_model: Any | None = None,
        **kwargs: Any,
    ) -> str:
        # CrewAI 1.x passes task/agent/response_model context; the internal
        # route takes plain messages, so those are accepted and ignored.
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        out = self.client.chat_completion(
            self.model,
            [{"role": m["role"], "content": m["content"]} for m in messages],
            temperature=self.temperature,
            deal_id=self.deal_id,
            lead_id=self.lead_id,
            automation_run_id=self.automation_run_id,
        )
        self.total_tokens_in += out.tokens_in
        self.total_tokens_out += out.tokens_out
        return out.content

    def supports_function_calling(self) -> bool:
        # Tool calls are handled by CrewAI's prompt-based path; the internal
        # route exposes plain completions only.
        return False

    def supports_stop_words(self) -> bool:
        return False

    def get_context_window_size(self) -> int:
        return 128_000
