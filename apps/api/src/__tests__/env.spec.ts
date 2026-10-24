import { presentEnv, validateEnv } from '../env';

describe('environment validation', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    // SYNTHETIC values for what the api requires.
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:5432/synthetic',
      DESCOPE_PROJECT_ID: 'P-SYNTHETIC',
      PII_ENCRYPTION_KEY_V1: '11'.repeat(32),
      PII_INDEX_KEY: '22'.repeat(32),
    });
    delete process.env.SMS_KEYWORD_REPLIES;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('treats an empty setting as unset, as docker compose passes them', () => {
    process.env.MLS_PROVIDER = '';
    process.env.PUBLIC_API_URL = '  ';
    expect(presentEnv()).not.toHaveProperty('MLS_PROVIDER');
    expect(() => validateEnv()).not.toThrow();
    expect(validateEnv().SMS_KEYWORD_REPLIES).toBe('app');
  });

  it('still refuses a value that is set and wrong', () => {
    process.env.SMS_KEYWORD_REPLIES = 'on';
    expect(() => validateEnv()).toThrow(/SMS_KEYWORD_REPLIES/);
  });
});
