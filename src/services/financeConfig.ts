export const FINANCE_REGION = {
  country: 'Казахстан',
  countryCode: 'KZ',
  locale: 'ru-KZ',
  currencyCode: 'KZT',
  currencySymbol: '₸',
  currencyNameRu: 'тенге',
  cityExamples: ['Алматы', 'Астана', 'Шымкент'],
};

export const formatKzt = (value: number) => {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  return `${Math.round(safeValue).toLocaleString('ru-KZ')} ${FINANCE_REGION.currencySymbol}`;
};

export const KAZAKHSTAN_AI_RULES = `
Регион пользователя: Казахстан.
Валюта пользователя: казахстанский тенге.
Всегда используй валюту KZT / ₸ / тенге.
Никогда не используй рубли, ₽, RUB, доллары или евро, если пользователь сам явно не попросил конвертацию.
Формат сумм: 25 000 ₸.
Финансовые советы адаптируй под личные финансы в Казахстане.
Пиши на русском языке.
`;
