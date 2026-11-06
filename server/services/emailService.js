const nodemailer = require('nodemailer');

let transporter = null;

// Initialize or get Nodemailer Transporter
const getTransporter = async () => {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    // Generate test Ethereal SMTP account if no custom SMTP provided
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`[EmailService] Created local test email account: ${testAccount.user}`);
    } catch (err) {
      console.warn('[EmailService] Could not connect to Ethereal, falling back to mock logger:', err.message);
      transporter = {
        sendMail: async (options) => {
          console.log('[EmailService Mock Send]', options);
          return { messageId: 'mock-' + Date.now() };
        }
      };
    }
  }
  return transporter;
};

/**
 * Generate standard MetricsEdu Branded HTML Email Template
 */
const generateBrandedTemplate = ({ recipientName, title, contentHtml }) => {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #040d1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #040d1a; padding: 40px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #071b34; border: 1px solid #133966; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <!-- Header with Brand & Logo -->
            <tr>
              <td align="center" style="padding: 35px 20px 25px 20px; background: linear-gradient(135deg, #071b34 0%, #0d2847 100%); border-bottom: 2px solid #00a896;">
                <div style="display: inline-block; margin-bottom: 12px;">
                  <div style="font-size: 32px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">
                    <span style="color: #38bdf8;">Metrics</span><span style="color: #00a896;">Edu</span>
                  </div>
                </div>
                <div style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; color: #94a3b8; text-transform: uppercase;">
                  One Connected Platform. One Smart Classroom.
                </div>
              </td>
            </tr>

            <!-- Body Content -->
            <tr>
              <td style="padding: 35px 30px 30px 30px;">
                <p style="margin: 0 0 16px 0; font-size: 16px; color: #cbd5e1;">
                  Hello ${recipientName || 'Valued User'},
                </p>
                ${contentHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 24px 30px; background-color: #030a14; border-top: 1px solid #133966; text-align: center;">
                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;">
                  This is an automated security notification from MetricsEdu.
                </p>
                <p style="margin: 0; font-size: 12px; color: #475569;">
                  &copy; ${new Date().getFullYear()} MetricsEdu Inc. All rights reserved. &bull; Belagavi, Karnataka
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};

/**
 * Send Password Reset OTP Email
 */
exports.sendPasswordResetOTP = async ({ toEmail, recipientName, otp, isParent = false, studentName = '' }) => {
  try {
    const client = await getTransporter();

    const title = 'MetricsEdu - Password Reset Verification Code';
    const contentHtml = `
      <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
        ${isParent 
          ? `You are receiving this verification code on behalf of student <strong style="color: #38bdf8;">${studentName}</strong> to reset the MetricsEdu account password.` 
          : `We received a request to reset your MetricsEdu account password. Use the verification code below to complete the process:`}
      </p>

      <div style="margin: 30px 0; text-align: center;">
        <div style="display: inline-block; padding: 18px 36px; background-color: #040d1a; border: 2px solid #00a896; border-radius: 12px; box-shadow: 0 0 20px rgba(0, 168, 150, 0.25);">
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #38bdf8;">
            ${otp}
          </span>
        </div>
      </div>

      <p style="margin: 0 0 10px 0; font-size: 14px; color: #94a3b8; text-align: center;">
        This code is valid for <strong>15 minutes</strong>.
      </p>

      <div style="margin-top: 25px; padding: 14px 18px; background-color: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; border-radius: 6px;">
        <p style="margin: 0; font-size: 13px; color: #fca5a5; line-height: 1.5;">
          <strong>Security Notice:</strong> Never share this OTP with anyone. MetricsEdu support staff will never ask for your password or verification codes. If you did not initiate this request, you can safely ignore this email.
        </p>
      </div>
    `;

    const html = generateBrandedTemplate({ recipientName, title, contentHtml });

    const mailOptions = {
      from: `"MetricsEdu Smart Classroom" <noreply@metricsedu.ac.in>`,
      to: toEmail,
      subject: `[${otp}] Your MetricsEdu Verification Code`,
      html
    };

    const info = await client.sendMail(mailOptions);
    console.log(`[EmailService] OTP sent successfully to ${toEmail} | Message ID: ${info.messageId}`);
    
    // If using ethereal test account, log URL where email can be viewed
    if (nodemailer.getTestMessageUrl && info) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[EmailService] Preview URL: ${previewUrl}`);
      }
    }

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[EmailService] Error sending OTP email:', err);
    return { success: false, error: err.message };
  }
};
