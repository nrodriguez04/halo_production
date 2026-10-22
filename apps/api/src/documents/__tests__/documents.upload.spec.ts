import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DocumentsController } from '../documents.controller';
import { DocumentsService } from '../documents.service';
import { AuthGuard } from '../../auth/auth.guard';

/**
 * A real multipart request through Nest's FileInterceptor (multer), not a
 * hand-built file object: the upload path is where a multer upgrade would
 * break first, and the service specs never exercise it.
 */
describe('POST /documents (real multipart)', () => {
  let app: INestApplication;
  const documents = { create: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: documents }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          ctx.switchToHttp().getRequest().user = {
            accountId: 'tenant-1',
            userId: 'user-1',
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    documents.create.mockReset();
    documents.create.mockResolvedValue({ id: 'doc-1' });
  });

  it('hands the service the file bytes, name and size, and the form fields', async () => {
    const pdf = Buffer.from('%PDF-1.7\nSYNTHETIC\n%%EOF');
    await request(app.getHttpServer())
      .post('/documents')
      .field('category', 'other')
      .field('title', 'Synthetic deed')
      .field('tags', 'a, b')
      .attach('file', pdf, {
        filename: 'deed.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(documents.create).toHaveBeenCalledTimes(1);
    const [accountId, userId, input, file] = documents.create.mock.calls[0];
    expect(accountId).toBe('tenant-1');
    expect(userId).toBe('user-1');
    expect(input).toEqual(
      expect.objectContaining({
        category: 'other',
        title: 'Synthetic deed',
        tags: ['a', 'b'],
      }),
    );
    expect(file).toEqual(
      expect.objectContaining({ originalname: 'deed.pdf', size: pdf.length }),
    );
    expect(Buffer.compare(file.buffer, pdf)).toBe(0);
  });

  it('refuses a malformed multipart body before the service sees it', async () => {
    await request(app.getHttpServer())
      .post('/documents')
      .set('Content-Type', 'multipart/form-data; boundary=x')
      .send(
        '--x\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\nunterminated',
      )
      .expect((res) => expect(res.status).toBeGreaterThanOrEqual(400));
    expect(documents.create).not.toHaveBeenCalled();
  });
});
