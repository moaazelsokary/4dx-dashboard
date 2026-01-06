/**
 * Frontend logging service
 * Provides structured logging with different severity levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private logLevel: LogLevel;
  private enableConsole: boolean;
  private enableRemote: boolean;
  private remoteEndpoint?: string;

  constructor() {
    // Get log level from environment or default to INFO
    const envLogLevel = import.meta.env.VITE_LOG_LEVEL?.toUpperCase() || 'INFO';
    this.logLevel = LogLevel[envLogLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
    
    // Enable console logging in development
    this.enableConsole = import.meta.env.DEV;
    
    // Enable remote logging in production/staging
    this.enableRemote = import.meta.env.PROD || import.meta.env.MODE === 'staging';
    this.remoteEndpoint = import.meta.env.VITE_LOG_ENDPOINT;
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } as unknown as Error : undefined,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatMessage(level, message, context, error);

    // Console logging
    if (this.enableConsole) {
      const levelName = LogLevel[level];
      const style = this.getConsoleStyle(level);
      
      console.log(
        `%c[${levelName}] ${logEntry.timestamp}`,
        style,
        message,
        context || '',
        error || ''
      );
    }

    // Remote logging (async, don't block)
    if (this.enableRemote && this.remoteEndpoint) {
      this.sendToRemote(logEntry).catch(() => {
        // Silently fail remote logging
      });
    }
  }

  private getConsoleStyle(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'color: #888';
      case LogLevel.INFO:
        return 'color: #2196F3';
      case LogLevel.WARN:
        return 'color: #FF9800';
      case LogLevel.ERROR:
        return 'color: #F44336; font-weight: bold';
      default:
        return '';
    }
  }

  private async sendToRemote(entry: LogEntry): Promise<void> {
    if (!this.remoteEndpoint) {
      return;
    }

    try {
      await fetch(this.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
        keepalive: true, // Don't block page unload
      });
    } catch (error) {
      // Silently fail - don't break the app
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logDebug = (message: string, context?: Record<string, unknown>) => logger.debug(message, context);
export const logInfo = (message: string, context?: Record<string, unknown>) => logger.info(message, context);
export const logWarn = (message: string, context?: Record<string, unknown>) => logger.warn(message, context);
export const logError = (message: string, error?: Error, context?: Record<string, unknown>) => logger.error(message, error, context);

