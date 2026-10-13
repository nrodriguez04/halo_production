import { Injectable, Logger } from '@nestjs/common';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface OpsAlert {
  title: string;
  lines?: string[];
  severity?: AlertSeverity;
  /** Same fingerprint within the quiet window sends once. */
  fingerprint?: string;
}

const QUIET_WINDOW_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 5000;
const MAX_TEXT = 3500;

/**
 * Operational alerts to one webhook: Slack and Discord incoming webhooks,
 * Teams, ntfy, or anything that accepts a JSON post (`text` for Slack and
 * Teams, `content` for Discord, both are sent). Configured with
 * ALERT_WEBHOOK_URL; without it, alerts are logged only. Never throws:
 * an alert that cannot be delivered must not break the request or job
 * that raised it. Repeats of the same fingerprint are suppressed for 15
 * minutes and counted into the next delivery.
 */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);
  private lastSent = new Map<string, number>();
  private suppressed = new Map<string, number>();
  private warnedUnconfigured = false;

  configured(): boolean {
    return !!process.env.ALERT_WEBHOOK_URL?.trim();
  }

  /** True when delivered (or accepted by the webhook), false otherwise. */
  async send(alert: OpsAlert, now = Date.now()): Promise<boolean> {
    const key = alert.fingerprint ?? alert.title;
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < QUIET_WINDOW_MS) {
      this.suppressed.set(key, (this.suppressed.get(key) ?? 0) + 1);
      return false;
    }
    this.lastSent.set(key, now);
    const repeats = this.suppressed.get(key) ?? 0;
    this.suppressed.delete(key);

    const text = formatAlert(alert, repeats);
    const url = process.env.ALERT_WEBHOOK_URL?.trim();
    if (!url) {
      if (!this.warnedUnconfigured) {
        this.logger.warn(
          'ALERT_WEBHOOK_URL is not set; operational alerts are logged only',
        );
        this.warnedUnconfigured = true;
      }
      this.logger.warn(text);
      return false;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(
          `Alert webhook answered ${res.status}: ${alert.title}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `Alert webhook unreachable (${(err as Error).message}): ${alert.title}`,
      );
      return false;
    }
  }
}

export function environmentLabel(env: NodeJS.ProcessEnv = process.env): string {
  const api = env.PUBLIC_API_URL?.trim();
  if (api) {
    try {
      return new URL(api).host;
    } catch {
      /* fall through */
    }
  }
  return env.NODE_ENV || 'development';
}

export function formatAlert(alert: OpsAlert, repeats = 0): string {
  const icon =
    alert.severity === 'critical'
      ? '[CRITICAL]'
      : alert.severity === 'info'
        ? '[info]'
        : '[warning]';
  const lines = [
    `${icon} Halo (${environmentLabel()}): ${alert.title}`,
    ...(alert.lines ?? []),
    ...(repeats > 0
      ? [`(${repeats} similar alert(s) suppressed in the last 15 minutes)`]
      : []),
  ];
  const text = lines.join('\n');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}
