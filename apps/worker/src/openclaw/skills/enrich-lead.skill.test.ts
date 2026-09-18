import { EnrichLeadSkill } from './enrich-lead.skill';

test('EnrichLeadSkill rejects instead of claiming a job was queued', async () => {
  const findFirstCalls: unknown[] = [];
  const prisma = {
    lead: {
      findFirst: async (args: unknown) => {
        findFirstCalls.push(args);
        return { id: 'lead-1' };
      },
    },
  };

  const skill = new EnrichLeadSkill(prisma as any).getDefinition();

  await expect(skill.execute({ leadId: 'lead-1', tenantId: 'acct-1' })).rejects.toThrow(/Lead enrichment is unavailable: no enrichment job was enqueued\./);

  expect(findFirstCalls).toEqual([
    { where: { id: 'lead-1', accountId: 'acct-1' } },
  ]);
});
