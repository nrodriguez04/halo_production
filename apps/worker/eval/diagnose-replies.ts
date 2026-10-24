/* eslint-disable no-console */
// Diagnose live replies the agents reject as "not the JSON the prompt asked
// for": runs one agent's golden cases against OpenAI, keeps every raw reply,
// and prints the schema issues each rejected reply has. A development aid;
// it costs what the live eval costs for that agent.
//
//   OPENAI_API_KEY=... npx tsx eval/diagnose-replies.ts market_expansion [case-substring]
import {
  MarketExpansionOutputSchema,
  MarketIntelligenceOutputSchema,
} from '@halo/shared';
import type { ZodTypeAny } from 'zod';
import { openAiChat } from './chat-backends';
import { loadGoldenFiles, runCase, withAgentDefaults } from './golden-eval';

/** The same extraction the agents use: the outermost {...} in the reply. */
function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const SCHEMAS: Record<string, ZodTypeAny> = {
  market_expansion: MarketExpansionOutputSchema,
  market_intelligence: MarketIntelligenceOutputSchema,
};

async function main() {
  const [agent, filter] = process.argv.slice(2);
  const key = process.env.OPENAI_API_KEY;
  if (!agent || !key)
    throw new Error(
      'usage: OPENAI_API_KEY=... tsx eval/diagnose-replies.ts <agent> [case]',
    );
  const schema = SCHEMAS[agent];
  const base = openAiChat(key);
  const file = loadGoldenFiles().find((f) => f.agent === agent);
  if (!file) throw new Error(`no golden file for ${agent}`);
  const cases = file.cases.filter((c) => !filter || c.id.includes(filter));
  let spent = 0;
  await withAgentDefaults(async () => {
    for (const c of cases) {
      let raw = '';
      const chat: typeof base = async (accountId, input) => {
        const out = await base(accountId, input);
        raw = out.content;
        return out;
      };
      const r = await runCase(file, c, { mode: 'live', chat });
      spent += r.costUsd;
      console.log(
        `\n=== ${c.id}: ${r.passed ? 'pass' : 'FAIL'} (${r.decidedBy})`,
      );
      if (!r.passed && r.decision?.rationale)
        console.log('  rationale:', r.decision.rationale);
      if (r.decidedBy !== 'error' || !raw) continue;
      const json = firstJsonObject(raw);
      if (json === undefined) {
        console.log(
          '  no JSON object in the reply; it starts:',
          JSON.stringify(raw.slice(0, 200)),
        );
        continue;
      }
      const parsed = schema?.safeParse(json);
      if (parsed && !parsed.success) {
        for (const i of parsed.error.issues.slice(0, 8)) {
          console.log(`  ${i.path.join('.') || '(root)'}: ${i.message}`);
        }
      }
    }
  });
  console.log(`\nspent about $${spent.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
