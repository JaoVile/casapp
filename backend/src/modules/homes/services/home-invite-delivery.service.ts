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
export class HomeInviteDeliveryService {
  private transporter: MailTransporter | null = null;
  private transporterInitialized = false;

  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly sentry: SentryService,
  ) {}

  async sendInvite(input: {
    invitedEmail: string;
    inviterName: string;
    homeName: string;
    inviteLink: string;
  }) {
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn({
        event: 'home_invite_delivery_unconfigured',
        invitedEmail: input.invitedEmail,
      });
      return { channel: 'email', delivered: false };
    }

    const from = process.env.SMTP_FROM?.trim() || 'CasApp <no-reply@casapp.local>';
    const subject = `CasApp - convite para entrar em ${input.homeName}`;
    const text = [
      `${input.inviterName} convidou voce para entrar na casa "${input.homeName}" no CasApp.`,
      `Use este link para se cadastrar e entrar automaticamente: ${input.inviteLink}`,
    ].join('\n');
    const html = `
      <p><strong>${input.inviterName}</strong> convidou voce para entrar na casa <strong>${input.homeName}</strong> no CasApp.</p>
      <p><a href="${input.inviteLink}">Clique aqui para aceitar o convite</a></p>
    `;

    try {
      await transporter.sendMail({
        from,
        to: input.invitedEmail,
        subject,
        text,
        html,
      });
      this.logger.info({
        event: 'home_invite_email_sent',
        invitedEmail: input.invitedEmail,
      });
      return { channel: 'email', delivered: true };
    } catch (error) {
      const err = error as Error;
      this.sentry.captureException(error, {
        source: 'home_invite_delivery',
        invitedEmail: input.invitedEmail,
      });
      this.logger.error({
        event: 'home_invite_email_failed',
        invitedEmail: input.invitedEmail,
        errorName: err.name,
        errorMessage: err.message,
        errorStack: err.stack ?? null,
      });
      return { channel: 'email', delivered: false };
    }
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
        event: 'home_invite_mailer_dependency_missing',
        message: 'Instale nodemailer para habilitar envio de convite por email.',
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
