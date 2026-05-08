export type TransactionType = 'income' | 'expense' | 'transfer';

export type TransactionCategory = {
  name?: string | null;
};

export type FinanceTransaction = {
  type: TransactionType | string;
  amount: number | string;
  note?: string | null;
  transaction_date?: string | null;
  categories?: TransactionCategory | TransactionCategory[] | null;
};

export type CategoryExpense = {
  category: string;
  amount: number;
  percent: number;
};

export type ExpenseAnomaly = {
  category: string;
  amount: number;
  average: number;
  deviation: number;
  isAnomaly: boolean;
};

export const toNumber = (value: number | string | null | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatMoney = (value: number): string => {
  return `${Math.round(value).toLocaleString('ru-RU')} ₸`;
};

export const getDaysInMonth = (date: Date = new Date()): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

export const calculateMonthlyForecast = (
  currentExpense: number,
  currentDate: Date = new Date()
): number => {
  const currentDay = currentDate.getDate();
  const daysInMonth = getDaysInMonth(currentDate);

  if (currentDay <= 0 || currentExpense <= 0) return 0;

  return Math.round((currentExpense / currentDay) * daysInMonth);
};

export const calculateDailySafeLimit = (
  totalIncome: number,
  totalExpense: number,
  currentDate: Date = new Date()
): number => {
  const daysInMonth = getDaysInMonth(currentDate);
  const remainingDays = Math.max(daysInMonth - currentDate.getDate() + 1, 1);
  const remainingMoney = totalIncome - totalExpense;

  if (remainingMoney <= 0) return 0;

  return Math.round(remainingMoney / remainingDays);
};

export const calculateExpenseRatio = (
  totalIncome: number,
  totalExpense: number
): number => {
  if (totalIncome <= 0) return totalExpense > 0 ? 100 : 0;
  return Math.round((totalExpense / totalIncome) * 100);
};

export const calculateSavingRate = (
  totalIncome: number,
  totalExpense: number
): number => {
  if (totalIncome <= 0) return 0;
  return Math.round(((totalIncome - totalExpense) / totalIncome) * 100);
};

export const calculateFinancialScore = (
  totalIncome: number,
  totalExpense: number,
  forecastExpense: number
): number => {
  let score = 50;
  const savingRate = calculateSavingRate(totalIncome, totalExpense);
  const expenseRatio = calculateExpenseRatio(totalIncome, totalExpense);

  if (totalIncome <= 0 && totalExpense > 0) score -= 30;

  if (totalIncome > totalExpense) score += 20;
  else if (totalExpense > totalIncome) score -= 20;

  if (totalIncome > 0 && forecastExpense > 0) {
    if (forecastExpense <= totalIncome) score += 15;
    else score -= 15;
  }

  if (savingRate >= 30) score += 15;
  else if (savingRate >= 15) score += 10;
  else if (savingRate >= 5) score += 5;
  else if (savingRate < 0) score -= 15;

  if (expenseRatio >= 90) score -= 10;
  else if (expenseRatio <= 60 && totalIncome > 0) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
};

export const getFinancialScoreLabel = (score: number): string => {
  if (score >= 85) return 'Отличное финансовое состояние';
  if (score >= 70) return 'Хорошее финансовое состояние';
  if (score >= 50) return 'Стабильное, но требует контроля';
  if (score >= 35) return 'Есть риск перерасхода';
  return 'Высокий финансовый риск';
};

export const getFinancialScoreDescription = (score: number): string => {
  if (score >= 85) return 'Расходы под контролем, есть хороший потенциал накоплений.';
  if (score >= 70) return 'Финансовая ситуация нормальная, но отдельные категории стоит контролировать.';
  if (score >= 50) return 'Баланс приемлемый, однако темп расходов может стать проблемой.';
  if (score >= 35) return 'Расходы близки к доходам или превышают безопасный уровень.';
  return 'Необходимо срочно пересмотреть структуру расходов.';
};

export const getCategoryName = (transaction: FinanceTransaction): string => {
  const categoryData = Array.isArray(transaction.categories)
    ? transaction.categories[0]
    : transaction.categories;

  return categoryData?.name || 'Другое';
};

export const groupExpensesByCategory = (
  transactions: FinanceTransaction[]
): Record<string, number> => {
  const grouped: Record<string, number> = {};

  transactions
    .filter((tx) => tx.type === 'expense')
    .forEach((tx) => {
      const categoryName = getCategoryName(tx);
      grouped[categoryName] = (grouped[categoryName] || 0) + toNumber(tx.amount);
    });

  return grouped;
};

export const getTopExpenseCategories = (
  transactions: FinanceTransaction[],
  limit = 5
): CategoryExpense[] => {
  const grouped = groupExpensesByCategory(transactions);
  const total = Object.values(grouped).reduce((sum, value) => sum + value, 0);

  if (total <= 0) return [];

  return Object.entries(grouped)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: Math.round((amount / total) * 100),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};

export const detectExpenseAnomalies = (
  transactions: FinanceTransaction[],
  thresholdPercent = 40
): ExpenseAnomaly[] => {
  const grouped = groupExpensesByCategory(transactions);
  const values = Object.values(grouped).filter((value) => value > 0);

  if (values.length < 2) return [];

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  if (average <= 0) return [];

  return Object.entries(grouped)
    .map(([category, amount]) => {
      const deviation = Math.round(((amount - average) / average) * 100);

      return {
        category,
        amount,
        average: Math.round(average),
        deviation,
        isAnomaly: deviation >= thresholdPercent,
      };
    })
    .filter((item) => item.isAnomaly)
    .sort((a, b) => b.deviation - a.deviation);
};

export const buildSmartSummary = (
  totalIncome: number,
  totalExpense: number,
  transactions: FinanceTransaction[],
  currentDate: Date = new Date()
) => {
  const forecastExpense = calculateMonthlyForecast(totalExpense, currentDate);
  const dailySafeLimit = calculateDailySafeLimit(totalIncome, totalExpense, currentDate);
  const expenseRatio = calculateExpenseRatio(totalIncome, totalExpense);
  const savingRate = calculateSavingRate(totalIncome, totalExpense);
  const financialScore = calculateFinancialScore(totalIncome, totalExpense, forecastExpense);
  const anomalies = detectExpenseAnomalies(transactions);
  const topCategories = getTopExpenseCategories(transactions, 3);

  return {
    forecastExpense,
    dailySafeLimit,
    expenseRatio,
    savingRate,
    financialScore,
    financialScoreLabel: getFinancialScoreLabel(financialScore),
    financialScoreDescription: getFinancialScoreDescription(financialScore),
    anomalies,
    topCategories,
  };
};
