import PizZip from 'pizzip';
import {
  TemplateFileError,
  buildDocx,
  docxToPdf,
  formatOf,
  plainText,
  readFields,
  render,
  sha256,
  textToPdf,
} from '../template-files';

describe('template files', () => {
  const docx = buildDocx([
    { text: 'SYNTHETIC AGREEMENT', style: 'title' },
    {
      text: 'Seller {{ seller_name }} sells {{property_address}} for {{purchase_price}}.',
    },
    { text: 'Seller again: {{seller_name}}.' },
  ]);

  it('knows the two template formats by extension', () => {
    expect(formatOf('a.DOCX')).toBe('docx');
    expect(formatOf('a.txt')).toBe('txt');
    expect(formatOf('a.pdf')).toBeNull();
    expect(formatOf('a.doc')).toBeNull();
  });

  it('reads merge fields from a Word document once each, in order', () => {
    expect(readFields('docx', docx)).toEqual([
      'seller_name',
      'property_address',
      'purchase_price',
    ]);
  });

  it('reads fields split across runs, as Word often saves them', () => {
    const zip = new PizZip(docx);
    const xml = zip.file('word/document.xml')!.asText();
    zip.file(
      'word/document.xml',
      xml.replace(
        '<w:p><w:r><w:t xml:space="preserve">Seller again: {{seller_name}}.</w:t></w:r></w:p>',
        '<w:p><w:r><w:t xml:space="preserve">Close {{closing_</w:t></w:r><w:r><w:t xml:space="preserve">deadline}}.</w:t></w:r></w:p>',
      ),
    );
    const split = zip.generate({ type: 'nodebuffer' }) as Buffer;
    expect(readFields('docx', split)).toContain('closing_deadline');
    const filled = render('docx', split, {
      seller_name: 'A',
      property_address: 'B',
      purchase_price: 'C',
      closing_deadline: 'November 20, 2026',
    });
    expect(plainText('docx', filled)).toContain('Close November 20, 2026.');
  });

  it('fills a Word document and leaves no blanks', () => {
    const out = render('docx', docx, {
      seller_name: 'SYNTHETIC Seller & Co <x>',
      property_address: '1 Test St',
      purchase_price: '$1.00',
    });
    const text = plainText('docx', out);
    expect(text).toContain(
      'Seller SYNTHETIC Seller & Co <x> sells 1 Test St for $1.00.',
    );
    expect(text).not.toMatch(/\{\{/);
  });

  it('refuses sections, malformed tags and odd field names', () => {
    expect(() =>
      readFields('txt', Buffer.from('{{#items}}x{{/items}}')),
    ).toThrow(TemplateFileError);
    expect(() =>
      readFields('docx', buildDocx([{ text: '{{#items}}x{{/items}}' }])),
    ).toThrow('sections');
    expect(() =>
      readFields('docx', buildDocx([{ text: 'bad {{ open' }])),
    ).toThrow('malformed');
    expect(() =>
      readFields('docx', buildDocx([{ text: '{{Seller Name}}' }])),
    ).toThrow('lower-case');
    expect(() => readFields('docx', Buffer.from('not a zip'))).toThrow(
      'not a valid .docx',
    );
  });

  it('refuses to fill a blank with no value', () => {
    expect(() => render('txt', Buffer.from('Hi {{seller_name}}'), {})).toThrow(
      'No value for {{seller_name}}',
    );
    expect(() =>
      render('docx', docx, { seller_name: 'A', property_address: 'B' }),
    ).toThrow(TemplateFileError);
  });

  it('draws a PDF of text, wrapping long lines and replacing characters the font cannot show', async () => {
    const pdf = await textToPdf(
      `SYNTHETIC ${'word '.repeat(400)}\nHālo ✓ done`,
      'SYNTHETIC',
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('hashes files stably', () => {
    expect(sha256(Buffer.from('a'))).toBe(sha256(Buffer.from('a')));
    expect(sha256(Buffer.from('a'))).not.toBe(sha256(Buffer.from('b')));
  });

  describe('Word to PDF through Gotenberg', () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
      delete process.env.PDF_CONVERTER_URL;
    });

    it('refuses when no converter is configured', async () => {
      await expect(docxToPdf(docx, 'a.docx')).rejects.toThrow(
        'PDF_CONVERTER_URL',
      );
    });

    it("posts the document to Gotenberg's LibreOffice route and returns the PDF", async () => {
      process.env.PDF_CONVERTER_URL = 'http://gotenberg:3000/';
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          new TextEncoder().encode('%PDF-1.7 synthetic').buffer,
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const pdf = await docxToPdf(docx, 'purchase agreement.docx');
      expect(pdf.toString()).toBe('%PDF-1.7 synthetic');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://gotenberg:3000/forms/libreoffice/convert');
      expect(init.method).toBe('POST');
      const file = (init.body as FormData).get('files') as File;
      expect(file.name).toBe('purchase_agreement.docx');
      expect(file.size).toBe(docx.length);
    });

    it('reports a converter error', async () => {
      process.env.PDF_CONVERTER_URL = 'http://gotenberg:3000';
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }) as unknown as typeof fetch;
      await expect(docxToPdf(docx, 'a.docx')).rejects.toThrow('503');
    });
  });
});
