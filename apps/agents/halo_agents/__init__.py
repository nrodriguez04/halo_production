"""Halo agent runtime on CrewAI.

Design rule: agents never hold provider credentials. Model calls go through
:class:`halo_agents.governed_llm.HaloGovernedLLM`, which posts to the api's
``/internal/ai/chat-completion`` so preflight, budgets, rate limits and the
cost ledger apply exactly as they do for the api and the worker.
"""
