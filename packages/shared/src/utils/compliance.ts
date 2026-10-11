// Compliance utilities

export interface QuietHoursConfig {
  startHour: number; // 0-23
  endHour: number; // 0-23
  timezone: string;
  enabled: boolean;
}

export interface ConsentCheck {
  hasConsent: boolean;
  consentId?: string;
  grantedAt?: Date;
  expiresAt?: Date;
}

export interface DNCCheck {
  isDNC: boolean;
  dncId?: string;
  source?: string;
  expiresAt?: Date;
}

/**
 * Check if current time is within quiet hours
 */
export function isWithinQuietHours(
  config: QuietHoursConfig,
  currentTime: Date = new Date()
): boolean {
  if (!config.enabled) {
    return false;
  }

  // Convert to timezone-aware time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    hour: 'numeric',
    hour12: false,
  });

  const hour = parseInt(formatter.format(currentTime), 10);

  // Handle overnight quiet hours (e.g., 20:00 - 09:00)
  if (config.startHour > config.endHour) {
    return hour >= config.startHour || hour < config.endHour;
  }

  // Normal quiet hours (e.g., 22:00 - 08:00)
  return hour >= config.startHour && hour < config.endHour;
}

/**
 * Validate phone number format (basic)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // US phone numbers should be 10 digits (or 11 with country code)
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return phone; // Return as-is if can't normalize
}

/**
 * Standard SMS opt-out keywords: the CTIA set (STOP, STOPALL, UNSUBSCRIBE,
 * CANCEL, END, QUIT) plus REVOKE and OPTOUT, which carriers and Twilio's
 * opt-out handling also honour. The previous substring check missed END,
 * QUIT and REVOKE entirely, and treated "I can't stop by today" as an
 * opt-out.
 */
export const OPT_OUT_KEYWORDS = [
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'REVOKE',
  'OPTOUT',
] as const;

export const HELP_KEYWORDS = ['HELP', 'INFO'] as const;

/**
 * The token keyword matching compares: Unicode-normalised, upper-cased,
 * surrounding punctuation and whitespace dropped, and inner spaces or
 * hyphens removed so "Opt out" and "OPT-OUT" both read as OPTOUT. Any other
 * word in the body produces a different token, so matching stays exact.
 */
export function normalizeKeyword(body: string | null | undefined): string {
  if (!body) return '';
  return body
    .normalize('NFKC')
    .toUpperCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/[\s_-]+/g, '');
}

/** Exact, case-insensitive match of the whole body against OPT_OUT_KEYWORDS. */
export function isOptOutKeyword(body: string | null | undefined): boolean {
  return (OPT_OUT_KEYWORDS as readonly string[]).includes(normalizeKeyword(body));
}

/** Exact, case-insensitive match of the whole body against HELP_KEYWORDS. */
export function isHelpKeyword(body: string | null | undefined): boolean {
  return (HELP_KEYWORDS as readonly string[]).includes(normalizeKeyword(body));
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
