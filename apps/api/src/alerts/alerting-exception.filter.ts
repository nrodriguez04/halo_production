import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  HttpServer,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ZodError } from 'zod';
import { OpsAlertService } from './ops-alert.service';

/**
 * Nest's default error handling, plus two things:
 *
 * - A request body that fails a zod schema (controllers call
 *   `Schema.parse(body)`) is a 400 with the field issues. It used to fall
 *   through as an unknown error and come back as a 500.
 * - An error nobody meant to throw raises an operational alert. Deliberate
 *   HTTP errors (4xx, and the typed 503s for unavailable providers) are
 *   normal operation and are not alerted; a bare Error, or an
 *   HttpException with status 500, is.
 *
 * Everything else gets exactly the response Nest would have sent.
 */
@Catch()
export class AlertingExceptionFilter extends BaseExceptionFilter {
  constructor(
    applicationRef: HttpServer,
    private readonly alerts: OpsAlertService,
  ) {
    super(applicationRef);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (isZodError(exception)) {
      super.catch(validationError(exception), host);
      return;
    }
    if (shouldAlert(exception)) {
      const req =
        host.getType() === 'http'
          ? host.switchToHttp().getRequest<{
              method?: string;
              route?: { path?: string };
              url?: string;
            }>()
          : null;
      const route = req
        ? `${req.method ?? ''} ${req.route?.path ?? (req.url ?? '').split('?')[0]}`.trim()
        : host.getType();
      const err = exception as Error;
      const message = (err?.message ?? String(exception)).slice(0, 300);
      void this.alerts.send({
        title: `Unhandled error on ${route}`,
        severity: 'critical',
        fingerprint: `api:${route}:${err?.name}:${message.slice(0, 120)}`,
        lines: [
          `${err?.name ?? 'Error'}: ${message}`,
          ...(err?.stack ? [err.stack.split('\n').slice(1, 4).join('\n')] : []),
        ],
      });
    }
    super.catch(exception, host);
  }
}

export function validationError(err: ZodError): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: err.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; '),
    issues: err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  });
}

/**
 * `instanceof` fails when a schema came from another copy of zod (the shared
 * package can resolve its own), so the shape is checked too.
 */
export function isZodError(exception: unknown): exception is ZodError {
  if (exception instanceof ZodError) return true;
  const e = exception as { name?: unknown; issues?: unknown } | null;
  return !!e && e.name === 'ZodError' && Array.isArray(e.issues);
}

export function shouldAlert(exception: unknown): boolean {
  if (isZodError(exception)) return false;
  if (exception instanceof HttpException) {
    return exception.getStatus() === 500;
  }
  return true;
}
