const logger = require('./utils/logger');
const rateLimiter = require('./utils/rate-limiter');
const csrfMiddleware = require('./utils/csrf-middleware');

// Email service configuration
// Supports SendGrid, AWS SES, or Nodemailer
// Default to 'none' to avoid requiring packages if email is not configured
const EMAIL_SERVICE = process.env.EMAIL_SERVICE || 'none'; // 'sendgrid', 'ses', 'nodemailer', 'none'
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@lifemakers.org';

// Apply rate limiting
const handler = rateLimiter('general')(csrfMiddleware(async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const { to, subject, template, data, html, text } = JSON.parse(event.body || '{}');

    if (!to || !subject) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'To and subject are required' }),
      };
    }

    // Generate email content from template or use provided HTML/text
    const emailContent = await generateEmailContent(template, data, html, text);

    // Send email based on configured service
    // If no email service is configured or service is 'none', return success without sending
    if (!EMAIL_SERVICE || EMAIL_SERVICE.toLowerCase() === 'none') {
      logger.warn('Email service not configured', { to, subject });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          messageId: 'no-service-configured',
          message: 'Email service not configured. Email was not sent.',
        }),
      };
    }

    let result;
    try {
      switch (EMAIL_SERVICE.toLowerCase()) {
        case 'sendgrid':
          result = await sendViaSendGrid(to, subject, emailContent.html, emailContent.text);
          break;
        case 'ses':
          result = await sendViaSES(to, subject, emailContent.html, emailContent.text);
          break;
        case 'nodemailer':
          result = await sendViaNodemailer(to, subject, emailContent.html, emailContent.text);
          break;
        default:
          logger.warn('Unsupported email service', { service: EMAIL_SERVICE });
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: `Unsupported email service: ${EMAIL_SERVICE}. Supported: sendgrid, ses, nodemailer, or none`,
            }),
          };
      }
    } catch (serviceError) {
      // If the service package is not installed, return a helpful error
      if (serviceError.code === 'MODULE_NOT_FOUND' || serviceError.message.includes('Cannot find module')) {
        logger.error('Email service package not installed', serviceError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            error: `Email service package not installed. ${serviceError.message}. Set EMAIL_SERVICE=none to disable email functionality.`,
          }),
        };
      }
      throw serviceError;
    }

    logger.info('Email sent successfully', { to, subject });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        messageId: result.messageId,
      }),
    };
  } catch (error) {
    logger.error('Email send error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to send email',
      }),
    };
  }
}));

// Generate email content from template
async function generateEmailContent(template, data, html, text) {
  // If HTML/text provided directly, use it
  if (html || text) {
    return { html, text };
  }

  // Load template based on template name
  // In production, load from file system or template service
  const templates = {
    'notification': {
      html: `<html><body><h2>Notification</h2><p>${data?.message || ''}</p></body></html>`,
      text: data?.message || '',
    },
    'password-reset': {
      html: `<html><body><h2>Password Reset</h2><p>Click the link below to reset your password:</p><a href="${data?.resetUrl || ''}">Reset Password</a></body></html>`,
      text: `Password Reset: ${data?.resetUrl || ''}`,
    },
  };

  const templateContent = templates[template] || templates['notification'];
  return {
    html: templateContent.html,
    text: templateContent.text,
  };
}

// Send via SendGrid
async function sendViaSendGrid(to, subject, html, text) {
  let sgMail;
  try {
    sgMail = require('@sendgrid/mail');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error('@sendgrid/mail package is required for SendGrid. Install it: npm install @sendgrid/mail');
    }
    throw error;
  }
  
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY not configured');
  }

  sgMail.setApiKey(apiKey);

  const msg = {
    to: Array.isArray(to) ? to : [to],
    from: EMAIL_FROM,
    subject,
    text,
    html,
  };

  const result = await sgMail.send(msg);
  return { messageId: result[0]?.headers['x-message-id'] };
}

// Send via AWS SES
async function sendViaSES(to, subject, html, text) {
  let AWS;
  try {
    AWS = require('aws-sdk');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error('aws-sdk package is required for AWS SES. Install it: npm install aws-sdk');
    }
    throw error;
  }
  
  const ses = new AWS.SES({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const params = {
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to],
    },
    Message: {
      Body: {
        Html: { Data: html },
        Text: { Data: text },
      },
      Subject: { Data: subject },
    },
    Source: EMAIL_FROM,
  };

  const result = await ses.sendEmail(params).promise();
  return { messageId: result.MessageId };
}

// Send via Nodemailer (SMTP)
async function sendViaNodemailer(to, subject, html, text) {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error('nodemailer package is required for SMTP. Install it: npm install nodemailer');
    }
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const result = await transporter.sendMail({
    from: EMAIL_FROM,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    text,
    html,
  });

  return { messageId: result.messageId };
}

exports.handler = handler;

