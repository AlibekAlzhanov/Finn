import { SubscriptionRow, daysBetweenToday } from './subscriptionService';

export type ForecastTransaction = {
  type?: string | null;
  amount?: number | string | null;
  transaction_date?: string | null;
  note?: string | null;
  tags?: string[] | string | null;
};

export type MonthlyForecast = {
  spentSoFar: number;
  simpleLinearForecast: number;
  smartForecast: number;
  optimisticForecast: number;
  riskForecast: number;
  variableSpent: number;
  fixedSpent: number;
  anomalySpent: number;
  upcomingSubscriptions: number;
  dailyAverage: number;
  remainingDays: number;
  daysInMonth: number;
  currentDay: number;
  anomalyCount: number;
  methodText: string;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isValidDate = (value: unknown) => {
  if (!value) return false;

  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
};

/**
 * Локальная функция, чтобы forecastService не зависел от parseDateOnly
 * из subscriptionService. У тебя старая версия subscriptionService не экспортировала
 * parseDateOnly, из-за этого была ошибка:
 *
 * parseDateOnly is not a function
 */
const parseDateOnlyLocal = (value: string | null | undefined) => {
  if (!value) return null;

  const [year, month, day] = value.split('-').map((item) => Number(item));

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return null;

  return date;
};

const getMedian = (values: number[]) => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
};

const getTagsText = (value: ForecastTransaction['tags']) => {
  if (!value) return '';

  if (Array.isArray(value)) {
    return value.join(' ');
  }

  return String(value);
};

const isSubscriptionTransaction = (tx: ForecastTransaction) => {
  const text = `${tx.note || ''} ${getTagsText(tx.tags)}`.toLowerCase();

  return (
    text.includes('subscription:') ||
    text.includes('подписка') ||
    text.includes('автосписание')
  );
};

const isSameMonth = (date: Date, year: number, month: number) => {
  return date.getFullYear() === year && date.getMonth() === month;
};

export const calculateMonthlyForecast = ({
  transactions,
  upcomingSubscriptions,
  now = new Date(),
}: {
  transactions: ForecastTransaction[];
  upcomingSubscriptions: SubscriptionRow[];
  now?: Date;
}): MonthlyForecast => {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const remainingDays = Math.max(daysInMonth - currentDay, 0);

  const monthExpenseTransactions = transactions.filter((tx) => {
    if (tx.type !== 'expense') return false;
    if (!isValidDate(tx.transaction_date)) return false;

    const date = new Date(String(tx.transaction_date));

    return isSameMonth(date, currentYear, currentMonth);
  });

  const spentSoFar = monthExpenseTransactions.reduce(
    (sum, tx) => sum + safeNumber(tx.amount),
    0
  );

  const simpleLinearForecast =
    currentDay > 0 ? Math.round((spentSoFar / currentDay) * daysInMonth) : spentSoFar;

  const fixedTransactions = monthExpenseTransactions.filter(isSubscriptionTransaction);
  const variableTransactions = monthExpenseTransactions.filter(
    (tx) => !isSubscriptionTransaction(tx)
  );

  const fixedSpent = fixedTransactions.reduce((sum, tx) => sum + safeNumber(tx.amount), 0);

  const variableAmounts = variableTransactions
    .map((tx) => safeNumber(tx.amount))
    .filter((amount) => amount > 0);

  const median = getMedian(variableAmounts);

  const anomalyThreshold = Math.max(30000, median > 0 ? median * 3 : 30000);

  const anomalyTransactions = variableTransactions.filter((tx) => {
    const amount = safeNumber(tx.amount);

    return amount >= anomalyThreshold && variableAmounts.length >= 3;
  });

  const anomalyKeys = new Set(
    anomalyTransactions.map((tx, index) => `${tx.transaction_date}-${tx.amount}-${index}`)
  );

  const normalVariableTransactions = variableTransactions.filter((tx, index) => {
    const key = `${tx.transaction_date}-${tx.amount}-${index}`;

    return !anomalyKeys.has(key);
  });

  const anomalySpent = anomalyTransactions.reduce((sum, tx) => sum + safeNumber(tx.amount), 0);
  const variableSpent = normalVariableTransactions.reduce(
    (sum, tx) => sum + safeNumber(tx.amount),
    0
  );

  const dailyAverage = currentDay > 0 ? variableSpent / currentDay : 0;
  const projectedVariableRemaining = dailyAverage * remainingDays;

  const upcomingSubscriptionsAmount = upcomingSubscriptions.reduce((sum, subscription) => {
    const date = parseDateOnlyLocal(subscription.next_payment_date);

    if (!date) return sum;

    if (!isSameMonth(date, currentYear, currentMonth)) return sum;

    const days = daysBetweenToday(subscription.next_payment_date);

    if (days === null || days < 0) return sum;

    return sum + safeNumber(subscription.amount);
  }, 0);

  const smartForecast = Math.round(
    spentSoFar + projectedVariableRemaining + upcomingSubscriptionsAmount
  );

  const optimisticForecast = Math.round(
    spentSoFar + projectedVariableRemaining * 0.85 + upcomingSubscriptionsAmount
  );

  const riskForecast = Math.round(
    spentSoFar + projectedVariableRemaining * 1.2 + upcomingSubscriptionsAmount
  );

  const methodParts = ['обычные расходы прогнозируются по дневному темпу'];

  if (fixedSpent > 0) {
    methodParts.push('уже списанные подписки не размножаются на весь месяц');
  }

  if (upcomingSubscriptionsAmount > 0) {
    methodParts.push('будущие подписки добавлены заранее');
  }

  if (anomalySpent > 0) {
    methodParts.push('крупные разовые покупки учтены один раз');
  }

  return {
    spentSoFar: Math.round(spentSoFar),
    simpleLinearForecast,
    smartForecast,
    optimisticForecast,
    riskForecast,
    variableSpent: Math.round(variableSpent),
    fixedSpent: Math.round(fixedSpent),
    anomalySpent: Math.round(anomalySpent),
    upcomingSubscriptions: Math.round(upcomingSubscriptionsAmount),
    dailyAverage: Math.round(dailyAverage),
    remainingDays,
    daysInMonth,
    currentDay,
    anomalyCount: anomalyTransactions.length,
    methodText: methodParts.join('; '),
  };
};
