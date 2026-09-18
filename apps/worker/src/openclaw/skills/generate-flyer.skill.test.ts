import { GenerateFlyerSkill } from './generate-flyer.skill';

test('GenerateFlyerSkill rejects instead of claiming a job was queued', async () => {
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

  const skill = new GenerateFlyerSkill(prisma as any).getDefinition();

  await expect(skill.execute({ dealId: 'deal-1', tenantId: 'acct-1' })).rejects.toThrow(/Flyer generation is unavailable: no marketing job was enqueued\./);

  expect(findFirstCalls).toEqual([
    { where: { id: 'deal-1', accountId: 'acct-1' } },
  ]);
  expect(jobRunCreates).toEqual([]);
});
