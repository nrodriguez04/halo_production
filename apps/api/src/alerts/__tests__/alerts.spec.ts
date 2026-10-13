import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  OpsAlertService,
  environmentLabel,
  formatAlert,
} from '../ops-alert.service';
import {
  AlertingExceptionFilter,
  isZodError,
  shouldAlert,
  validationError,
} from '../alerting-exception.filter';
import { FailedJobsWatcherService } from '../failed-jobs-watcher.service';
import { IntegrationUnavailableException } from '../../integrations/integration-unavailable.exception';

describe('OpsAlertService', () => {
  const env = { ...process.env };
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...env,
      ALERT_WEBHOOK_URL: 'https://hooks.example/abc',
      PUBLIC_API_URL: 'https://api.halo.test/api',
    };
    (global as any).fetch = fetchMock;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });
  afterAll(() => {
    process.env = env;
  });

  it('posts Slack and Discord compatible JSON with the environment in the title', async () => {
    const ok = await new OpsAlertService().send({
      title: 'Unhandled error on GET /api/leads',
      severity: 'critical',
      lines: ['Error: boom'],
    });
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example/abc');
    const body = JSON.parse(init.body);
    expect(body.text).toBe(body.content);
    expect(body.text).toBe(
      '[CRITICAL] Halo (api.halo.test): Unhandled error on GET /api/leads\nError: boom',
    );
  });

  it('suppresses repeats for 15 minutes and reports how many it held back', async () => {
    const alerts = new OpsAlertService();
    const t0 = 1_000_000;
    await alerts.send({ title: 'x', fingerprint: 'f' }, t0);
    await expect(
      alerts.send({ title: 'x', fingerprint: 'f' }, t0 + 60_000),
    ).resolves.toBe(false);
    await expect(
      alerts.send({ title: 'x', fingerprint: 'f' }, t0 + 120_000),
    ).resolves.toBe(false);
    await alerts.send({ title: 'x', fingerprint: 'f' }, t0 + 16 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).text).toContain(
      '2 similar alert(s) suppressed',
    );
  });

  it('logs only, and never throws, without a webhook or when the webhook fails', async () => {
    delete process.env.ALERT_WEBHOOK_URL;
    const alerts = new OpsAlertService();
    expect(alerts.configured()).toBe(false);
    await expect(alerts.send({ title: 'a' })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/abc';
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(alerts.send({ title: 'b' })).resolves.toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(alerts.send({ title: 'c' })).resolves.toBe(false);
  });

  it('labels the environment and truncates long alerts', () => {
    expect(environmentLabel({ NODE_ENV: 'production' } as any)).toBe(
      'production',
    );
    const text = formatAlert({ title: 't', lines: ['x'.repeat(5000)] });
    expect(text.length).toBeLessThanOrEqual(3503);
  });
});

describe('AlertingExceptionFilter', () => {
  it('alerts on unexpected errors and plain 500s only', () => {
    expect(shouldAlert(new Error('boom'))).toBe(true);
    expect(shouldAlert(new HttpException('x', 500))).toBe(true);
    expect(shouldAlert(new NotFoundException())).toBe(false);
    expect(shouldAlert(new BadRequestException())).toBe(false);
    expect(
      shouldAlert(
        IntegrationUnavailableException.notConfigured(
          'openai',
          'OPENAI_API_KEY',
        ),
      ),
    ).toBe(false);
  });

  it('turns a zod failure into a 400 with the field issues, without alerting', () => {
    const err = (() => {
      try {
        z.object({ agent: z.enum(['a', 'b']), limit: z.number() }).parse({
          agent: 'nope',
        });
      } catch (e) {
        return e;
      }
    })();
    expect(isZodError(err)).toBe(true);
    expect(isZodError({ name: 'ZodError', issues: [] })).toBe(true);
    expect(shouldAlert(err)).toBe(false);
    const bad = validationError(err as any);
    expect(bad.getStatus()).toBe(400);
    const body = bad.getResponse() as any;
    expect(body.message).toContain('agent:');
    expect(body.issues.map((i: any) => i.path)).toEqual(['agent', 'limit']);
  });

  it('sends the alert and still answers like Nest would', () => {
    const alerts = { send: jest.fn().mockResolvedValue(true) };
    const reply = jest.fn();
    const adapter = {
      reply,
      isHeadersSent: jest.fn().mockReturnValue(false),
      end: jest.fn(),
    } as any;
    const filter = new AlertingExceptionFilter(adapter, alerts as any);
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', route: { path: '/api/leads' } }),
      }),
      getArgByIndex: () => ({}),
      getArgs: () => [{}, {}],
    } as any;

    filter.catch(new Error('database exploded'), host);

    expect(alerts.send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unhandled error on GET /api/leads',
        severity: 'critical',
      }),
    );
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
      500,
    );
  });
});

describe('FailedJobsWatcherService', () => {
  it('alerts once per queue with new failures and moves its window forward', async () => {
    const queues = {
      failedJobsSince: jest.fn().mockResolvedValue({
        'lead-enrichment': [
          { id: '1', name: 'enrich', failedReason: 'ATTOM 500', finishedOn: 2 },
          { id: '2', name: 'enrich', failedReason: 'ATTOM 500', finishedOn: 3 },
        ],
        communications: [],
      }),
    };
    const alerts = { send: jest.fn().mockResolvedValue(true) };
    const watcher = new FailedJobsWatcherService(queues as any, alerts as any);

    await expect(watcher.tick(5_000)).resolves.toBe(2);
    expect(alerts.send).toHaveBeenCalledTimes(1);
    expect(alerts.send.mock.calls[0][0]).toMatchObject({
      title: '2 job(s) failed on the lead-enrichment queue',
      severity: 'warning',
    });
    expect(alerts.send.mock.calls[0][0].lines[0]).toContain('ATTOM 500');

    queues.failedJobsSince.mockResolvedValue({});
    await watcher.tick(9_000);
    expect(queues.failedJobsSince).toHaveBeenLastCalledWith(5_000);
  });

  it('survives a Redis error', async () => {
    const watcher = new FailedJobsWatcherService(
      {
        failedJobsSince: jest.fn().mockRejectedValue(new Error('redis down')),
      } as any,
      { send: jest.fn() } as any,
    );
    await expect(watcher.tick()).resolves.toBe(0);
  });
});
