import {
  AgentSweepService,
  sweepEnabled,
  sweepHourUtc,
} from '../agent-sweep.service';

describe('AgentSweepService', () => {
  const orchestration = { sweep: jest.fn() };
  const service = () => new AgentSweepService(orchestration as any);

  beforeEach(() => {
    jest.clearAllMocks();
    orchestration.sweep.mockResolvedValue(2);
    delete process.env.AGENT_SWEEP_HOUR_UTC;
    delete process.env.AGENT_SWEEP;
  });

  it('runs once per UTC day, at or after the configured hour', async () => {
    const s = service();

    await expect(s.tick(new Date('2026-10-12T06:59:00.000Z'))).resolves.toBe(0);
    expect(orchestration.sweep).not.toHaveBeenCalled();

    await expect(s.tick(new Date('2026-10-12T07:00:00.000Z'))).resolves.toBe(2);
    await expect(s.tick(new Date('2026-10-12T07:10:00.000Z'))).resolves.toBe(0);
    expect(orchestration.sweep).toHaveBeenCalledTimes(1);

    await expect(s.tick(new Date('2026-10-13T07:05:00.000Z'))).resolves.toBe(2);
    expect(orchestration.sweep).toHaveBeenCalledTimes(2);
  });

  it('honours AGENT_SWEEP_HOUR_UTC', async () => {
    process.env.AGENT_SWEEP_HOUR_UTC = '22';
    const s = service();
    await s.tick(new Date('2026-10-12T21:59:00.000Z'));
    expect(orchestration.sweep).not.toHaveBeenCalled();
    await s.tick(new Date('2026-10-12T22:00:00.000Z'));
    expect(orchestration.sweep).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows a failed sweep so the timer keeps going', async () => {
    orchestration.sweep.mockRejectedValue(new Error('redis down'));
    await expect(
      service().tick(new Date('2026-10-12T08:00:00.000Z')),
    ).resolves.toBe(0);
  });

  it('is off under test and when AGENT_SWEEP=off; the hour falls back to 07:00 UTC', () => {
    expect(sweepEnabled()).toBe(false); // NODE_ENV=test under jest
    process.env.AGENT_SWEEP = 'off';
    expect(sweepEnabled()).toBe(false);
    expect(sweepHourUtc()).toBe(7);
    process.env.AGENT_SWEEP_HOUR_UTC = 'noon';
    expect(sweepHourUtc()).toBe(7);
    process.env.AGENT_SWEEP_HOUR_UTC = '3';
    expect(sweepHourUtc()).toBe(3);
  });
});
