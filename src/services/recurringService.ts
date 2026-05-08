import { supabase } from './supabase';
import { formatKzt } from './financeConfig';

export type RecurringPaymentCandidate = {
  id: string;
  title: string;
  categoryName: string;
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
  paymentsCount: number;
  monthsCount: number;
  lastPaymentDate: string;
  nextPaymentDate: string;
  confidence: number;
  transactions: Array<{
    id: string;
    amount: number;
    date: string;
    note: string;
    tags: string;
    categoryName: string;
  }>;
};

type TransactionRow = {
  id: string;
  type: string;
  amount: number | string | null;
  note: string | null;
  tags: string | null;
  transaction_date: string;
  categories?:
    | {
        name?: string | null;
      }
    | {
        name?: string | null;
      }[]
    | null;
};

const toSafeString = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDateMonthsAgo = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const getCategoryName = (tx: TransactionRow) => {
  const categoryData = Array.isArray(tx.categories)
    ? tx.categories[0]
    : tx.categories;

  return toSafeString(categoryData?.name || 'Без категории');
};

const normalizeWords = (value: unknown) => {
  return toSafeString(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-zа-яәғқңөұүһі\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const removeNoiseWords = (value: unknown) => {
  const stopWords = [
    'оплата',
    'покупка',
    'перевод',
    'расход',
    'платеж',
    'платёж',
    'payment',
    'pay',
    'kaspi',
    'каспи',
    'halyk',
    'халык',
    'forte',
    'bank',
    'банк',
    'карта',
    'счет',
    'счёт',
    'тенге',
    'тг',
    'kzt',
  ];

  const words = normalizeWords(value)
    .split(' ')
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => word.length >= 3)
    .filter((word) => !stopWords.includes(word));

  return words.join(' ');
};

const buildTransactionTitle = (tx: TransactionRow) => {
  const note = removeNoiseWords(tx.note);
  const tags = removeNoiseWords(tx.tags);
  const categoryName = removeNoiseWords(getCategoryName(tx));

  const source = tags || note || categoryName || 'регулярный платеж';

  return source
    .split(' ')
    .slice(0, 4)
    .join(' ')
    .trim();
};

const buildGroupKey = (tx: TransactionRow) => {
  const title = buildTransactionTitle(tx) || 'регулярный платеж';
  const category = normalizeWords(getCategoryName(tx)) || 'без категории';

  return `${category}::${title}`;
};

const getMonthKey = (date: string) => {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return 'unknown';

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

const addMonths = (date: string, months: number) => {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  parsed.setMonth(parsed.getMonth() + months);

  return parsed.toISOString().slice(0, 10);
};

const calculateConfidence = (
  paymentsCount: number,
  monthsCount: number,
  amountSpreadPercent: number
) => {
  let score = 40;

  if (paymentsCount >= 2) score += 15;
  if (paymentsCount >= 3) score += 15;
  if (monthsCount >= 2) score += 15;
  if (monthsCount >= 3) score += 10;

  if (amountSpreadPercent <= 5) score += 15;
  else if (amountSpreadPercent <= 15) score += 10;
  else if (amountSpreadPercent <= 25) score += 5;

  return Math.max(0, Math.min(100, score));
};

const toTitleCase = (value: unknown) => {
  const text = toSafeString(value).trim();

  if (!text) return 'Регулярный платеж';

  return text
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const loadRecurringPaymentCandidates = async (
  userId: string,
  months = 6
): Promise<RecurringPaymentCandidate[]> => {
  if (!userId) return [];

  const fromDate = getDateMonthsAgo(months);

  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, amount, note, tags, transaction_date, categories(name)')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('transaction_date', fromDate)
    .order('transaction_date', { ascending: false })
    .limit(500);

  if (error) {
    console.error('Ошибка загрузки операций для регулярных платежей:', error);
    return [];
  }

  const transactions = (data || []) as TransactionRow[];

  const grouped: Record<string, TransactionRow[]> = {};

  transactions.forEach((tx) => {
    const amount = safeNumber(tx.amount);

    if (amount <= 0) return;

    const title = buildTransactionTitle(tx);

    if (!title || title.length < 3) return;

    const key = buildGroupKey(tx);

    grouped[key] = grouped[key] || [];
    grouped[key].push(tx);
  });

  const candidates = Object.entries(grouped)
    .map(([key, items]) => {
      const amounts = items.map((tx) => safeNumber(tx.amount));
      const averageAmount =
        amounts.reduce((sum, value) => sum + value, 0) / Math.max(amounts.length, 1);

      const minAmount = Math.min(...amounts);
      const maxAmount = Math.max(...amounts);

      const amountSpreadPercent =
        averageAmount > 0 ? ((maxAmount - minAmount) / averageAmount) * 100 : 999;

      const monthsSet = new Set(items.map((tx) => getMonthKey(tx.transaction_date)));

      const sortedItems = [...items].sort(
        (a, b) =>
          new Date(b.transaction_date).getTime() -
          new Date(a.transaction_date).getTime()
      );

      const lastPayment = sortedItems[0];

      const rawTitle = buildTransactionTitle(lastPayment);
      const title = toTitleCase(rawTitle);

      const categoryName = getCategoryName(lastPayment);

      const confidence = calculateConfidence(
        items.length,
        monthsSet.size,
        amountSpreadPercent
      );

      return {
        id: key,
        title,
        categoryName,
        averageAmount: Math.round(averageAmount),
        minAmount: Math.round(minAmount),
        maxAmount: Math.round(maxAmount),
        paymentsCount: items.length,
        monthsCount: monthsSet.size,
        lastPaymentDate: lastPayment.transaction_date,
        nextPaymentDate: addMonths(lastPayment.transaction_date, 1),
        confidence,
        transactions: sortedItems.map((tx) => ({
          id: tx.id,
          amount: safeNumber(tx.amount),
          date: tx.transaction_date,
          note: toSafeString(tx.note),
          tags: toSafeString(tx.tags),
          categoryName: getCategoryName(tx),
        })),
      };
    })
    .filter((candidate) => {
      const amountIsStable =
        candidate.averageAmount > 0 &&
        ((candidate.maxAmount - candidate.minAmount) / candidate.averageAmount) * 100 <= 35;

      return (
        candidate.paymentsCount >= 2 &&
        candidate.monthsCount >= 2 &&
        amountIsStable
      );
    })
    .sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }

      return b.averageAmount - a.averageAmount;
    });

  return candidates;
};

export const calculateRecurringMonthlyTotal = (
  candidates: RecurringPaymentCandidate[]
) => {
  return candidates.reduce((sum, item) => sum + item.averageAmount, 0);
};

export const buildRecurringSummary = (
  candidates: RecurringPaymentCandidate[]
) => {
  if (candidates.length === 0) {
    return 'Регулярные платежи пока не обнаружены. Добавьте больше операций за разные месяцы.';
  }

  const monthlyTotal = calculateRecurringMonthlyTotal(candidates);
  const topCandidate = candidates[0];

  return [
    `Найдено регулярных платежей: ${candidates.length}.`,
    `Оценка ежемесячных списаний: ${formatKzt(monthlyTotal)}.`,
    `Крупнейший регулярный платеж: ${topCandidate.title} — примерно ${formatKzt(topCandidate.averageAmount)}.`,
  ].join('\n');
};
