# halo-agents

CrewAI runtime for Halo's AI agents. Replaces the OpenClaw gateway (#87).

## The one rule

**Agents hold no provider keys.** `HaloGovernedLLM` implements CrewAI's
custom-LLM interface and sends every completion to the api's
`POST /api/internal/ai/chat-completion`, which runs the cost-control preflight,
debits the tenant's budget buckets, enforces the AI kill switch and writes the
ledger row — the same path the worker uses. Tokens an agent spends show up on
the same dashboards as everything else, attributed to the tenant and, when
known, the deal.

Used as CrewAI ships it (LiteLLM + `OPENAI_API_KEY` in the environment), the
runtime would spend outside all of that. Don't.

## What's here

| file | purpose |
|---|---|
| `halo_agents/halo_client.py` | client for `/api/internal/*`; same auth and error mapping as the worker's TypeScript client |
| `halo_agents/governed_llm.py` | the CrewAI `BaseLLM` that routes through the api |
| `halo_agents/crews/deal_review.py` | first crew: a deal analyst that returns a structured recommendation |
| `halo_agents/main.py` | run the crew once from a saved deal-context JSON |
| `tests/` | client request shape and error mapping |

## Run it

```bash
cd apps/agents
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env                              # then set INTERNAL_API_TOKEN
python -m halo_agents.main --account <accountId> --deal-context deal.json
pytest
```

`deal.json` is the body of `GET /agent/deals/:id/context` from the api.

## What's deliberately not here yet

- **A trigger.** Nothing runs the crew on its own. The natural home is a worker
  job (BullMQ) that fires on a deal lifecycle event, fetches the context and
  runs the crew — or a `/api/internal/agents/run` route the worker calls.
- **Outward-facing tools.** The crew recommends; it does not send. Drafting a
  message should call the api's agent routes so the draft lands in the
  approval queue with compliance facts attached, as before.
- **Agent design.** Which agents exist, what they may decide and what they
  must escalate is a product decision; the deal analyst is a template.
