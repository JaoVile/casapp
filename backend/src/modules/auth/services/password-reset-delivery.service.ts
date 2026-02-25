import { Injectable } from '@nestjs/common';
import { StructuredLoggerService } from '../../../shared/services/structured-logger.service';
import { SentryService } from '../../../shared/services/sentry.service';

type MailTransporter = {
  sendMail: (options: Record<string, unknown>) => Promise<unknown>;
};

type NodemailerModule = {
  createTransport: (options: Record<string, unknown>) => MailTransporter;
};

@Injectable()
export class PasswordResetDeliveryService {
  private transporter: MailTransporter | null = null;
  private transporterInitialized = false;

  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly sentry: SentryService,
  ) {}

  async sendResetInstructions(input: {
    userId: string;
    email?: string | null;
    token: string;
    expiresAt: Date;
  }) {
    const resetUrl = this.buildResetUrl(input.token);
    const targetEmail = input.email?.trim().toLowerCase() ?? null;

    if (!targetEmail) {
      this.logger.warn({
        event: 'password_reset_no_email_channel',
        userId: input.userId,
      });
      return { channel: 'none', delivered: false };
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn({
        event: 'password_reset_delivery_unconfigured',
        userId: input.userId,
      });

      if (process.env.NODE_ENV !== 'production') {
        this.logger.info({
          event: 'password_reset_dev_link',
          userId: input.userId,
          email: targetEmail,
          resetUrl,
          expiresAt: input.expiresAt.toISOString(),
        });
      }

      return { channel: 'email', delivered: false };
    }

    const from = process.env.SMTP_FROM?.trim() || 'CasApp <no-reply@casapp.local>';
    const subject = 'CasApp - redefinicao de senha';
    const expiresAtLabel = input.expiresAt.toISOString();

    const text = [
      'Recebemos um pedido para redefinir sua senha no CasApp.',
      `Use este link para continuar: ${resetUrl}`,
      `Expira em: ${expiresAtLabel}`,
      'Se voce nao fez esse pedido, ignore este email.',
    ].join('\n');

    const html = `
      <p>Recebemos um pedido para redefinir sua senha no <strong>CasApp</strong>.</p>
      <p><a href="${resetUrl}">Clique aqui para redefinir sua senha</a></p>
      <p>Expira em: <strong>${expiresAtLabel}</strong></p>
      <p>Se voce nao fez esse pedido, ignore este email.</p>
    `;

    try {
      await transporter.sendMail({
        from,
        to: targetEmail,
        subject,
        text,
        html,
      });

      this.logger.info({
        event: 'password_reset_email_sent',
        userId: input.userId,
      });
      return { channel: 'email', delivered: true };
    } catch (error) {
      const err = error as Error;
      this.sentry.captureException(error, {
        source: 'password_reset_delivery',
        userId: input.userId,
      });
      this.logger.error({
        event: 'password_reset_email_failed',
        userId: input.userId,
        errorName: err.name,
        errorMessage: err.message,
        errorStack: err.stack ?? null,
      });
      return { channel: 'email', delivered: false };
    }
  }

  private buildResetUrl(token: string) {
    const baseUrl =
      process.env.AUTH_RESET_URL_BASE?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      'http://localhost:5173';
    return `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private getTransporter() {
    if (this.transporterInitialized) {
      return this.transporter;
    }

    this.transporterInitialized = true;
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      return null;
    }

    const nodemailer = this.loadNodemailer();
    if (!nodemailer) {
      return null;
    }

    const port = this.parsePort(process.env.SMTP_PORT, 587);
    const secure = (process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASSWORD?.trim();
    const tlsRejectUnauthorized =
      (process.env.SMTP_TLS_REJECT_UNAUTHORIZED || '').trim().toLowerCase() !== 'false';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && pass
        ? {
            auth: {
              user,
              pass,
            },
          }
        : {}),
      tls: {
        rejectUnauthorized: tlsRejectUnauthorized,
      },
    });

    return this.transporter;
  }

  private loadNodemailer(): NodemailerModule | null {
    try {
      const dynamicRequire = eval('require') as NodeJS.Require;
      return dynamicRequire('nodemailer') as NodemailerModule;
    } catch {
      this.logger.warn({
        event: 'password_reset_mailer_dependency_missing',
        message: 'Instale nodemailer para habilitar envio de email.',
      });
      return null;
    }
  }

  private parsePort(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }
}
