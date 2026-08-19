import { websiteConfig } from '@/config/website';
import { getTemplate } from '@/mail';
import type {
  MailProvider,
  SendEmailResult,
  SendRawEmailParams,
  SendTemplateParams,
} from '@/mail/types';
import { ses } from 'tencentcloud-sdk-nodejs';
import { getTencentSesTemplateUrlValue } from './tencent-ses-url';

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
      if (template !== 'forgotPassword' && template !== 'verifyEmail') {
        return {
          success: false,
          error: `Tencent SES template is not configured for ${template}.`,
        };
      }

      const mailTemplate = await getTemplate({ template, context, locale });
      const templateId = this.getTencentTemplateId(template);

      if (!templateId) {
        return {
          success: false,
          error: `Tencent SES template is not configured for ${template}.`,
        };
      }

      const response = await this.client.SendEmail({
        FromEmailAddress: this.from,
        Destination: [to],
        Subject: mailTemplate.subject,
        Template: {
          TemplateID: templateId,
          // Tencent SES templates accept a JSON object whose keys correspond
          // to variables in the reviewed template. The template pins
          // `https://www.dlgzz.com/`, so only a relative path is transmitted.
          TemplateData: JSON.stringify({
            url: getTencentSesTemplateUrlValue(context.url, template),
          }),
        },
        TriggerType: 1,
      });

      return { success: true, messageId: response.MessageId };
    } catch (error) {
      console.error('Error sending Tencent SES template email:', error);
      return { success: false, error };
    }
  }

  public async sendRawEmail(
    params: SendRawEmailParams
  ): Promise<SendEmailResult> {
    void params;
    // Tencent SES default accounts reject the legacy `Simple` payload. Keep
    // this failure explicit so new transactional messages are added as
    // reviewed SES templates instead of failing remotely and ambiguously.
    return {
      success: false,
      error:
        'Tencent SES requires a reviewed template. Configure a template before sending this message type.',
    };
  }

  private getTencentTemplateId(template: SendTemplateParams['template']) {
    const value =
      template === 'forgotPassword'
        ? process.env.TENCENT_SES_RESET_PASSWORD_TEMPLATE_ID
        : template === 'verifyEmail'
          ? process.env.TENCENT_SES_VERIFY_EMAIL_TEMPLATE_ID
          : undefined;

    if (!value) {
      return undefined;
    }

    const templateId = Number(value);
    if (!Number.isSafeInteger(templateId) || templateId <= 0) {
      throw new Error(`Invalid Tencent SES template ID for ${template}.`);
    }

    return templateId;
  }
}
