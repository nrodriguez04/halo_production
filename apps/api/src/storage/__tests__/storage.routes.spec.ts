import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as express from 'express';
import { Readable } from 'stream';
import * as request from 'supertest';
import { StorageController } from '../storage.controller';
import { StorageService } from '../storage.service';
import { AuthGuard } from '../../auth/auth.guard';

/** Echoes the body it got, to see what a POST with no payload reaches a handler as. */
@Controller('echo')
class EchoController {
  @Post()
  echo(@Body() body: unknown) {
    return { body: body ?? null };
  }
}

/**
 * The storage routes on a real Express 5 server: wildcard keys with
 * slashes in them (Express 5 names the wildcard and hands it over as path
 * segments), and the tenant check on the joined key.
 */
describe('storage routes on Express 5', () => {
  let app: INestApplication;
  const storage = {
    download: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
    upload: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StorageController, EchoController],
      providers: [{ provide: StorageService, useValue: storage }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { accountId: 'acct-1' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    // The same parsers and empty-body default as main.ts.
    app.use(express.json());
    app.use((req: any, _res: unknown, next: () => void) => {
      if (req.body === undefined) req.body = {};
      next();
    });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app?.close());
  beforeEach(() => jest.clearAllMocks());

  it('downloads a key with slashes in it, joined back together', async () => {
    storage.download.mockResolvedValue({
      body: Readable.from([Buffer.from('pdf bytes')]),
      contentType: 'application/pdf',
    });
    const res = await request(app.getHttpServer()).get(
      '/api/storage/download/acct-1/contracts/2026/deal-9.pdf',
    );
    expect(res.status).toBe(200);
    expect(storage.download).toHaveBeenCalledWith(
      'acct-1/contracts/2026/deal-9.pdf',
    );
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="deal-9.pdf"',
    );
  });

  it("refuses another tenant's key", async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/storage/download/acct-2/contracts/x.pdf',
    );
    expect(res.status).toBe(404);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('deletes a nested key', async () => {
    storage.delete.mockResolvedValue(undefined);
    const res = await request(app.getHttpServer()).delete(
      '/api/storage/acct-1/flyers/a/b.png',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, key: 'acct-1/flyers/a/b.png' });
  });

  it('still routes the fixed paths beside the wildcard', async () => {
    storage.list.mockResolvedValue([]);
    const res = await request(app.getHttpServer()).get(
      '/api/storage/files?category=flyers',
    );
    expect(res.status).toBe(200);
    expect(storage.list).toHaveBeenCalledWith('acct-1', 'flyers');
  });

  it('hands a POST with no payload to the handler as {}, as Express 4 did', async () => {
    const res = await request(app.getHttpServer()).post('/api/echo');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ body: {} });
  });
});
