import { Injectable } from '@nestjs/common';
import { StructuredLoggerService } from './structured-logger.service';

type SentryNode = {
  init: (options: Record<string, unknown>) => void;
  withScope: (callback: (scope: any) => void) => void;
  captureException: (exception: unknown) => void;
  captureMessage: (message: string, level?: string) => void;
};

@Injectable()
export class SentryService {
  private sentry: SentryNode | null = null;

  constructor(private readonly logger: StructuredLoggerService) {
    this.initialize();
  }

  captureException(exception: unknown, context: Record<string, unknown> = {}) {
    if (!this.sentry) return;

    this.sentry.withScope((scope) => {
      scope.setTag?.('service', 'backend');
      for (const [key, value] of Object.entries(context)) {
        scope.setContext?.(key, typeof value === 'object' ? (value as object) : { value });
      }
      this.sentry?.captureException(exception);
    });
  }

  captureMessage(message: string, context: Record<string, unknown> = {}) {
    if (!this.sentry) return;

    this.sentry.withScope((scope) => {
      scope.setTag?.('service', 'backend');
      for (const [key, value] of Object.entries(context)) {
        scope.setContext?.(key, typeof value === 'object' ? (value as object) : { value });
      }
      this.sentry?.captureMessage(message, 'warning');
    });
  }

  private initialize() {
    const dsn = process.env.SENTRY_DSN?.trim();
    if (!dsn) return;

    try {
      const dynamicRequire = eval('require') as NodeJS.Require;
      const sentryModule = dynamicRequire('@sentry/node') as SentryNode;
      sentryModule.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
        release: process.env.SENTRY_RELEASE || undefined,
        tracesSampleRate: this.parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0),
      });
      this.sentry = sentryModule;
      this.logger.info({
        event: 'sentry_initialized',
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      });
    } catch (error) {
      const err = error as Error;
      this.logger.warn({
        event: 'sentry_init_failed',
        message: err.message,
      });
    }
  }

  private parseSampleRate(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      return fallback;
    }
    return parsed;
  }
}

