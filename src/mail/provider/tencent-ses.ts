import { websiteConfig } from '@/config/website';
import { getTemplate } from '@/mail';
import type {
  MailProvider,
  SendEmailResult,
  SendRawEmailParams,
  SendTemplateParams,
} from '@/mail/types';
import { ses } from 'tencentcloud-sdk-nodejs';

/**
 * Tencent Cloud SES API provider.
 *
 * This uses Tencent Cloud's signed API instead of a mailbox SMTP password, so
 * the production application needs only a narrowly scoped CAM credential.
 */
export class TencentSESProvider implements MailProvider {
  private client: InstanceType<typeof ses.v20201002.Client>;
  private from: string;

  constructor() {
    const secretId = process.env.TENCENT_SES_SECRET_ID;
    const secretKey = process.env.TENCENT_SES_SECRET_KEY;

    if (!secretId || !secretKey) {
      throw new Error(
        'Tencent SES configuration is incomplete. Set TENCENT_SES_SECRET_ID and TENCENT_SES_SECRET_KEY.'
      );
    }

    if (!websiteConfig.mail.fromEmail) {
      throw new Error(
        'Default from email address is not set in websiteConfig.'
      );
    }

    this.from = websiteConfig.mail.fromEmail;
    this.client = new ses.v20201002.Client({
      credential: { secretId, secretKey },
      region: process.env.TENCENT_SES_REGION || 'ap-hongkong',
    });
  }

  public getProviderName(): string {
    return 'tencent-ses';
  }

  public async sendTemplate(
    params: SendTemplateParams
  ): Promise<SendEmailResult> {
    const { to, template, context, locale } = params;

    try {
      const mailTemplate = await getTemplate({ template, context, locale });
      return this.sendRawEmail({
        to,
        subject: mailTemplate.subject,
        html: mailTemplate.html,
        text: mailTemplate.text,
      });
    } catch (error) {
      console.error('Error sending Tencent SES template email:', error);
      return { success: false, error };
    }
  }

  public async sendRawEmail(
    params: SendRawEmailParams
  ): Promise<SendEmailResult> {
    const { to, subject, html, text } = params;

    if (!this.from || !to || !subject || !html) {
      return { success: false, error: 'Missing required fields' };
    }

    try {
      const response = await this.client.SendEmail({
        FromEmailAddress: this.from,
        Destination: [to],
        Subject: subject,
        Simple: {
          Html: Buffer.from(html, 'utf8').toString('base64'),
          Text: Buffer.from(text || '', 'utf8').toString('base64'),
        },
        TriggerType: 1,
      });

      return { success: true, messageId: response.MessageId };
    } catch (error) {
      console.error('Error sending Tencent SES email:', error);
      return { success: false, error };
    }
  }
}
