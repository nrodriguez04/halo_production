# OpenClaw Integration Architecture

## Overview

Hālo exposes a dedicated **Agent API** (`/api/agent/*`) designed for AI orchestrators like OpenClaw. The integration follows a strict separation of concerns:

| Concern | Owner |
|---------|-------|
| Deal state, lead state, property data | Hālo |
| Compliance (DNC, consent, quiet hours) | Hālo |
| Approval workflows | Hālo |
| External communications (SMS, email) | Hālo |
| Audit logs, timeline events | Hālo |
| Orchestration decisions | OpenClaw |
| Draft composition | OpenClaw (via Hālo API) |
| Workflow sequencing | OpenClaw |

## Why This Architecture

OpenClaw is powerful at reasoning about deal context and composing outreach. But it should **never**:

- Directly send messages to sellers or buyers
- Bypass compliance checks
- Modify deal state without going through Hālo's state machine
- Store its own copy of CRM data

By routing all actions through Hālo's API, we get:

1. **Audit trail** — every agent action is logged in timeline events and automation runs
2. **Policy enforcement** — DNC, consent, quiet hours, and control-plane rules are always enforced
3. **Human oversight** — external communications require approval before sending
4. **Attribution** — agent actions are linked to automation runs for ROI tracking

## Agent API Endpoints

### Deal Context
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/agent/deals/:id/summary` | Compact deal summary |
| GET | `/api/agent/deals/:id/context` | Full deal context |
| POST | `/api/agent/deals/:id/next-actions` | Suggested next actions |

### Draft Creation
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/agent/deals/:id/draft-seller-email` | Draft seller email |
| POST | `/api/agent/deals/:id/draft-seller-sms` | Draft seller SMS |
| POST | `/api/agent/deals/:id/draft-buyer-email` | Draft buyer email |
| POST | `/api/agent/deals/:id/draft-buyer-sms` | Draft buyer SMS |

### Approval & Send
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/agent/communications/pending-approvals` | List pending approvals |
| POST | `/api/agent/communications/:id/request-send` | Submit draft for approval |

### Notes & Classification
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/agent/deals/:id/log-agent-note` | Log agent note |
| POST | `/api/agent/deals/:id/classify-inbound` | Classify inbound message |
| POST | `/api/agent/deals/:id/propose-follow-up` | Get follow-up suggestion |

## Automation Run Tracking

Every agent action creates an `AutomationRun` record that tracks:

- **Who** triggered it (agent name, source)
- **What** happened (workflow name, input/output)
- **Cost** (AI cost, messaging cost, tool cost)
- **Outcome** (estimated value, realized value)
- **Status** (queued → running → completed/failed/cancelled)

## Authentication

All agent API endpoints require a valid Bearer token. Set the `HALO_TOKEN` environment variable with a Descope session token that has access to the target tenant.

```bash
export HALO_API_URL="http://localhost:3001/api"
export HALO_TOKEN="your-bearer-token-here"
```

## CLI Wrapper

The `scripts/halo-agent.ts` CLI provides a convenient wrapper:

```bash
# Get deal summary
tsx scripts/halo-agent.ts deal-summary --deal <id>

# Draft and submit an SMS
tsx scripts/halo-agent.ts draft-seller-sms --deal <id> --content "Hello..."
tsx scripts/halo-agent.ts request-send --message <id>

# Check automation metrics
tsx scripts/halo-agent.ts automation-overview
```

## Internal vs. External Messaging Policy

| Message Type | Route | Approval Required |
|-------------|-------|-------------------|
| Agent note (internal) | `log-agent-note` → timeline | No |
| Seller SMS/email | `draft-*` → approval queue → send | Yes |
| Buyer SMS/email | `draft-*` → approval queue → send | Yes |
| System notification | Direct timeline event | No |

## Limitations & Future Work

- **No streaming responses** — the current API is request/response only
- **Simple attribution** — uses nearest-prior-outbound matching; multi-touch attribution is planned
- **No native plugin** — OpenClaw plugin with WebSocket support is on the roadmap
- **Rule-based classification** — inbound message classification uses heuristics; LLM-based classification is planned
