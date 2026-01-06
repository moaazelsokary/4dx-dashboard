/**
 * Backend logging utility for Netlify functions
 * Provides structured logging with different severity levels
 */

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor() {
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    this.logLevel = LogLevel[envLogLevel] ?? LogLevel.INFO;
    this.enableConsole = process.env.NODE_ENV !== 'production' || process.env.ENABLE_LOGGING === 'true';
  }

  formatMessage(level, message, context, error) {
    return {
      timestamp: new Date().toISOString(),
      level: Object.keys(LogLevel).find(key => LogLevel[key] === level),
      message,
      context: context || {},
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
      environment: process.env.NODE_ENV || 'development',
      function: process.env.AWS_LAMBDA_FUNCTION_NAME || 'netlify-function',
    };
  }

  shouldLog(level) {
    return level >= this.logLevel;
  }

  log(level, message, context, error) {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatMessage(level, message, context, error);

    // Console logging
    if (this.enableConsole) {
      const levelName = Object.keys(LogLevel).find(key => LogLevel[key] === level);
      const prefix = `[${levelName}] ${logEntry.timestamp}`;
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(prefix, message, context || '', error || '');
          break;
        case LogLevel.INFO:
          console.info(prefix, message, context || '');
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, context || '');
          break;
        case LogLevel.ERROR:
          console.error(prefix, message, context || '', error || '');
          break;
        default:
          console.log(prefix, message, context || '');
      }
    }

    // TODO: Send to remote logging service (CloudWatch, Datadog, etc.)
    // This can be implemented later when setting up monitoring
  }

  debug(message, context) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message, context) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message, context) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message, error, context) {
    this.log(LogLevel.ERROR, message, context, error);
  }
}

// Export singleton instance
const logger = new Logger();

module.exports = logger;

