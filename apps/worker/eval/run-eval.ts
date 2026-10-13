import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse as parseEnv } from 'dotenv';
import {
  AGENT_NAMES,
  type AgentModelTier,
  type AgentModels,
  type AgentName,
} from '@halo/shared';
import { apiChat, openAiChat } from './chat-backends';
import {
  PROMPT_VERSIONS,
  checkPromptLock,
  formatReport,
  loadGoldenFiles,
  readPromptLock,
  runCase,
  runsIn,
  saveGoldenFile,
  skippedResult,
  summarize,
  withAgentDefaults,
  writePromptLock,
  type CaseResult,
  type ChatFn,
  type EvalMode,
  type GoldenCase,
  type LoadedGoldenFile,
} from './golden-eval';

const USAGE = `Agent golden set (docs/agent-eval.md)

  npm run agents:eval -- [options]

Without options every case is replayed against its recorded model reply:
free, deterministic, the same check CI runs.

  --live                  ask real models instead (costs money)
  --via api|openai        live backend: the api's internal chat route (default;
                          uses the tenant's keys and cost control) or OpenAI
                          directly with OPENAI_API_KEY (CI)
  --account <id>          tenant for --via api (default EVAL_ACCOUNT_ID)
  --models mid=gpt-4o,strong=claude-opus-5-5
                          tier overrides, like a tenant's agent models
  --max-cost-usd <n>      stop a live run at this estimated spend (default 2)
  --concurrency <n>       live calls in flight (default 4)
  --agent <name>          only this agent (comma list allowed)
  --case <text>           only cases whose id contains this
  --record                live: store passing replies as the new recordings
  --lock                  record the current prompt hashes and exit
  --report <file.md>      also write the report as Markdown
  --json <file>           also write every case result as JSON
`;

export interface Args {
  help: boolean;
  live: boolean;
  via: 'api' | 'openai';
  account?: string;
  models: AgentModels;
  maxCostUsd: number;
  concurrency: number;
  agents: AgentName[];
  caseFilter?: string;
  record: boolean;
  lock: boolean;
  report?: string;
  json?: string;
}

class UsageError extends Error {}

const fail = (message: string): never => {
  throw new UsageError(message);
};

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    live: false,
    via: 'api',
    models: {},
    maxCostUsd: 2,
    concurrency: 4,
    agents: [],
    record: false,
    lock: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].indexOf('=');
    const flag = eq > 0 ? argv[i].slice(0, eq) : argv[i];
    const inline = eq > 0 ? argv[i].slice(eq + 1) : undefined;
    const value = (): string =>
      inline ?? argv[++i] ?? fail(`${flag} needs a value`);
    switch (flag) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--live':
        args.live = true;
        break;
      case '--via': {
        const v = value();
        if (v !== 'api' && v !== 'openai') fail('--via is api or openai');
        args.via = v as Args['via'];
        break;
      }
      case '--account':
        args.account = value();
        break;
      case '--models':
        for (const pair of value().split(',')) {
          const [tier, model] = pair.split('=');
          if (!['cheap', 'mid', 'strong'].includes(tier) || !model?.trim()) {
            fail(`--models takes tier=model pairs, got "${pair}"`);
          }
          args.models[tier as AgentModelTier] = model.trim();
        }
        break;
      case '--max-cost-usd':
        args.maxCostUsd = Number(value());
        if (!(args.maxCostUsd > 0)) fail('--max-cost-usd must be positive');
        break;
      case '--concurrency':
        args.concurrency = Math.max(1, Math.floor(Number(value())) || 1);
        break;
      case '--agent':
        for (const a of value().split(',')) {
          if (!(AGENT_NAMES as readonly string[]).includes(a)) {
            fail(`unknown agent ${a}; one of ${AGENT_NAMES.join(', ')}`);
          }
          args.agents.push(a as AgentName);
        }
        break;
      case '--case':
        args.caseFilter = value();
        break;
      case '--record':
        args.record = true;
        break;
      case '--lock':
        args.lock = true;
        break;
      case '--report':
        args.report = value();
        break;
      case '--json':
        args.json = value();
        break;
      default:
        fail(`unknown option ${flag}`);
    }
  }
  if (args.record && !args.live) fail('--record needs --live');
  return args;
}

/** INTERNAL_API_* and EVAL_ACCOUNT_ID from the worker's .env.local, unless already set. */
function loadWorkerEnv(): void {
  const path = join(__dirname, '..', '.env.local');
  if (!existsSync(path)) return;
  const env = parseEnv(readFileSync(path));
  for (const key of [
    'INTERNAL_API_BASE_URL',
    'INTERNAL_API_TOKEN',
    'EVAL_ACCOUNT_ID',
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
}

function liveBackend(args: Args): ChatFn {
  if (args.via === 'openai') {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) fail('--via openai needs OPENAI_API_KEY');
    return openAiChat(key as string);
  }
  loadWorkerEnv();
  if (!process.env.INTERNAL_API_BASE_URL || !process.env.INTERNAL_API_TOKEN) {
    fail('--via api needs INTERNAL_API_BASE_URL and INTERNAL_API_TOKEN');
  }
  args.account = args.account ?? process.env.EVAL_ACCOUNT_ID;
  if (!args.account) fail('--via api needs --account or EVAL_ACCOUNT_ID');
  return apiChat();
}

async function runAll(
  files: LoadedGoldenFile[],
  args: Args,
  mode: EvalMode,
  chat?: ChatFn,
): Promise<CaseResult[]> {
  const jobs: Array<{ file: LoadedGoldenFile; c: GoldenCase }> = [];
  for (const file of files) {
    for (const c of file.cases) {
      if (!runsIn(c, mode)) continue;
      if (args.caseFilter && !c.id.includes(args.caseFilter)) continue;
      jobs.push({ file, c });
    }
  }
  const results: CaseResult[] = new Array(jobs.length);
  let next = 0;
  let spent = 0;
  let backendErrors = 0;
  let stopReason: string | null = null;

  const lane = async () => {
    while (next < jobs.length) {
      const i = next++;
      const { file, c } = jobs[i];
      if (stopReason) {
        results[i] = skippedResult(file, c, mode, stopReason);
        continue;
      }
      const r = await runCase(file, c, {
        mode,
        chat,
        models: args.models,
        accountId: args.account,
      });
      results[i] = r;
      if (mode !== 'live') continue;
      spent += r.costUsd;
      backendErrors = r.errorKind === 'backend' ? backendErrors + 1 : 0;
      if (backendErrors >= 3) {
        stopReason = `stopped after 3 failed model calls in a row: ${r.error}`;
      } else if (spent >= args.maxCostUsd) {
        stopReason = `stopped at the $${args.maxCostUsd} cost cap`;
      }
      process.stderr.write(
        `[${i + 1}/${jobs.length}] ${r.agent}/${r.id}: ${r.passed ? 'pass' : 'FAIL'} ($${r.costUsd.toFixed(3)})\n`,
      );
    }
  };
  const lanes = mode === 'live' ? args.concurrency : 1;
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

function asRecording(reply: string): unknown {
  try {
    const parsed = JSON.parse(reply.trim());
    return parsed && typeof parsed === 'object' ? parsed : reply;
  } catch {
    return reply;
  }
}

/** Passing live replies become the recordings the offline mode replays. */
function record(files: LoadedGoldenFile[], results: CaseResult[]): number {
  let total = 0;
  for (const file of files) {
    let changed = 0;
    for (const c of file.cases) {
      if (c.expect.decidedBy !== 'model' || c.expect.error) continue;
      const r = results.find((x) => x.agent === file.agent && x.id === c.id);
      if (!r?.passed || !r.reply) continue;
      c.reply = asRecording(r.reply);
      c.recordedWith = {
        model: r.model ?? 'unknown',
        promptVersion: PROMPT_VERSIONS[file.agent],
        at: new Date().toISOString(),
      };
      changed++;
    }
    if (changed) saveGoldenFile(file);
    total += changed;
  }
  return total;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.lock) {
    const lock = writePromptLock();
    const current = AGENT_NAMES.map((a) => PROMPT_VERSIONS[a]).join(', ');
    process.stdout.write(
      `prompt-lock.json: ${current} (${Object.keys(lock).length} versions on record)\n`,
    );
    return 0;
  }

  const mode: EvalMode = args.live ? 'live' : 'offline';
  const files = loadGoldenFiles().filter(
    (f) => args.agents.length === 0 || args.agents.includes(f.agent),
  );
  const chat = args.live ? liveBackend(args) : undefined;
  const results = await withAgentDefaults(() =>
    runAll(files, args, mode, chat),
  );
  const summaries = files.map((f) => summarize(f, results, mode));
  const lock = checkPromptLock(readPromptLock());
  const report = formatReport(summaries, results, lock, mode);

  process.stdout.write(report);
  if (args.report) writeFileSync(args.report, report);
  if (args.json) {
    writeFileSync(
      args.json,
      `${JSON.stringify({ summaries, results }, null, 2)}\n`,
    );
  }
  if (args.record) {
    const n = record(files, results);
    process.stdout.write(
      `\nRecorded ${n} passing repl${n === 1 ? 'y' : 'ies'} into the golden files.\n`,
    );
  }
  // A live run is how a new prompt version is measured before it is
  // locked, so only the offline run enforces the lock.
  const lockOk = mode === 'live' || lock.every((l) => l.ok);
  return summaries.every((s) => s.ok) && lockOk ? 0 : 1;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      if (err instanceof UsageError) {
        process.stderr.write(`agents:eval: ${err.message}\n\n${USAGE}`);
      } else {
        process.stderr.write(`agents:eval: ${(err as Error).stack ?? err}\n`);
      }
      process.exit(2);
    },
  );
}
