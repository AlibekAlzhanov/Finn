import {
  BASE_CURRENCY,
  CurrencyCode,
  detectCurrencyCodeFromText,
  normalizeCurrencyCode,
} from './currencyService';

export type AiOperationLike = Record<string, any>;

export type EnhancedAiOperation = AiOperationLike & {
  amount: number;
  sum: number;
  value: number;
  price: number;
  original_amount: number;
  currency: CurrencyCode;
  currency_code: CurrencyCode;
  original_currency: CurrencyCode;
  currency_detected_by: 'source_text_pair' | 'ai' | 'text' | 'default';
};

type CurrencyAmountPair = {
  amount: number;
  currency: CurrencyCode;
  index: number;
  raw: string;
};

const normalizeText = (value: unknown) => {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseNumber = (value: unknown) => {
  const normalized = String(value || '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const getAiAmount = (item: AiOperationLike) => {
  return parseNumber(
    item?.amount ??
      item?.sum ??
      item?.value ??
      item?.price ??
      item?.original_amount ??
      item?.base_amount ??
      ''
  );
};

const getOperationText = (item: AiOperationLike) => {
  return normalizeText(
    [
      item?.note,
      item?.description,
      item?.title,
      item?.category,
      item?.categoryName,
      item?.category_name,
      item?.name,
      Array.isArray(item?.tags) ? item.tags.join(' ') : item?.tags,
    ]
      .filter(Boolean)
      .join(' ')
  );
};

const normalizeCurrencyWord = (value: string): CurrencyCode | null => {
  const text = normalizeText(value);

  if (/^(usd|us\$|\$|дол+а+р(?:а|ов)?|доллар(?:а|ов)?|бакс(?:а|ов)?)$/.test(text)) {
    return 'USD';
  }

  if (/^(eur|€|евро)$/.test(text)) {
    return 'EUR';
  }

  if (/^(rub|руб\.?|₽|рубль|рубля|рублей)$/.test(text)) {
    return 'RUB';
  }

  if (/^(gbp|£|фунт(?:а|ов)?)$/.test(text)) {
    return 'GBP';
  }

  if (/^(cny|¥|юан(?:ь|я|ей)?)$/.test(text)) {
    return 'CNY';
  }

  if (/^(try|₺|лир(?:а|ы)?|лир)$/.test(text)) {
    return 'TRY';
  }

  if (/^(aed|дирхам(?:а|ов)?)$/.test(text)) {
    return 'AED';
  }

  if (/^(kzt|₸|тенге|тг)$/.test(text)) {
    return 'KZT';
  }

  return null;
};

const currencyPattern =
  '(?:usd|eur|rub|gbp|cny|try|aed|kzt|us\\$|[$€₽₸£¥]|дол+а+р(?:а|ов)?|доллар(?:а|ов)?|бакс(?:а|ов)?|евро|руб\\.?|рубль|рубля|рублей|фунт(?:а|ов)?|юан(?:ь|я|ей)?|лир(?:а|ы)?|лир|дирхам(?:а|ов)?|тенге|тг)';

const numberPattern = '(?:\\d+(?:[\\s.,]\\d{3})*(?:[.,]\\d+)?|\\d+)';

/**
 * Ищет именно исходную сумму + валюту в тексте пользователя.
 * Не зависит от слов "подарили", "дали", "купил", "потратил".
 */
export const extractCurrencyAmountPairs = (sourceText: string): CurrencyAmountPair[] => {
  const text = normalizeText(sourceText);
  const result: CurrencyAmountPair[] = [];

  const amountThenCurrency = new RegExp(`(${numberPattern})\\s*(${currencyPattern})`, 'gi');

  for (const match of text.matchAll(amountThenCurrency)) {
    const amount = parseNumber(match[1]);
    const currency = normalizeCurrencyWord(match[2] || '');

    if (amount > 0 && currency) {
      result.push({
        amount,
        currency,
        index: match.index ?? 0,
        raw: match[0],
      });
    }
  }

  const currencyThenAmount = new RegExp(`(${currencyPattern})\\s*(${numberPattern})`, 'gi');

  for (const match of text.matchAll(currencyThenAmount)) {
    const currency = normalizeCurrencyWord(match[1] || '');
    const amount = parseNumber(match[2]);

    if (amount > 0 && currency) {
      const duplicate = result.some(
        (item) =>
          item.amount === amount &&
          item.currency === currency &&
          Math.abs(item.index - (match.index ?? 0)) <= 5
      );

      if (!duplicate) {
        result.push({
          amount,
          currency,
          index: match.index ?? 0,
          raw: match[0],
        });
      }
    }
  }

  return result.sort((a, b) => a.index - b.index);
};

const pickPairForOperation = (
  item: AiOperationLike,
  index: number,
  pairs: CurrencyAmountPair[],
  sourceText: string
): CurrencyAmountPair | null => {
  if (pairs.length === 0) return null;
  if (pairs.length === 1) return pairs[0];

  const operationText = getOperationText(item);
  const fullText = normalizeText(sourceText);

  if (operationText) {
    const words = operationText
      .split(' ')
      .filter((word) => word.length >= 3)
      .slice(0, 8);

    for (const word of words) {
      const wordIndex = fullText.indexOf(word);

      if (wordIndex >= 0) {
        let best = pairs[0];
        let bestDistance = Math.abs(best.index - wordIndex);

        for (const pair of pairs) {
          const distance = Math.abs(pair.index - wordIndex);

          if (distance < bestDistance) {
            best = pair;
            bestDistance = distance;
          }
        }

        if (bestDistance <= 100) return best;
      }
    }
  }

  return pairs[index] || pairs[0];
};

const currencyFromExplicitFields = (item: AiOperationLike): CurrencyCode | null => {
  const direct =
    item?.currency ||
    item?.currency_code ||
    item?.original_currency ||
    item?.originalCurrency;

  if (!direct) return null;

  return normalizeCurrencyCode(String(direct));
};

export const normalizeAiOperationCurrencies = (
  data: AiOperationLike[],
  originalText: string
): EnhancedAiOperation[] => {
  const source = Array.isArray(data) ? data : [];
  const pairs = extractCurrencyAmountPairs(originalText);
  const textCurrency = detectCurrencyCodeFromText(originalText);

  return source.map((item, index) => {
    const pair = pickPairForOperation(item, index, pairs, originalText);
    const aiAmount = getAiAmount(item);
    const explicitCurrency = currencyFromExplicitFields(item);

    let amount = aiAmount;
    let currency: CurrencyCode = BASE_CURRENCY;
    let detectedBy: EnhancedAiOperation['currency_detected_by'] = 'default';

    /**
     * Главный приоритет:
     * если в исходной фразе пользователь сказал "100 долларов" / "100 евро",
     * берем 100 USD / 100 EUR.
     *
     * Ответ AI вида "42500 KZT" считаем уже сконвертированным и перезаписываем.
     */
    if (pair) {
      amount = pair.amount;
      currency = pair.currency;
      detectedBy = 'source_text_pair';
    } else if (explicitCurrency) {
      amount = aiAmount;
      currency = explicitCurrency;
      detectedBy = 'ai';
    } else if (textCurrency !== BASE_CURRENCY) {
      amount = aiAmount;
      currency = textCurrency;
      detectedBy = 'text';
    }

    return {
      ...item,
      amount,
      sum: amount,
      value: amount,
      price: amount,
      original_amount: amount,
      currency,
      currency_code: currency,
      original_currency: currency,
      currency_detected_by: detectedBy,
    };
  });
};

export const buildCurrencyAwareAiInstruction = () => {
  return `
ВАЖНО ДЛЯ ВАЛЮТ:
Не конвертируй валюты самостоятельно.
Если пользователь сказал сумму в валюте, верни исходную сумму и исходную валюту.

Правильно:
"100 долларов" -> amount: 100, currency: "USD"
"100 евро" -> amount: 100, currency: "EUR"
"100 рублей" -> amount: 100, currency: "RUB"
"100 тенге" -> amount: 100, currency: "KZT"

Неправильно:
"100 долларов" -> amount: 42500, currency: "KZT"

currency должен быть одним из:
KZT, USD, EUR, RUB, GBP, CNY, TRY, AED.

Курс и конвертацию делает приложение после AI.
`;
};
