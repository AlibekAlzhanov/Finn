export type CurrencyCode =
  | 'KZT'
  | 'USD'
  | 'EUR'
  | 'RUB'
  | 'GBP'
  | 'CNY'
  | 'TRY'
  | 'AED';

export type CurrencyInfo = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  shortName: string;
};

export const BASE_CURRENCY: CurrencyCode = 'KZT';

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  {
    code: 'KZT',
    name: 'Казахстанский тенге',
    symbol: '₸',
    shortName: 'Тенге',
  },
  {
    code: 'USD',
    name: 'Доллар США',
    symbol: '$',
    shortName: 'Доллар',
  },
  {
    code: 'EUR',
    name: 'Евро',
    symbol: '€',
    shortName: 'Евро',
  },
  {
    code: 'RUB',
    name: 'Российский рубль',
    symbol: '₽',
    shortName: 'Рубль',
  },
  {
    code: 'GBP',
    name: 'Британский фунт',
    symbol: '£',
    shortName: 'Фунт',
  },
  {
    code: 'CNY',
    name: 'Китайский юань',
    symbol: '¥',
    shortName: 'Юань',
  },
  {
    code: 'TRY',
    name: 'Турецкая лира',
    symbol: '₺',
    shortName: 'Лира',
  },
  {
    code: 'AED',
    name: 'Дирхам ОАЭ',
    symbol: 'د.إ',
    shortName: 'Дирхам',
  },
];

export const normalizeCurrencyCode = (value?: string | null): CurrencyCode => {
  const code = String(value || BASE_CURRENCY).trim().toUpperCase();

  const found = SUPPORTED_CURRENCIES.find((currency) => currency.code === code);

  return found?.code || BASE_CURRENCY;
};

export const getCurrencyInfo = (value?: string | null): CurrencyInfo => {
  const code = normalizeCurrencyCode(value);

  return SUPPORTED_CURRENCIES.find((currency) => currency.code === code) || SUPPORTED_CURRENCIES[0];
};

export const formatCurrencyAmount = (
  amount: number,
  currencyCode: string | null | undefined = BASE_CURRENCY,
  options?: {
    withCode?: boolean;
    compact?: boolean;
  }
) => {
  const currency = getCurrencyInfo(currencyCode);
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;

  const formatted = safeAmount.toLocaleString('ru-KZ', {
    minimumFractionDigits: safeAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  if (options?.compact) {
    return `${currency.symbol}${formatted}`;
  }

  if (options?.withCode) {
    return `${formatted} ${currency.code}`;
  }

  return `${currency.symbol} ${formatted}`;
};

export const detectCurrencyCodeFromText = (text: string): CurrencyCode => {
  const value = text.toLowerCase();

  if (/\b(usd|доллар|долларов|бакс|баксов|\$)\b/.test(value)) return 'USD';
  if (/\b(eur|евро|€)\b/.test(value)) return 'EUR';
  if (/\b(rub|руб|рубль|рубля|рублей|₽)\b/.test(value)) return 'RUB';
  if (/\b(gbp|фунт|фунтов|£)\b/.test(value)) return 'GBP';
  if (/\b(cny|юань|юаней|¥)\b/.test(value)) return 'CNY';
  if (/\b(try|лира|лир|₺)\b/.test(value)) return 'TRY';
  if (/\b(aed|дирхам|дирхамов)\b/.test(value)) return 'AED';
  if (/\b(kzt|тенге|тг|₸)\b/.test(value)) return 'KZT';

  return BASE_CURRENCY;
};

export const isBaseCurrency = (currencyCode?: string | null) => {
  return normalizeCurrencyCode(currencyCode) === BASE_CURRENCY;
};
