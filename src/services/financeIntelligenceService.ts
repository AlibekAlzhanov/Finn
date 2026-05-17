import { formatKzt } from './financeConfig';

export type TransactionType = 'income' | 'expense' | 'transfer';
export type InsightSeverity = 'low' | 'medium' | 'high';
export type InsightType =
  | 'overspending'
  | 'anomaly'
  | 'budget'
  | 'subscription'
  | 'goal'
  | 'forecast'
  | 'empty';

export type FinanceTransaction = {
  id?: string;
  type?: string | null;
  amount?: number | string | null;
  transaction_date?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  note?: string | null;
  tags?: string | null;
  categories?:
    | {
        name?: string | null;
      }
    | Array<{
        name?: string | null;
      }>;
};

export type FinanceCategory = {
  id: string;
  name: string | null;
  type?: string | null;
};

export type FinanceBudget = {
  id?: string;
  category_id?: string | null;
  limit_amount?: number | string | null;
  period?: string | null;
};

export type FinanceGoal = {
  id?: string;
  title?: string | null;
  target_amount?: number | string | null;
  current_amount?: number | string | null;
  deadline?: string | null;
};

export type FinanceSubscription = {
  id?: string;
  title?: string | null;
  amount?: number | string | null;
  next_payment_date?: string | null;
  is_active?: boolean | null;
};

export type ScoreFactor = {
  id: string;
  title: string;
  impact: number;
  description: string;
};

export type CategoryInsight = {
  id: string;
  name: string;
  amount: number;
  count: number;
  percent: number;
};

export type AnomalyInsight = {
  id: string;
  transactionId?: string;
  title: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  reason: string;
  level: 'medium' | 'high';
};

export type BudgetStatus = {
  id: string;
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  spentAmount: number;
  remainingAmount: number;
  percent: number;
  status: 'normal' | 'warning' | 'exceeded';
};

export type GoalStatus = {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progress: number;
  deadline: string | null;
};

export type UpcomingSubscription = {
  id: string;
  title: string;
  amount: number;
  nextPaymentDate: string;
  daysLeft: number;
};

export type AiInsight = {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  message: string;
  actionLabel?: string;
  actionRoute?: string;
  actionPayload?: Record<string, unknown>;
};

export type FinanceIntelligenceInput = {
  transactions: FinanceTransaction[];
  categories: FinanceCategory[];
  budgets?: FinanceBudget[];
  goals?: FinanceGoal[];
  subscriptions?: FinanceSubscription[];
  periodStart: Date;
  periodEnd: Date;
  today?: Date;
};

export type FinanceIntelligenceResult = {
  periodStartIso: string;
  periodEndIso: string;
  isCurrentPeriod: boolean;
  transactionsCount: number;
  incomeTransactionsCount: number;
  expenseTransactionsCount: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  expensePercent: number;
  savingRate: number;
  averageDailyExpense: number;
  forecastExpense: number;
  forecastDiff: number;
  dailySafeLimit: number;
  financialScore: number;
  financialScoreLabel: string;
  scoreFactors: ScoreFactor[];
  topExpenseCategories: CategoryInsight[];
  anomalies: AnomalyInsight[];
  budgetStatuses: BudgetStatus[];
  goalStatuses: GoalStatus[];
  upcomingSubscriptions: UpcomingSubscription[];
  insights: AiInsight[];
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const severityWeight: Record<InsightSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

const startOfDay = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const isValidDate = (value: unknown) => {
  if (!value) return false;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
};

const isDateInsidePeriod = (value: unknown, start: Date, end: Date) => {
  if (!isValidDate(value)) return false;

  const date = new Date(String(value));
  return date >= start && date < end;
};

const daysBetween = (start: Date, end: Date) => {
  const startDay = startOfDay(start).getTime();
  const endDay = startOfDay(end).getTime();
  return Math.max(1, Math.ceil((endDay - startDay) / MS_IN_DAY));
};

const daysLeftUntil = (dateValue: string, today: Date) => {
  const date = startOfDay(new Date(dateValue));
  const current = startOfDay(today);
  return Math.ceil((date.getTime() - current.getTime()) / MS_IN_DAY);
};

const getCategoryMap = (categories: FinanceCategory[]) => {
  const map: Record<string, string> = {};

  categories.forEach((category) => {
    if (category.id) {
      map[category.id] = category.name || 'Без категории';
    }
  });

  return map;
};

const getEmbeddedCategoryName = (tx: FinanceTransaction) => {
  if (!tx.categories) return null;

  if (Array.isArray(tx.categories)) {
    return tx.categories[0]?.name || null;
  }

  return tx.categories.name || null;
};

const getCategoryName = (
  tx: FinanceTransaction,
  categoryMap: Record<string, string>
) => {
  if (tx.category_name) return tx.category_name;

  const embeddedName = getEmbeddedCategoryName(tx);
  if (embeddedName) return embeddedName;

  if (tx.category_id && categoryMap[tx.category_id]) {
    return categoryMap[tx.category_id];
  }

  return 'Без категории';
};

const getFinancialScoreLabel = (score: number) => {
  if (score >= 80) return 'Финансы под контролем';
  if (score >= 60) return 'Стабильно, но есть зоны роста';
  if (score >= 40) return 'Нужно усилить контроль';
  return 'Высокий риск перерасхода';
};

const calculateTopExpenseCategories = (
  transactions: FinanceTransaction[],
  categoryMap: Record<string, string>,
  totalExpense: number
): CategoryInsight[] => {
  const grouped: Record<string, CategoryInsight> = {};

  transactions
    .filter((tx) => tx.type === 'expense')
    .forEach((tx) => {
      const categoryId = tx.category_id || 'unknown';
      const categoryName = getCategoryName(tx, categoryMap);
      const amount = safeNumber(tx.amount);

      if (!grouped[categoryId]) {
        grouped[categoryId] = {
          id: categoryId,
          name: categoryName,
          amount: 0,
          count: 0,
          percent: 0,
        };
      }

      grouped[categoryId].amount += amount;
      grouped[categoryId].count += 1;
    });

  return Object.values(grouped)
    .map((item) => ({
      ...item,
      percent: totalExpense > 0 ? Math.round((item.amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
};

const calculateAverageAndDeviation = (amounts: number[]) => {
  if (amounts.length === 0) {
    return {
      average: 0,
      stdDev: 0,
    };
  }

  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;

  const variance =
    amounts.reduce((sum, amount) => sum + Math.pow(amount - average, 2), 0) /
    amounts.length;

  return {
    average,
    stdDev: Math.sqrt(variance),
  };
};

const detectAnomalies = (
  transactions: FinanceTransaction[],
  categoryMap: Record<string, string>
): AnomalyInsight[] => {
  const expenseTransactions = transactions.filter(
    (tx) => tx.type === 'expense' && safeNumber(tx.amount) > 0
  );

  if (expenseTransactions.length === 0) return [];

  const globalStats = calculateAverageAndDeviation(
    expenseTransactions.map((tx) => safeNumber(tx.amount))
  );

  const categoryAmounts: Record<string, number[]> = {};

  expenseTransactions.forEach((tx) => {
    const key = tx.category_id || 'unknown';
    if (!categoryAmounts[key]) categoryAmounts[key] = [];
    categoryAmounts[key].push(safeNumber(tx.amount));
  });

  return expenseTransactions
    .filter((tx) => {
      const amount = safeNumber(tx.amount);
      const key = tx.category_id || 'unknown';
      const amounts = categoryAmounts[key] || [];
      const stats =
        amounts.length >= 3 ? calculateAverageAndDeviation(amounts) : globalStats;

      if (stats.average <= 0) return false;

      if (amount >= stats.average * 2) return true;
      if (amount > stats.average + stats.stdDev * 1.5) return true;

      return false;
    })
    .sort((a, b) => safeNumber(b.amount) - safeNumber(a.amount))
    .slice(0, 5)
    .map((tx) => {
      const amount = safeNumber(tx.amount);
      const categoryId = tx.category_id || 'unknown';
      const categoryName = getCategoryName(tx, categoryMap);
      const categoryStats = calculateAverageAndDeviation(categoryAmounts[categoryId] || []);
      const fallbackAverage = categoryStats.average || globalStats.average;

      return {
        id: tx.id || `anomaly-${categoryId}-${amount}`,
        transactionId: tx.id,
        title: tx.note || categoryName,
        amount,
        categoryId,
        categoryName,
        reason: `Расход выше обычного уровня. Средний расход: ${formatKzt(
          Math.round(fallbackAverage)
        )}.`,
        level: amount >= fallbackAverage * 3 ? 'high' : 'medium',
      };
    });
};

const calculateBudgetStatuses = (
  budgets: FinanceBudget[],
  categories: FinanceCategory[],
  topExpenseCategories: CategoryInsight[]
): BudgetStatus[] => {
  const categoryMap = getCategoryMap(categories);
  const spentByCategory: Record<string, number> = {};

  topExpenseCategories.forEach((category) => {
    spentByCategory[category.id] = category.amount;
  });

  return (budgets || [])
    .map((budget) => {
      const categoryId = budget.category_id || 'unknown';
      const limitAmount = safeNumber(budget.limit_amount);
      const spentAmount = spentByCategory[categoryId] || 0;
      const percent = limitAmount > 0 ? Math.round((spentAmount / limitAmount) * 100) : 0;

      let status: BudgetStatus['status'] = 'normal';
      if (percent >= 100) status = 'exceeded';
      else if (percent >= 80) status = 'warning';

      return {
        id: budget.id || `budget-${categoryId}`,
        categoryId,
        categoryName: categoryMap[categoryId] || 'Категория',
        limitAmount,
        spentAmount,
        remainingAmount: Math.max(limitAmount - spentAmount, 0),
        percent,
        status,
      };
    })
    .filter((budget) => budget.limitAmount > 0);
};

const calculateGoalStatuses = (goals: FinanceGoal[]): GoalStatus[] => {
  return (goals || [])
    .map((goal) => {
      const targetAmount = safeNumber(goal.target_amount);
      const currentAmount = safeNumber(goal.current_amount);
      const progress =
        targetAmount > 0 ? clamp(Math.round((currentAmount / targetAmount) * 100), 0, 100) : 0;

      return {
        id: goal.id || `goal-${goal.title || 'unknown'}`,
        title: goal.title || 'Финансовая цель',
        targetAmount,
        currentAmount,
        remainingAmount: Math.max(targetAmount - currentAmount, 0),
        progress,
        deadline: goal.deadline || null,
      };
    })
    .filter((goal) => goal.targetAmount > 0);
};

const getUpcomingSubscriptions = (
  subscriptions: FinanceSubscription[],
  today: Date,
  periodEnd: Date
): UpcomingSubscription[] => {
  return (subscriptions || [])
    .filter((subscription) => subscription.is_active !== false)
    .filter((subscription) => {
      if (!subscription.next_payment_date || !isValidDate(subscription.next_payment_date)) {
        return false;
      }

      const nextPayment = new Date(subscription.next_payment_date);
      return nextPayment >= startOfDay(today) && nextPayment < periodEnd;
    })
    .map((subscription) => ({
      id: subscription.id || `subscription-${subscription.title || 'unknown'}`,
      title: subscription.title || 'Подписка',
      amount: safeNumber(subscription.amount),
      nextPaymentDate: String(subscription.next_payment_date),
      daysLeft: daysLeftUntil(String(subscription.next_payment_date), today),
    }))
    .filter((subscription) => subscription.amount > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
};

const calculateForecast = ({
  totalIncome,
  totalExpense,
  periodStart,
  periodEnd,
  today,
  upcomingSubscriptions,
}: {
  totalIncome: number;
  totalExpense: number;
  periodStart: Date;
  periodEnd: Date;
  today: Date;
  upcomingSubscriptions: UpcomingSubscription[];
}) => {
  const currentDay = startOfDay(today);
  const periodStartDay = startOfDay(periodStart);
  const periodEndDay = startOfDay(periodEnd);
  const isCurrentPeriod = currentDay >= periodStartDay && currentDay < periodEndDay;

  const periodDays = daysBetween(periodStart, periodEnd);
  const daysPassed = isCurrentPeriod
    ? clamp(daysBetween(periodStart, new Date(currentDay.getTime() + MS_IN_DAY)), 1, periodDays)
    : periodDays;

  const remainingDays = isCurrentPeriod
    ? Math.max(1, daysBetween(currentDay, periodEnd))
    : periodDays;

  const averageDailyExpense = daysPassed > 0 ? Math.round(totalExpense / daysPassed) : 0;
  const upcomingSubscriptionsAmount = upcomingSubscriptions.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const forecastExpense = isCurrentPeriod
    ? Math.max(
        totalExpense,
        Math.round(averageDailyExpense * periodDays + upcomingSubscriptionsAmount)
      )
    : totalExpense;

  const dailySafeLimit = isCurrentPeriod
    ? Math.max(0, Math.round((totalIncome - totalExpense - upcomingSubscriptionsAmount) / remainingDays))
    : Math.max(0, Math.round((totalIncome - totalExpense) / periodDays));

  return {
    isCurrentPeriod,
    averageDailyExpense,
    forecastExpense,
    forecastDiff: forecastExpense - totalIncome,
    dailySafeLimit,
  };
};

const calculateFinancialScore = ({
  totalIncome,
  totalExpense,
  forecastExpense,
  savingRate,
  anomaliesCount,
  topExpenseCategories,
  budgetStatuses,
  goalStatuses,
}: {
  totalIncome: number;
  totalExpense: number;
  forecastExpense: number;
  savingRate: number;
  anomaliesCount: number;
  topExpenseCategories: CategoryInsight[];
  budgetStatuses: BudgetStatus[];
  goalStatuses: GoalStatus[];
}) => {
  let score = 50;
  const factors: ScoreFactor[] = [];

  if (totalIncome > totalExpense) {
    score += 20;
    factors.push({
      id: 'income-above-expense',
      title: 'Доходы выше расходов',
      impact: 20,
      description: 'За выбранный период доходы превышают расходы.',
    });
  } else if (totalExpense > 0) {
    score -= 20;
    factors.push({
      id: 'expense-above-income',
      title: 'Расходы выше доходов',
      impact: -20,
      description: 'Расходы превышают доходы или доходы не указаны.',
    });
  }

  if (totalIncome > 0 && forecastExpense <= totalIncome) {
    score += 15;
    factors.push({
      id: 'forecast-safe',
      title: 'Прогноз в пределах дохода',
      impact: 15,
      description: 'При текущем темпе расходы не должны превысить доход.',
    });
  } else if (totalIncome > 0 && forecastExpense > totalIncome) {
    score -= 15;
    factors.push({
      id: 'forecast-risk',
      title: 'Риск перерасхода',
      impact: -15,
      description: 'Прогноз расходов выше дохода за период.',
    });
  }

  if (savingRate >= 20) {
    score += 15;
    factors.push({
      id: 'good-saving-rate',
      title: 'Хороший уровень накопления',
      impact: 15,
      description: 'Свободный остаток составляет 20% или больше.',
    });
  } else if (savingRate < 5 && totalIncome > 0) {
    score -= 10;
    factors.push({
      id: 'low-saving-rate',
      title: 'Низкий свободный остаток',
      impact: -10,
      description: 'После расходов остаётся слишком мало денег.',
    });
  }

  if (anomaliesCount === 0) {
    score += 5;
    factors.push({
      id: 'no-anomalies',
      title: 'Нет явных аномалий',
      impact: 5,
      description: 'Крупные необычные расходы не обнаружены.',
    });
  } else if (anomaliesCount >= 3) {
    score -= 10;
    factors.push({
      id: 'many-anomalies',
      title: 'Несколько аномальных расходов',
      impact: -10,
      description: 'Обнаружено несколько расходов выше обычного уровня.',
    });
  }

  const topCategory = topExpenseCategories[0];

  if (topCategory && topCategory.percent >= 50) {
    score -= 10;
    factors.push({
      id: 'category-concentration-high',
      title: 'Сильная зависимость от одной категории',
      impact: -10,
      description: `Категория «${topCategory.name}» занимает ${topCategory.percent}% расходов.`,
    });
  } else if (topCategory && topCategory.percent >= 35) {
    score -= 5;
    factors.push({
      id: 'category-concentration-medium',
      title: 'Одна категория занимает большую долю',
      impact: -5,
      description: `Категория «${topCategory.name}» занимает ${topCategory.percent}% расходов.`,
    });
  }

  const exceededBudgets = budgetStatuses.filter((budget) => budget.status === 'exceeded');
  const warningBudgets = budgetStatuses.filter((budget) => budget.status === 'warning');

  if (exceededBudgets.length > 0) {
    score -= 10;
    factors.push({
      id: 'budget-exceeded',
      title: 'Есть превышенные бюджеты',
      impact: -10,
      description: `Превышены лимиты: ${exceededBudgets
        .map((budget) => budget.categoryName)
        .join(', ')}.`,
    });
  } else if (budgetStatuses.length > 0 && warningBudgets.length === 0) {
    score += 5;
    factors.push({
      id: 'budgets-normal',
      title: 'Бюджеты под контролем',
      impact: 5,
      description: 'Лимиты по категориям не превышены.',
    });
  }

  const activeGoals = goalStatuses.filter((goal) => goal.progress < 100);
  if (activeGoals.length > 0) {
    score += 5;
    factors.push({
      id: 'active-goals',
      title: 'Есть активные финансовые цели',
      impact: 5,
      description: 'Пользователь ведёт накопления и отслеживает прогресс.',
    });
  }

  const normalizedScore = clamp(Math.round(score), 0, 100);

  return {
    score: normalizedScore,
    label: getFinancialScoreLabel(normalizedScore),
    factors,
  };
};

const buildInsights = ({
  transactionsCount,
  totalIncome,
  totalExpense,
  balance,
  forecastExpense,
  forecastDiff,
  dailySafeLimit,
  topExpenseCategories,
  anomalies,
  budgetStatuses,
  goalStatuses,
  upcomingSubscriptions,
}: {
  transactionsCount: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  forecastExpense: number;
  forecastDiff: number;
  dailySafeLimit: number;
  topExpenseCategories: CategoryInsight[];
  anomalies: AnomalyInsight[];
  budgetStatuses: BudgetStatus[];
  goalStatuses: GoalStatus[];
  upcomingSubscriptions: UpcomingSubscription[];
}): AiInsight[] => {
  const insights: AiInsight[] = [];

  if (transactionsCount === 0) {
    insights.push({
      id: 'empty-data',
      type: 'empty',
      severity: 'low',
      title: 'Добавьте первые операции',
      message: 'После добавления расходов и доходов FinBuddy начнёт строить прогноз и рекомендации.',
      actionLabel: 'Добавить операцию',
      actionRoute: 'ManualInput',
    });

    return insights;
  }

  if (totalIncome > 0 && forecastDiff > 0) {
    insights.push({
      id: 'forecast-risk',
      type: 'forecast',
      severity: 'high',
      title: 'Риск перерасхода',
      message: `При текущем темпе расходы могут превысить доходы на ${formatKzt(
        forecastDiff
      )}.`,
      actionLabel: 'Открыть аналитику',
      actionRoute: 'Stats',
    });
  }

  if (totalIncome > 0 && totalExpense >= totalIncome) {
    insights.push({
      id: 'overspending-current',
      type: 'overspending',
      severity: 'high',
      title: 'Расходы уже достигли дохода',
      message: `За период потрачено ${formatKzt(totalExpense)} при доходе ${formatKzt(
        totalIncome
      )}. Нужно сократить необязательные траты.`,
      actionLabel: 'Посмотреть расходы',
      actionRoute: 'Stats',
    });
  }

  if (totalIncome > 0 && balance > 0 && dailySafeLimit > 0) {
    insights.push({
      id: 'daily-safe-limit',
      type: 'forecast',
      severity: 'low',
      title: 'Безопасный лимит на день',
      message: `Чтобы сохранить баланс, сегодня можно потратить до ${formatKzt(
        dailySafeLimit
      )}.`,
      actionLabel: 'Открыть главную',
      actionRoute: 'Root',
    });
  }

  const topCategory = topExpenseCategories[0];

  if (topCategory && topCategory.percent >= 35) {
    const recommendedLimit = Math.max(0, Math.round(topCategory.amount * 0.85));

    insights.push({
      id: `top-category-${topCategory.id}`,
      type: 'budget',
      severity: topCategory.percent >= 50 ? 'high' : 'medium',
      title: 'Категория требует внимания',
      message: `«${topCategory.name}» занимает ${topCategory.percent}% расходов. Можно попробовать снизить траты до ${formatKzt(
        recommendedLimit
      )}.`,
      actionLabel: 'Открыть бюджет',
      actionRoute: 'Budgets',
      actionPayload: {
        categoryId: topCategory.id,
        recommendedLimit,
      },
    });
  }

  anomalies.slice(0, 2).forEach((anomaly) => {
    insights.push({
      id: `anomaly-${anomaly.id}`,
      type: 'anomaly',
      severity: anomaly.level === 'high' ? 'high' : 'medium',
      title: 'Аномальная трата',
      message: `«${anomaly.title}» — ${formatKzt(anomaly.amount)}. ${anomaly.reason}`,
      actionLabel: 'Открыть историю',
      actionRoute: 'History',
      actionPayload: {
        transactionId: anomaly.transactionId,
      },
    });
  });

  const exceededBudget = budgetStatuses.find((budget) => budget.status === 'exceeded');
  const warningBudget = budgetStatuses.find((budget) => budget.status === 'warning');

  if (exceededBudget) {
    insights.push({
      id: `budget-exceeded-${exceededBudget.categoryId}`,
      type: 'budget',
      severity: 'high',
      title: 'Лимит превышен',
      message: `По категории «${exceededBudget.categoryName}» потрачено ${formatKzt(
        exceededBudget.spentAmount
      )} из ${formatKzt(exceededBudget.limitAmount)}.`,
      actionLabel: 'Открыть бюджет',
      actionRoute: 'Budgets',
      actionPayload: {
        categoryId: exceededBudget.categoryId,
      },
    });
  } else if (warningBudget) {
    insights.push({
      id: `budget-warning-${warningBudget.categoryId}`,
      type: 'budget',
      severity: 'medium',
      title: 'Лимит почти исчерпан',
      message: `По категории «${warningBudget.categoryName}» использовано ${warningBudget.percent}% лимита.`,
      actionLabel: 'Проверить бюджет',
      actionRoute: 'Budgets',
      actionPayload: {
        categoryId: warningBudget.categoryId,
      },
    });
  }

  const soonSubscription = upcomingSubscriptions.find((subscription) => subscription.daysLeft <= 3);

  if (soonSubscription) {
    insights.push({
      id: `subscription-${soonSubscription.id}`,
      type: 'subscription',
      severity: soonSubscription.daysLeft <= 1 ? 'medium' : 'low',
      title: 'Скоро списание',
      message: `«${soonSubscription.title}» спишется ${
        soonSubscription.daysLeft <= 0 ? 'сегодня' : `через ${soonSubscription.daysLeft} дн.`
      }: ${formatKzt(soonSubscription.amount)}.`,
      actionLabel: 'Открыть подписки',
      actionRoute: 'RecurringPayments',
      actionPayload: {
        subscriptionId: soonSubscription.id,
      },
    });
  }

  const stalledGoal = goalStatuses.find(
    (goal) => goal.progress > 0 && goal.progress < 30 && goal.remainingAmount > 0
  );

  if (stalledGoal && balance > 0) {
    const suggestedAmount = Math.min(Math.round(balance * 0.1), stalledGoal.remainingAmount);

    insights.push({
      id: `goal-${stalledGoal.id}`,
      type: 'goal',
      severity: 'low',
      title: 'Можно ускорить цель',
      message: `По цели «${stalledGoal.title}» прогресс ${stalledGoal.progress}%. Можно отложить ${formatKzt(
        suggestedAmount
      )} из свободного остатка.`,
      actionLabel: 'Открыть цели',
      actionRoute: 'Goals',
      actionPayload: {
        goalId: stalledGoal.id,
        suggestedAmount,
      },
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'stable-finances',
      type: 'forecast',
      severity: 'low',
      title: 'Финансы выглядят стабильно',
      message: `Расходы за период: ${formatKzt(totalExpense)}. Прогноз: ${formatKzt(
        forecastExpense
      )}. Продолжайте фиксировать операции.`,
      actionLabel: 'Открыть отчёт',
      actionRoute: 'MonthlyReport',
    });
  }

  return insights
    .sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity])
    .slice(0, 6);
};

export const buildFinanceIntelligence = (
  input: FinanceIntelligenceInput
): FinanceIntelligenceResult => {
  const today = input.today || new Date();
  const periodStart = input.periodStart;
  const periodEnd = input.periodEnd;

  const categoryMap = getCategoryMap(input.categories || []);

  const transactionsInPeriod = (input.transactions || []).filter((tx) =>
    isDateInsidePeriod(tx.transaction_date, periodStart, periodEnd)
  );

  const incomeTransactions = transactionsInPeriod.filter((tx) => tx.type === 'income');
  const expenseTransactions = transactionsInPeriod.filter((tx) => tx.type === 'expense');

  const totalIncome = incomeTransactions.reduce(
    (sum, tx) => sum + safeNumber(tx.amount),
    0
  );

  const totalExpense = expenseTransactions.reduce(
    (sum, tx) => sum + safeNumber(tx.amount),
    0
  );

  const balance = totalIncome - totalExpense;
  const expensePercent =
    totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : totalExpense > 0 ? 100 : 0;

  const savingRate =
    totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  const topExpenseCategories = calculateTopExpenseCategories(
    transactionsInPeriod,
    categoryMap,
    totalExpense
  );

  const anomalies = detectAnomalies(transactionsInPeriod, categoryMap);
  const budgetStatuses = calculateBudgetStatuses(
    input.budgets || [],
    input.categories || [],
    topExpenseCategories
  );

  const goalStatuses = calculateGoalStatuses(input.goals || []);
  const upcomingSubscriptions = getUpcomingSubscriptions(
    input.subscriptions || [],
    today,
    periodEnd
  );

  const forecast = calculateForecast({
    totalIncome,
    totalExpense,
    periodStart,
    periodEnd,
    today,
    upcomingSubscriptions,
  });

  const score = calculateFinancialScore({
    totalIncome,
    totalExpense,
    forecastExpense: forecast.forecastExpense,
    savingRate,
    anomaliesCount: anomalies.length,
    topExpenseCategories,
    budgetStatuses,
    goalStatuses,
  });

  const insights = buildInsights({
    transactionsCount: transactionsInPeriod.length,
    totalIncome,
    totalExpense,
    balance,
    forecastExpense: forecast.forecastExpense,
    forecastDiff: forecast.forecastDiff,
    dailySafeLimit: forecast.dailySafeLimit,
    topExpenseCategories,
    anomalies,
    budgetStatuses,
    goalStatuses,
    upcomingSubscriptions,
  });

  return {
    periodStartIso: periodStart.toISOString(),
    periodEndIso: periodEnd.toISOString(),
    isCurrentPeriod: forecast.isCurrentPeriod,
    transactionsCount: transactionsInPeriod.length,
    incomeTransactionsCount: incomeTransactions.length,
    expenseTransactionsCount: expenseTransactions.length,
    totalIncome,
    totalExpense,
    balance,
    expensePercent,
    savingRate,
    averageDailyExpense: forecast.averageDailyExpense,
    forecastExpense: forecast.forecastExpense,
    forecastDiff: forecast.forecastDiff,
    dailySafeLimit: forecast.dailySafeLimit,
    financialScore: score.score,
    financialScoreLabel: score.label,
    scoreFactors: score.factors,
    topExpenseCategories,
    anomalies,
    budgetStatuses,
    goalStatuses,
    upcomingSubscriptions,
    insights,
  };
};

export const getCurrentMonthPeriod = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return {
    start,
    end,
  };
};
