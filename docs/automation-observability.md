# Automation Observability & ROI Tracking

## Automation Runs

Every agent-initiated action creates an `AutomationRun` record in the database. This provides full observability into what agents are doing, what they cost, and what value they generate.

### AutomationRun Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `tenantId` | Multi-tenant scope |
| `source` | Originating system (default: `openclaw`) |
| `agentName` | Name of the agent that triggered the run |
| `workflowName` | Workflow identifier (e.g., `draft-seller-sms`) |
| `entityType` | Target entity type (`deal`, `lead`, `message`) |
| `entityId` | Target entity ID |
| `status` | `QUEUED` → `RUNNING` → `COMPLETED`/`FAILED`/`CANCELLED`/`AWAITING_APPROVAL` |
| `triggerType` | `MANUAL`, `SCHEDULED`, `INBOUND_WEBHOOK`, `UI`, `API` |
| `inputJson` | Input data for the run |
| `outputJson` | Output/result data |
| `decisionJson` | Agent's decision reasoning |
| `errorJson` | Error details if failed |
| `aiCostUsd` | AI/LLM costs |
| `messageCostUsd` | SMS/email sending costs |
| `toolCostUsd` | Tool/API call costs |
| `estimatedValueUsd` | Projected value of the action |
| `realizedValueUsd` | Actual value after outcome is known |

### Status Lifecycle

```
QUEUED → RUNNING → COMPLETED
                  → FAILED
                  → CANCELLED
                  → AWAITING_APPROVAL → COMPLETED (after human approval)
```

## Attribution

Attribution links agent actions to business outcomes. The current implementation uses a simple, explicit strategy:

### Direct Attribution
When an agent creates a communication draft, the message is directly linked to the automation run via `automationRunId`.

### Reply Attribution
When an inbound reply is received, the system looks for the most recent outbound message on the same deal/lead that was agent-originated, within a configurable attribution window (default: 7 days).

### Stage Change Attribution
When a deal moves to a new stage, the system checks for the most recent completed automation run on that deal within a 14-day window.

### Attribution Metadata
Attribution method is always stored in the record metadata, making it inspectable:
- `direct` — message was created by the automation run
- `nearest_prior_outbound` — reply attributed to nearest prior agent-sent message
- `nearest_recent_run` — stage change attributed to most recent automation run

## Deal Economics / ROI

The `DealEconomics` model tracks financial data per deal:

### Revenue
- `contractPrice` — original contract amount
- `assignmentPrice` — assignment amount
- `assignmentFee` — direct assignment fee (wholesale model)
- `purchasePrice` — purchase price (buy-sell model)
- `salePrice` — sale price (buy-sell model)

### Costs
- `closingCosts` — title, escrow, legal
- `marketingCost` — flyers, buyer blasts
- `skipTraceCost` — skip tracing services
- `smsCost` — SMS messaging costs
- `emailCost` — email costs
- `aiCostAllocated` — AI costs attributed to this deal
- `toolingCost` — API/tool costs
- `laborCost` — human labor costs
- `otherCost` — miscellaneous costs

### Computed Fields
- `grossRevenue` = assignmentFee OR (salePrice - purchasePrice) OR (assignmentPrice - contractPrice)
- `netProfit` = grossRevenue - totalCosts
- `roiPercent` = (netProfit / totalCosts) × 100

These are recomputed whenever economics data is updated.

## Analytics Endpoints

### Automation Overview
`GET /api/analytics/automation/overview` — run counts by status, draft counts, approval rates

### Costs
`GET /api/analytics/automation/costs` — AI spend, messaging spend, tool spend, total spend, avg cost per run

### Outcomes
`GET /api/analytics/automation/outcomes` — estimated value, realized value, drafts sent, replies

### ROI
`GET /api/analytics/automation/roi` — combined costs, outcomes, deal economics, derived metrics (cost per reply, etc.)

### By Workflow
`GET /api/analytics/automation/by-workflow` — grouped metrics per workflow name

### By Agent
`GET /api/analytics/automation/by-agent` — grouped metrics per agent name

## Env Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HALO_API_URL` | Base URL for agent CLI | `http://localhost:3001/api` |
| `HALO_TOKEN` | Bearer token for authentication | — |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_URL` | Redis connection string | — |
