import { websiteConfig } from '@/config/website';
import { getTemplate } from '@/mail';
import type {
  MailProvider,
  SendEmailResult,
  SendRawEmailParams,
  SendTemplateParams,
} from '@/mail/types';
import * as nodemailer from 'nodemailer';

/**
 * SMTP mail provider implementation
 *
 * docs:
 * https://mksaas.com/docs/email
 */
export class SMTPProvider implements MailProvider {
  private transporter: nodemailer.Transporter;
  private from: string;

  /**
   * Initialize SMTP provider with configuration
   */
  constructor() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const smtpFrom = process.env.SMTP_FROM;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      throw new Error(
        'SMTP configuration is incomplete. Please check your environment variables.'
      );
    }

    if (!smtpFrom && !websiteConfig.mail.fromEmail) {
      throw new Error(
        'SMTP_FROM or websiteConfig.mail.fromEmail must be set.'
      );
    }

    this.from = smtpFrom || websiteConfig.mail.fromEmail;

    // Create SMTP transporter
    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: parseInt(smtpPort) === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });
  }

  /**
   * Get the provider name
   * @returns Provider name
   */
  public getProviderName(): string {
    return 'smtp';
  }

  /**
   * Send an email using a template
   * @param params Parameters for sending a templated email
   * @returns Send result
   */
  public async sendTemplate(
    params: SendTemplateParams
  ): Promise<SendEmailResult> {
    const { to, template, context, locale } = params;

    try {
      // Get rendered template
      const mailTemplate = await getTemplate({
        template,
        context,
        locale,
      });

      // Send using raw email
      return this.sendRawEmail({
        to,
        subject: mailTemplate.subject,
        html: mailTemplate.html,
        text: mailTemplate.text,
      });
    } catch (error) {
      console.error('Error sending template email:', error);
      return {
        success: false,
        error,
      };
    }
  }

  /**
   * Send a raw email
   * @param params Parameters for sending a raw email
   * @returns Send result
   */
  public async sendRawEmail(
    params: SendRawEmailParams
  ): Promise<SendEmailResult> {
    const { to, subject, html, text } = params;

    if (!this.from || !to || !subject || !html) {
      console.warn('Missing required fields for email send', {
        from: this.from,
        to,
        subject,
        html,
      });
      return {
        success: false,
        error: 'Missing required fields',
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
        text,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Error sending email:', error);
      return {
        success: false,
        error,
      };
    }
  }
}
