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
 * Check if message content contains STOP/HELP keywords
 */
export function containsStopKeywords(content: string): boolean {
  const stopKeywords = ['stop', 'unsubscribe', 'opt out', 'optout', 'cancel'];
  const lowerContent = content.toLowerCase();
  return stopKeywords.some((keyword) => lowerContent.includes(keyword));
}

export function containsHelpKeywords(content: string): boolean {
  const helpKeywords = ['help', 'info', 'information'];
  const lowerContent = content.toLowerCase();
  return helpKeywords.some((keyword) => lowerContent.includes(keyword));
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
