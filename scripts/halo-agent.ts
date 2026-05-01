#!/usr/bin/env tsx
/**
 * halo-agent CLI — local wrapper for Hālo agent API endpoints.
 *
 * Usage:
 *   tsx scripts/halo-agent.ts <command> [options]
 *
 * Env:
 *   HALO_API_URL  — base URL (default http://localhost:3001/api)
 *   HALO_TOKEN    — Bearer token for auth
 *
 * Commands:
 *   deal-summary        --deal <id>
 *   deal-context         --deal <id>
 *   next-actions         --deal <id>
 *   draft-seller-email   --deal <id> --content "..." [--subject "..."]
 *   draft-seller-sms     --deal <id> --content "..."
 *   draft-buyer-email    --deal <id> --content "..." [--subject "..."]
 *   draft-buyer-sms      --deal <id> --content "..."
 *   pending-approvals
 *   request-send         --message <id>
 *   log-note             --deal <id> --text "..."
 *   automation-overview
 */

const BASE = process.env.HALO_API_URL || 'http://localhost:3001/api';
const TOKEN = process.env.HALO_TOKEN || '';

interface CliArgs {
  command: string;
  deal?: string;
  message?: string;
  content?: string;
  subject?: string;
  text?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = { command: args[0] || '' };

  for (let i = 1; i < args.length; i++) {
    const key = args[i];
    const val = args[i + 1];
    switch (key) {
      case '--deal':
        result.deal = val;
        i++;
        break;
      case '--message':
        result.message = val;
        i++;
        break;
      case '--content':
        result.content = val;
        i++;
        break;
      case '--subject':
        result.subject = val;
        i++;
        break;
      case '--text':
        result.text = val;
        i++;
        break;
    }
  }

  return result;
}

async function request(
  method: string,
  path: string,
  body?: any,
): Promise<any> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (TOKEN) {
    headers['Authorization'] = `Bearer ${TOKEN}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(JSON.stringify({ error: true, status: res.status, body: text }));
    process.exit(1);
  }

  return res.json();
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.command) {
    console.error(
      JSON.stringify({ error: true, message: 'No command specified. Run with --help for usage.' }),
    );
    process.exit(1);
  }

  let result: any;

  switch (args.command) {
    case 'deal-summary':
      if (!args.deal) { console.error(JSON.stringify({ error: true, message: '--deal required' })); process.exit(1); }
      result = await request('GET', `/agent/deals/${args.deal}/summary`);
      break;

    case 'deal-context':
      if (!args.deal) { console.error(JSON.stringify({ error: true, message: '--deal required' })); process.exit(1); }
      result = await request('GET', `/agent/deals/${args.deal}/context`);
      break;

    case 'next-actions':
      if (!args.deal) { console.error(JSON.stringify({ error: true, message: '--deal required' })); process.exit(1); }
      result = await request('POST', `/agent/deals/${args.deal}/next-actions`, {});
      break;

    case 'draft-seller-email':
      if (!args.deal || !args.content) { console.error(JSON.stringify({ error: true, message: '--deal and --content required' })); process.exit(1); }
      result = await request('POST', `/agent/deals/${args.deal}/draft-seller-email`, {
        content: args.content,
        subject: args.subject,
        agentName: 'halo-agent-cli',
      });
      break;

    case 'draft-seller-sms':
      if (!args.deal || !args.content) { console.error(JSON.stringify({ error: true, message: '--deal and --content required' })); process.exit(1); }
      result = await request('POST', `/agent/deals/${args.deal}/draft-seller-sms`, {
        content: args.content,
        agentName: 'halo-agent-cli',
      });
      break;

    case 'draft-buyer-email':
      if (!args.deal || !args.content) { console.error(JSON.stringify({ error: true, message: '--deal and --content required' })); process.exit(1); }
      result = await request('POST', `/agent/deals/${args.deal}/draft-buyer-email`, {
        content: args.content,
        subject: args.subject,
        agentName: 'halo-agent-cli',
      });
      break;

    case 'draft-buyer-sms':
      if (!args.deal || !args.content) { console.error(JSON.stringify({ error: true, message: '--deal and --content required' })); process.exit(1); }
      result = await request('POST', `/agent/deals/${args.deal}/draft-buyer-sms`, {
        content: args.content,
        agentName: 'halo-agent-cli',
      });
      break;

    case 'pending-approvals':
      result = await request('GET', `/agent/communications/pending-approvals`);
      break;

    case 'request-send':
      if (!args.message) { console.error(JSON.stringify({ error: true, message: '--message required' })); process.exit(1); }
      result = await request('POST', `/agent/communications/${args.message}/request-send`, {
        agentName: 'halo-agent-cli',
      });
      break;

    case 'log-note':
      if (!args.deal || !args.text) { console.error(JSON.stringify({ error: true, message: '--deal and --text required' })); process.exit(1); }
      result = await request('POST', `/agent/deals/${args.deal}/log-agent-note`, {
        text: args.text,
        agentName: 'halo-agent-cli',
      });
      break;

    case 'automation-overview':
      result = await request('GET', `/analytics/automation/overview`);
      break;

    default:
      console.error(
        JSON.stringify({ error: true, message: `Unknown command: ${args.command}` }),
      );
      process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});
