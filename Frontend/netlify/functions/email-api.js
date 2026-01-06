const logger = require('./utils/logger');
const rateLimiter = require('./utils/rate-limiter');
const csrfMiddleware = require('./utils/csrf-middleware');

// Email service configuration
// Supports SendGrid, AWS SES, or Nodemailer
const EMAIL_SERVICE = process.env.EMAIL_SERVICE || 'sendgrid'; // 'sendgrid', 'ses', 'nodemailer'
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
    let result;
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
        throw new Error(`Unsupported email service: ${EMAIL_SERVICE}`);
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
  const sgMail = require('@sendgrid/mail');
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
  const AWS = require('aws-sdk');
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
  const nodemailer = require('nodemailer');

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

