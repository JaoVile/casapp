import { BadRequestException } from '@nestjs/common';

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

// Normaliza telefone para formato E.164 simplificado (+55xxxxxxxxxxx).
export function normalizePhoneNumber(value: string) {
  const digits = onlyDigits(value);

  if (!digits) {
    throw new BadRequestException('Telefone obrigatorio');
  }

  let countryAndNumber = digits;

  // Padrão BR sem DDI: 10 ou 11 dígitos.
  if (digits.length === 10 || digits.length === 11) {
    countryAndNumber = `55${digits}`;
  }

  if (countryAndNumber.length < 12 || countryAndNumber.length > 13) {
    throw new BadRequestException('Telefone invalido. Use DDD + numero.');
  }

  return `+${countryAndNumber}`;
}

export function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
