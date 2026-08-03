import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export type EmailSendResult = {
  sent: boolean;
  devMode: boolean;
  reason?: string;
};

// Zoho Mail over SMTP. Dev mode (no credentials) logs instead of sending, so
// local work never emails a real person by accident — same seam as SMS.
@Injectable()
export class ZohoEmailProvider {
  private readonly logger = new Logger(ZohoEmailProvider.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): Transporter | null {
    const user = this.config.get<string>('ZOHO_SMTP_USER');
    const pass = this.config.get<string>('ZOHO_SMTP_PASSWORD');
    if (!user || !pass) return null;

    if (!this.transporter) {
      const port = Number(this.config.get('ZOHO_SMTP_PORT') ?? 465);

      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('ZOHO_SMTP_HOST') || 'smtp.zoho.com',
        port,
        // 465 is implicit SSL. 587 starts plain and upgrades via STARTTLS,
        // which nodemailer negotiates itself when secure is false.
        secure: port === 465,
        auth: { user, pass },
      });
    }

    return this.transporter;
  }

  async send(args: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<EmailSendResult> {
    const transporter = this.getTransporter();

    if (!transporter) {
      this.logger.warn(`[DEV EMAIL] to ${args.to} — ${args.subject}\n${args.text}`);
      return { sent: true, devMode: true };
    }

    const from =
      this.config.get<string>('ZOHO_FROM_ADDRESS') || 'Surewina <no-reply@surewina.com>';

    try {
      await transporter.sendMail({
        from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
      });
      this.logger.log(`Email sent to ${args.to}: ${args.subject}`);
      return { sent: true, devMode: false };
    } catch (error) {
      this.logger.error(
        `Email send failed to ${args.to}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { sent: false, devMode: false, reason: 'SMTP_ERROR' };
    }
  }
}