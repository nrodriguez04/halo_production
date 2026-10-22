import { BadRequestException } from '@nestjs/common';
import { assertUpload, detectUpload } from '../file-type';

const bytes = (...b: number[]) => Buffer.from(b);

describe('detectUpload', () => {
  it.each([
    ['deed.pdf', Buffer.from('%PDF-1.7\n...'), 'application/pdf'],
    [
      'scan.PDF',
      Buffer.concat([Buffer.from('\r\n'), Buffer.from('%PDF-1.4')]),
      'application/pdf',
    ],
    [
      'contract.docx',
      bytes(0x50, 0x4b, 0x03, 0x04, 0x14),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      'sales.xlsx',
      bytes(0x50, 0x4b, 0x03, 0x04, 0x14),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    [
      'old.doc',
      bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0),
      'application/msword',
    ],
    [
      'old.xls',
      bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0),
      'application/vnd.ms-excel',
    ],
    [
      'buyers.csv',
      Buffer.from('name,email\nA,a@x.test\n'),
      'text/csv; charset=utf-8',
    ],
    [
      'notes.txt',
      Buffer.from('caf\xe9', 'latin1'),
      'text/plain; charset=utf-8',
    ],
    [
      'excel-unicode.txt',
      bytes(0xff, 0xfe, 0x41, 0x00),
      'text/plain; charset=utf-8',
    ],
    [
      'front.png',
      bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0),
      'image/png',
    ],
    ['front.jpeg', bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'],
    ['front.gif', Buffer.from('GIF89a....'), 'image/gif'],
    [
      'front.webp',
      Buffer.concat([
        Buffer.from('RIFF'),
        bytes(0, 0, 0, 0),
        Buffer.from('WEBPVP8 '),
      ]),
      'image/webp',
    ],
  ])('accepts %s', (name, buffer, contentType) => {
    expect(detectUpload(name, buffer)).toEqual(
      expect.objectContaining({ contentType }),
    );
  });

  it.each([
    ['page.pdf', Buffer.from('<html><body>hi</body></html>')],
    ['photo.png', Buffer.from('<svg onload="x()"/>')],
    ['contract.docx', Buffer.from('%PDF-1.4')],
    ['notes.txt', bytes(0x4d, 0x5a, 0x90, 0x00, 0x03)],
  ])('refuses %s whose bytes disagree', (name, buffer) => {
    expect(detectUpload(name, buffer)).toEqual({
      refused: expect.stringContaining('contents are not'),
    });
  });

  it.each(['run.exe', 'page.html', 'image.svg', 'noextension', 'archive.zip'])(
    'refuses %s by type',
    (name) => {
      expect(detectUpload(name, Buffer.from('%PDF-1.4'))).toEqual({
        refused: expect.stringContaining('Unsupported file type'),
      });
    },
  );

  it('throws a 400 from assertUpload', () => {
    expect(() => assertUpload('page.pdf', Buffer.from('<html>'))).toThrow(
      BadRequestException,
    );
  });
});
