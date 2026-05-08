import { supabase } from './supabase';
import {
  BASE_CURRENCY,
  CurrencyCode,
  normalizeCurrencyCode,
} from './currencyService';

export type ExchangeRateResult = {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  rateDate: string;
  source: string;
  cached: boolean;
};

export type CurrencyTransactionPayload = {
  amount: number;
  original_amount: number;
  original_currency: CurrencyCode;
  base_amount: number;
  base_currency: CurrencyCode;
  exchange_rate: number;
  exchange_source: string;
  exchange_date: string;
};

const memoryCache = new Map<string, ExchangeRateResult>();

const todayDateOnly = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const toNbkDate = (dateOnly: string) => {
  const [year, month, day] = dateOnly.split('-');

  return `${day}.${month}.${year}`;
};

const buildCacheKey = (fromCurrency: CurrencyCode, toCurrency: CurrencyCode, date: string) => {
  return `${fromCurrency}_${toCurrency}_${date}`;
};

const safeRate = (value: unknown) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const readCachedRate = async (
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rateDate: string
): Promise<ExchangeRateResult | null> => {
  const key = buildCacheKey(fromCurrency, toCurrency, rateDate);
  const memory = memoryCache.get(key);

  // Берем из memory cache только официальный курс НБК.
  // Иначе старый курс от стороннего API может снова дать 425 вместо актуального курса.
  if (memory && memory.source.includes('nationalbank.kz')) return memory;

  try {
    const { data, error } = await supabase
      .from('currency_rates')
      .select('from_currency, to_currency, rate, rate_date, source')
      .eq('from_currency', fromCurrency)
      .eq('to_currency', toCurrency)
      .eq('rate_date', rateDate)
      .maybeSingle();

    if (error || !data) return null;

    const source = String(data.source || 'cache');

    // ВАЖНО:
    // Для Казахстана не доверяем старым источникам open.er-api/frankfurter,
    // если есть возможность взять курс НБК.
    if (!source.includes('nationalbank.kz')) return null;

    const rate = safeRate(data.rate);

    if (!rate) return null;

    const result: ExchangeRateResult = {
      fromCurrency,
      toCurrency,
      rate,
      rateDate: String(data.rate_date || rateDate),
      source,
      cached: true,
    };

    memoryCache.set(key, result);

    return result;
  } catch (error) {
    console.log('Currency cache read skipped:', error);
    return null;
  }
};

const saveCachedRate = async (result: ExchangeRateResult) => {
  const key = buildCacheKey(result.fromCurrency, result.toCurrency, result.rateDate);

  memoryCache.set(key, result);

  try {
    await supabase.from('currency_rates').upsert(
      {
        from_currency: result.fromCurrency,
        to_currency: result.toCurrency,
        rate: result.rate,
        rate_date: result.rateDate,
        source: result.source,
        fetched_at: new Date().toISOString(),
      },
      {
        onConflict: 'from_currency,to_currency,rate_date',
      }
    );
  } catch (error) {
    console.log('Currency cache save skipped:', error);
  }
};

const extractNbkRate = (xml: string, currency: CurrencyCode) => {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const items = [...xml.matchAll(itemRegex)];

  for (const item of items) {
    const body = item[1] || '';

    const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const description = body.match(/<description>([\s\S]*?)<\/description>/i)?.[1]?.trim();
    const quantText = body.match(/<quant>([\s\S]*?)<\/quant>/i)?.[1]?.trim();

    if (title?.toUpperCase() !== currency) continue;

    const value = safeRate(description);
    const quant = safeRate(quantText) || 1;

    if (!value) return 0;

    // НБК для некоторых валют дает курс за 10 / 100 / 1000 единиц.
    // Для USD обычно quant = 1, но для UZS/KRW/AMD бывает больше.
    return value / quant;
  }

  return 0;
};

/**
 * Официальный курс Национального Банка Казахстана.
 * Главный источник для KZT.
 */
const fetchFromNationalBankKz = async (
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rateDate: string
): Promise<ExchangeRateResult | null> => {
  if (toCurrency !== BASE_CURRENCY) return null;
  if (fromCurrency === BASE_CURRENCY) {
    return {
      fromCurrency,
      toCurrency,
      rate: 1,
      rateDate,
      source: 'nationalbank.kz',
      cached: false,
    };
  }

  const url = `https://nationalbank.kz/rss/get_rates.cfm?fdate=${toNbkDate(rateDate)}`;
  const response = await fetch(url);

  if (!response.ok) return null;

  const xml = await response.text();
  const rate = extractNbkRate(xml, fromCurrency);

  if (!rate) return null;

  return {
    fromCurrency,
    toCurrency,
    rate,
    rateDate,
    source: 'nationalbank.kz',
    cached: false,
  };
};

const fetchFromOpenErApi = async (
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): Promise<ExchangeRateResult | null> => {
  const response = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`);

  if (!response.ok) return null;

  const json = await response.json();
  const rate = safeRate(json?.rates?.[toCurrency]);

  if (!rate) return null;

  return {
    fromCurrency,
    toCurrency,
    rate,
    rateDate: todayDateOnly(),
    source: 'open.er-api.com',
    cached: false,
  };
};

const fetchFromFrankfurter = async (
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): Promise<ExchangeRateResult | null> => {
  const response = await fetch(
    `https://api.frankfurter.dev/v2/rates?base=${fromCurrency}&quotes=${toCurrency}`
  );

  if (!response.ok) return null;

  const json = await response.json();
  const rate = safeRate(json?.rates?.[toCurrency]);

  if (!rate) return null;

  return {
    fromCurrency,
    toCurrency,
    rate,
    rateDate: String(json?.date || todayDateOnly()),
    source: 'frankfurter.dev',
    cached: false,
  };
};

const fetchRateOnline = async (
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rateDate: string
): Promise<ExchangeRateResult> => {
  // 1. Для Казахстана сначала официальный курс НБК.
  try {
    const nbk = await fetchFromNationalBankKz(fromCurrency, toCurrency, rateDate);

    if (nbk?.rate) return nbk;
  } catch (error) {
    console.log('National Bank KZ provider failed:', error);
  }

  // 2. Fallback только если НБК не ответил.
  const providers = [fetchFromOpenErApi, fetchFromFrankfurter];

  for (const provider of providers) {
    try {
      const result = await provider(fromCurrency, toCurrency);

      if (result?.rate) return result;
    } catch (error) {
      console.log('Currency provider failed:', error);
    }
  }

  throw new Error(`Не удалось получить курс ${fromCurrency} → ${toCurrency}.`);
};

export const getExchangeRate = async (
  fromCurrencyValue?: string | null,
  toCurrencyValue: string | null = BASE_CURRENCY,
  rateDate: string = todayDateOnly()
): Promise<ExchangeRateResult> => {
  const fromCurrency = normalizeCurrencyCode(fromCurrencyValue);
  const toCurrency = normalizeCurrencyCode(toCurrencyValue);

  if (fromCurrency === toCurrency) {
    return {
      fromCurrency,
      toCurrency,
      rate: 1,
      rateDate,
      source: 'base',
      cached: true,
    };
  }

  const cached = await readCachedRate(fromCurrency, toCurrency, rateDate);

  if (cached) return cached;

  const online = await fetchRateOnline(fromCurrency, toCurrency, rateDate);

  await saveCachedRate(online);

  return online;
};

export const convertCurrency = async ({
  amount,
  fromCurrency,
  toCurrency = BASE_CURRENCY,
}: {
  amount: number;
  fromCurrency?: string | null;
  toCurrency?: string | null;
}) => {
  const originalAmount = Number(amount);

  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    throw new Error('Введите корректную сумму.');
  }

  const rate = await getExchangeRate(fromCurrency, toCurrency);
  const convertedAmount = Math.round(originalAmount * rate.rate * 100) / 100;

  return {
    originalAmount,
    convertedAmount,
    rate,
  };
};

export const prepareCurrencyTransactionPayload = async ({
  amount,
  originalCurrency,
  baseCurrency = BASE_CURRENCY,
}: {
  amount: number;
  originalCurrency?: string | null;
  baseCurrency?: string | null;
}): Promise<CurrencyTransactionPayload> => {
  const originalAmount = Number(amount);

  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    throw new Error('Введите корректную сумму.');
  }

  const rate = await getExchangeRate(originalCurrency, baseCurrency);
  const baseAmount = Math.round(originalAmount * rate.rate * 100) / 100;

  return {
    amount: baseAmount,
    original_amount: originalAmount,
    original_currency: rate.fromCurrency,
    base_amount: baseAmount,
    base_currency: rate.toCurrency,
    exchange_rate: rate.rate,
    exchange_source: rate.source,
    exchange_date: rate.rateDate,
  };
};
