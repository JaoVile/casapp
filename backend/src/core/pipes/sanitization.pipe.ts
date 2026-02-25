import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim().normalize('NFKC');
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sanitizeValue(item),
    ]);
    return Object.fromEntries(entries);
  }

  return value;
}

@Injectable()
export class SanitizationPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata) {
    return sanitizeValue(value);
  }
}

