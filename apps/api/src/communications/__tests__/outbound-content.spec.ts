import {
  SMS_OPT_OUT_TEXT,
  emailSettings,
  escapeHtml,
  withSmsOptOut,
} from '../outbound-content';
import { IntegrationUnavailableException } from '../../integrations/integration-unavailable.exception';

describe('outbound content', () => {
  describe('withSmsOptOut', () => {
    it('appends opt-out instructions', () => {
      expect(withSmsOptOut('Are you still the owner?  ')).toBe(
        `Are you still the owner?\n\n${SMS_OPT_OUT_TEXT}`,
      );
    });

    it.each([
      'Reply STOP to opt out',
      'Text "STOP" to unsubscribe',
      'reply stop to end',
      'Send STOP anytime.',
    ])("keeps the author's own instruction: %s", (content) => {
      expect(withSmsOptOut(content)).toBe(content);
    });

    it('is not fooled by "stop" elsewhere in the copy', () => {
      expect(withSmsOptOut("We won't stop until you're happy")).toContain(
        SMS_OPT_OUT_TEXT,
      );
    });
  });

  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  describe('emailSettings', () => {
    const complete = {
      EMAIL_POSTAL_ADDRESS: '100 Main St, Austin, TX 78701',
      PUBLIC_API_URL: 'https://api.example/api',
      EMAIL_FROM: 'offers@example.com',
    };

    it('reads the sender, address and public url', () => {
      expect(
        emailSettings({ ...complete, MESSAGING_BRAND_NAME: 'Acme' }),
      ).toEqual({
        brandName: 'Acme',
        postalAddress: '100 Main St, Austin, TX 78701',
        publicApiUrl: 'https://api.example/api',
        from: 'offers@example.com',
      });
    });

    it('falls back to the SendGrid verified sender', () => {
      const { EMAIL_FROM: _from, ...rest } = complete;
      expect(
        emailSettings({ ...rest, SENDGRID_FROM_EMAIL: 'verified@example.com' })
          .from,
      ).toBe('verified@example.com');
    });

    it('names every missing setting', () => {
      const err = (() => {
        try {
          emailSettings({});
        } catch (e) {
          return e as IntegrationUnavailableException;
        }
      })();
      expect(err).toBeInstanceOf(IntegrationUnavailableException);
      expect(err!.message).toContain(
        'EMAIL_POSTAL_ADDRESS, PUBLIC_API_URL, EMAIL_FROM',
      );
    });
  });
});
