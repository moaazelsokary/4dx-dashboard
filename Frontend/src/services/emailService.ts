/**
 * Email service client
 * Handles email notifications from the frontend
 */

import { logError, logInfo } from './logger';
import { getApiBaseUrl } from '@/config/environment';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  data?: Record<string, unknown>;
  html?: string;
  text?: string;
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send email notification
 */
export const sendEmail = async (options: EmailOptions): Promise<EmailResponse> => {
  try {
    const apiUrl = `${getApiBaseUrl()}/email-api`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send email' }));
      return { success: false, error: error.error || 'Failed to send email' };
    }

    const data = await response.json();
    
    if (data.success) {
      logInfo('Email sent successfully', { to: options.to, subject: options.subject });
      return {
        success: true,
        messageId: data.messageId,
      };
    }

    return { success: false, error: data.error || 'Failed to send email' };
  } catch (error) {
    logError('Email send error', error as Error, { to: options.to });
    return { success: false, error: 'Network error. Please try again.' };
  }
};

/**
 * Send notification email
 */
export const sendNotificationEmail = async (
  to: string | string[],
  subject: string,
  message: string
): Promise<EmailResponse> => {
  return sendEmail({
    to,
    subject,
    template: 'notification',
    data: { message },
  });
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (
  to: string,
  resetToken: string,
  resetUrl: string
): Promise<EmailResponse> => {
  return sendEmail({
    to,
    subject: 'Password Reset Request',
    template: 'password-reset',
    data: { resetToken, resetUrl },
  });
};

