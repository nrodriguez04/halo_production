# OpenClaw Integration for Hālo CRM

This directory contains the OpenClaw skill and configuration for integrating AI agents with the Hālo CRM platform.

## Architecture

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────┐
│   OpenClaw   │────▶│  Hālo Agent API      │────▶│   Hālo Core  │
│  (Orchestrator)    │  /api/agent/*         │     │  (Source of  │
│              │     │  /api/automation/*    │     │   Truth)     │
│              │◀────│  /api/analytics/*     │◀────│              │
└──────────────┘     └──────────────────────┘     └──────────────┘
                              │                          │
                              │                   ┌──────┴───────┐
                              │                   │  Approval    │
                              │                   │  Queue       │
                              │                   │  Compliance  │
                              │                   │  Timeline    │
                              │                   │  Audit Logs  │
                              └───────────────────┘──────────────┘
```

**OpenClaw is the orchestrator.** It reads deal context, decides on actions, and creates drafts.

**Hālo is the enforcement layer.** It owns deal state, enforces compliance (DNC, consent, quiet hours), manages the approval queue, and sends all external communications.

## Setup

1. Start the Hālo stack:
   ```bash
   docker compose up -d
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

2. Set environment variables:
   ```bash
   export HALO_API_URL="http://localhost:3001/api"
   export HALO_TOKEN="<your-auth-token>"
   ```

3. Install the skill in OpenClaw by pointing it to `.openclaw/skills/halo/SKILL.md`

## Skill Location

- **Skill definition:** `.openclaw/skills/halo/SKILL.md`
- **CLI wrapper:** `scripts/halo-agent.ts`
- **API docs:** `docs/openclaw-integration.md`

## Future Plugin Path

The current integration uses the Agent API + CLI approach. A native OpenClaw plugin with WebSocket support and streaming responses is planned for a future release. The skill-based approach provides a stable foundation that the plugin can extend without breaking existing workflows.
