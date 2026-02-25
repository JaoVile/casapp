import { Injectable } from '@nestjs/common';
import { appendFile } from 'node:fs/promises';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type BasePayload = Record<string, unknown> & {
  event: string;
};

@Injectable()
export class StructuredLoggerService {
  private readonly logFilePath = process.env.LOG_FILE_PATH?.trim();

  debug(payload: BasePayload) {
    void this.write('debug', payload);
  }

  info(payload: BasePayload) {
    void this.write('info', payload);
  }

  warn(payload: BasePayload) {
    void this.write('warn', payload);
  }

  error(payload: BasePayload) {
    void this.write('error', payload);
  }

  private async write(level: LogLevel, payload: BasePayload) {
    const logObject = {
      level,
      timestamp: new Date().toISOString(),
      ...payload,
    };
    const line = JSON.stringify(logObject);

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }

    if (!this.logFilePath) return;

    try {
      await appendFile(this.logFilePath, `${line}\n`, { encoding: 'utf-8' });
    } catch {
      // Keep logging non-blocking even if file I/O fails.
    }
  }
}

