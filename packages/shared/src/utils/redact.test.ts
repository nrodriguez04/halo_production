import { redactContactDetails } from './redact';

describe('redactContactDetails', () => {
  it("removes the number Twilio quotes in an invalid 'To' error", () => {
    expect(
      redactContactDetails(
        "The 'To' number +15125550100 is not a valid phone number.",
      ),
    ).toBe("The 'To' number [phone] is not a valid phone number.");
  });

  it.each([
    '(512) 555-0100',
    '512-555-0100',
    '512.555.0100',
    '+1 512 555 0100',
    '5125550100',
  ])('removes the formatted number %s', (phone) => {
    expect(redactContactDetails(`call ${phone} now`)).toBe('call [phone] now');
  });

  it('removes email addresses', () => {
    expect(
      redactContactDetails('SendGrid rejected Seller.Name+x@mail.example.co.uk'),
    ).toBe('SendGrid rejected [email]');
  });

  it('leaves error codes, short numbers and identifiers alone', () => {
    const text =
      'Twilio error 21211 on SM0123456789abcdef0123456789abcdef after 3 retries (HTTP 400)';
    expect(redactContactDetails(text)).toBe(text);
  });

  it('passes non-strings through', () => {
    expect(redactContactDetails(undefined)).toBeUndefined();
    expect(redactContactDetails(null)).toBeNull();
  });
});
