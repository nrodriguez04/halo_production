import assert from 'node:assert/strict';
import test from 'node:test';
import { UnderwriteDealSkill } from './underwrite-deal.skill';

test('UnderwriteDealSkill rejects instead of claiming a job was queued', async () => {
  const findFirstCalls: unknown[] = [];
  const jobRunCreates: unknown[] = [];
  const prisma = {
    deal: {
      findFirst: async (args: unknown) => {
        findFirstCalls.push(args);
        return { id: 'deal-1' };
      },
    },
    jobRun: {
      create: async (args: unknown) => {
        jobRunCreates.push(args);
        return { id: 'job-1' };
      },
    },
  };

  const skill = new UnderwriteDealSkill(prisma as any).getDefinition();

  await assert.rejects(
    skill.execute({ dealId: 'deal-1', tenantId: 'acct-1' }),
    /Underwriting is unavailable: no underwriting job was enqueued\./,
  );

  assert.deepEqual(findFirstCalls, [
    { where: { id: 'deal-1', accountId: 'acct-1' } },
  ]);
  assert.deepEqual(jobRunCreates, []);
});
