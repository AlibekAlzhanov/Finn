import {
  CurrencyCode,
  detectCurrencyCodeFromText,
  normalizeCurrencyCode,
} from './currencyService';

export type VoiceCurrencyParseResult = {
  currency: CurrencyCode;
  detected: boolean;
  confidence: number;
  reason: string;
};

export const parseCurrencyFromVoiceText = (text: string): VoiceCurrencyParseResult => {
  const value = String(text || '').toLowerCase();

  const currency = detectCurrencyCodeFromText(value);
  const detected = currency !== 'KZT' || /\b(kzt|тенге|тг|₸)\b/i.test(value);

  return {
    currency: normalizeCurrencyCode(currency),
    detected,
    confidence: detected ? 0.9 : 0.5,
    reason: detected
      ? 'Валюта найдена в голосовой команде.'
      : 'Валюта не указана, используется KZT.',
  };
};

export const appendCurrencyHintToVoiceText = (text: string) => {
  const parsed = parseCurrencyFromVoiceText(text);

  return {
    ...parsed,
    normalizedText: `${text}\n\n[Валюта операции: ${parsed.currency}]`,
  };
};
