
import { Resend } from 'resend';
// Initialize Resend with your environment variable
const resend = new Resend(process.env.RESEND_API_KEY);


interface AlertPayload {
  title: string;
  message: string;
  customerId: string;
  subscriptionId: string;
  error?: string; // Marked as optional (?) so you don't always have to provide it
}



export async function sendEmergencyAdminAlert({ 
  title, 
  message, 
  customerId, 
  subscriptionId, 
  error 
}: AlertPayload) {
  const timestamp = new Date().toLocaleString(); // Human readable format for email
  
  // 1. Fallback local logging (Always good to have a paper trail in server logs)
  console.error(`[Emergency Alert System] Triggered: ${title}`);

  // 2. Dispatch the Email via Resend
  try {
    await resend.emails.send({
      // ⚠️ Note: 'from' must use a domain you have verified inside your Resend dashboard
      from: 'Billing Alerts <system@yourverifieddomain.com>', 
      to: ['your-personal-email@domain.com', 'admin-team@domain.com'], 
      subject: `🚨 [CRITICAL BILLING] ${title}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-top: 4px solid #dc2626; border-radius: 8px; padding: 24px; background-color: #fff;">
          <h2 style="color: #991b1b; margin-top: 0; font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
            ⚠️ ${title}
          </h2>
          
          <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
            An identity mapping exception occurred during the live Stripe webhook lifecycle processing loop. Action may be required to manually tie this checkout to its internal database profile.
          </p>
          
          <div style="background-color: #fef2f2; border: 1px solid #fca5a5; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #991b1b;">Issue Breakdown:</p>
            <p style="margin: 0; font-size: 14px; color: #7f1d1d; font-family: monospace; white-space: pre-wrap;">${message}</p>
            ${error ? `<p style="margin: 8px 0 0 0; font-size: 12px; color: #b91c1c;"><strong>Raw Stack:</strong> <code>${error}</code></p>` : ''}
          </div>

          <h3 style="font-size: 14px; color: #1f2937; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">Context Identifiers</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; width: 140px;"><strong>Timestamp:</strong></td>
              <td style="padding: 6px 0; color: #1f2937;">${timestamp}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;"><strong>Stripe Customer:</strong></td>
              <td style="padding: 6px 0; color: #1f2937;"><code style="background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${customerId}</code></td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;"><strong>Stripe Subscription:</strong></td>
              <td style="padding: 6px 0; color: #1f2937;"><code style="background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${subscriptionId}</code></td>
            </tr>
          </table>

          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0 16px 0;" />
          <p style="font-size: 11px; color: #9ca3af; text-align: center; margin: 0;">
            Sent automatically by your Next.js Webhook Router Router Core. 
            Stripe will automatically retry this event context over the next few days.
          </p>
        </div>
      `,
    });

    console.log('[Resend] Emergency notification dispatched cleanly.');
  } catch (emailError) {
    // Catch-all to make sure an email failure doesn't crash the webhook handler
    console.error('[Resend Error] Failed to send emergency email notification:', emailError);
  }
}