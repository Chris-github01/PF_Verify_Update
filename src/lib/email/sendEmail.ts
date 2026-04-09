import { resend } from './resendClient';

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, html } = params;

  try {
    const { data, error } = await resend.emails.send({
      from: 'VerifyTrade <noreply@mail.verifytrade.co.nz>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });

    if (error) {
      console.error('[sendEmail] Resend API error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sendEmail] Unexpected error:', message);
    return { success: false, error: message };
  }
}
