import { supabase } from './supabase';
import { formatKzt } from './financeConfig';

export type MonthlyReportCategory = {
  name: string;
  amount: number;
  percent: number;
};

export type MonthlyReportBudgetStatus = {
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  spentAmount: number;
  percent: number;
  remainingAmount: number;
  status: 'normal' | 'warning' | 'exceeded';
};

export type MonthlyReportGoalStatus = {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  progress: number;
  remainingAmount: number;
  deadline: string | null;
};

export type MonthlyReportData = {
  periodName: string;
  startIso: string;
  endIso: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  expensePercent: number;
  forecastExpense: number;
  dailyAverageExpense: number;
  dailySafeLimit: number;
  financialScore: number;
  financialScoreLabel: string;
  topExpenseCategories: MonthlyReportCategory[];
  topIncomeCategories: MonthlyReportCategory[];
  budgetStatuses: MonthlyReportBudgetStatus[];
  goalStatuses: MonthlyReportGoalStatus[];
  transactionsCount: number;
  incomeTransactionsCount: number;
  expenseTransactionsCount: number;
  conclusion: string;
  recommendation: string;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getCategoryNameFromTransaction = (tx: any) => {
  const categoryData = Array.isArray(tx.categories)
    ? tx.categories[0]
    : tx.categories;

  return categoryData?.name || 'Без категории';
};

export const getCurrentMonthRange = () => {
  const now = new Date();

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    periodName: now.toLocaleDateString('ru-KZ', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

const groupByCategory = (
  transactions: any[],
  type: 'income' | 'expense'
): MonthlyReportCategory[] => {
  const grouped: Record<string, number> = {};

  transactions
    .filter((tx) => tx.type === type)
    .forEach((tx) => {
      const categoryName = getCategoryNameFromTransaction(tx);

      grouped[categoryName] =
        (grouped[categoryName] || 0) + safeNumber(tx.amount);
    });

  const total = Object.values(grouped).reduce((sum, value) => sum + value, 0);

  return Object.entries(grouped)
    .map(([name, amount]) => ({
      name,
      amount,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
};

const calculateForecastExpense = (totalExpense: number) => {
  const now = new Date();

  const currentDay = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();

  if (currentDay <= 0) return totalExpense;

  return Math.round((totalExpense / currentDay) * daysInMonth);
};

const calculateDailySafeLimit = (totalIncome: number, totalExpense: number) => {
  const now = new Date();

  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();

  const remainingDays = Math.max(daysInMonth - now.getDate() + 1, 1);
  const remainingMoney = totalIncome - totalExpense;

  if (remainingMoney <= 0) return 0;

  return Math.round(remainingMoney / remainingDays);
};

const calculateFinancialScore = (
  totalIncome: number,
  totalExpense: number,
  forecastExpense: number,
  budgetStatuses: MonthlyReportBudgetStatus[],
  goalStatuses: MonthlyReportGoalStatus[]
) => {
  let score = 50;

  if (totalIncome > totalExpense) score += 20;
  else score -= 20;

  if (totalIncome > 0 && forecastExpense <= totalIncome) score += 15;
  else if (totalIncome > 0) score -= 15;

  const savingRate =
    totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

  if (savingRate >= 20) score += 10;
  else if (savingRate < 5) score -= 10;

  const exceededBudgets = budgetStatuses.filter(
    (budget) => budget.status === 'exceeded'
  ).length;

  if (budgetStatuses.length > 0 && exceededBudgets === 0) score += 10;
  if (exceededBudgets > 0) score -= 10;

  const hasActiveGoals = goalStatuses.some((goal) => goal.progress < 100);
  if (hasActiveGoals) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
};

const getFinancialScoreLabel = (score: number) => {
  if (score >= 80) return 'Отличное финансовое состояние';
  if (score >= 60) return 'Хорошее финансовое состояние';
  if (score >= 40) return 'Среднее финансовое состояние';
  return 'Высокий риск перерасхода';
};

const buildConclusion = (
  totalIncome: number,
  totalExpense: number,
  expensePercent: number,
  forecastExpense: number
) => {
  if (totalIncome <= 0 && totalExpense > 0) {
    return 'В выбранном месяце расходы уже есть, но доходы не зафиксированы.';
  }

  if (totalIncome > 0 && totalExpense > totalIncome) {
    return 'Расходы превышают доходы. Нужно срочно пересмотреть необязательные траты.';
  }

  if (totalIncome > 0 && forecastExpense > totalIncome) {
    return 'При текущем темпе расходов к концу месяца возможен перерасход.';
  }

  if (expensePercent <= 50 && totalIncome > 0) {
    return 'Расходы находятся под контролем, есть потенциал для накоплений.';
  }

  if (expensePercent >= 75) {
    return 'Большая часть дохода уже израсходована. Рекомендуется усилить контроль бюджета.';
  }

  return 'Финансовое состояние за месяц стабильное.';
};

const buildRecommendation = (
  topExpenseCategories: MonthlyReportCategory[],
  budgetStatuses: MonthlyReportBudgetStatus[],
  goalStatuses: MonthlyReportGoalStatus[]
) => {
  const exceededBudget = budgetStatuses.find((budget) => budget.status === 'exceeded');

  if (exceededBudget) {
    return `Лимит по категории «${exceededBudget.categoryName}» превышен. Рекомендуется сократить расходы в этой категории или пересмотреть лимит.`;
  }

  const topCategory = topExpenseCategories[0];

  if (topCategory) {
    return `Самая крупная категория расходов — «${topCategory.name}» (${formatKzt(topCategory.amount)}). Попробуйте снизить ее на 10–15%.`;
  }

  const activeGoal = goalStatuses.find((goal) => goal.progress < 100);

  if (activeGoal) {
    return `Есть активная цель «${activeGoal.title}». Направляйте часть свободного остатка на ее достижение.`;
  }

  return 'Продолжайте регулярно фиксировать операции, чтобы отчет был точнее.';
};

export const loadMonthlyReport = async (
  userId: string
): Promise<MonthlyReportData | null> => {
  if (!userId) return null;

  const { startIso, endIso, periodName } = getCurrentMonthRange();

  const [
    transactionsResult,
    categoriesResult,
    budgetsResult,
    goalsResult,
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, type, amount, note, tags, transaction_date, category_id, categories(name)')
      .eq('user_id', userId)
      .gte('transaction_date', startIso)
      .lt('transaction_date', endIso)
      .order('transaction_date', { ascending: false }),

    supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', userId),

    supabase
      .from('budgets')
      .select('id, category_id, limit_amount, period')
      .eq('user_id', userId),

    supabase
      .from('goals')
      .select('id, title, target_amount, current_amount, deadline')
      .eq('user_id', userId),
  ]);

  if (transactionsResult.error) {
    console.error('Ошибка загрузки операций для отчета:', transactionsResult.error);
    return null;
  }

  if (categoriesResult.error) {
    console.error('Ошибка загрузки категорий для отчета:', categoriesResult.error);
  }

  if (budgetsResult.error) {
    console.error('Ошибка загрузки бюджетов для отчета:', budgetsResult.error);
  }

  if (goalsResult.error) {
    console.error('Ошибка загрузки целей для отчета:', goalsResult.error);
  }

  const transactions = transactionsResult.data || [];
  const categories = categoriesResult.data || [];
  const budgets = budgetsResult.data || [];
  const goals = goalsResult.data || [];

  const incomeTransactions = transactions.filter((tx) => tx.type === 'income');
  const expenseTransactions = transactions.filter((tx) => tx.type === 'expense');

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
    totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;

  const forecastExpense = calculateForecastExpense(totalExpense);

  const now = new Date();
  const dailyAverageExpense =
    now.getDate() > 0 ? Math.round(totalExpense / now.getDate()) : totalExpense;

  const dailySafeLimit = calculateDailySafeLimit(totalIncome, totalExpense);

  const topExpenseCategories = groupByCategory(transactions, 'expense');
  const topIncomeCategories = groupByCategory(transactions, 'income');

  const spentByCategoryId: Record<string, number> = {};

  expenseTransactions.forEach((tx: any) => {
    const categoryId = tx.category_id;

    if (!categoryId) return;

    spentByCategoryId[categoryId] =
      (spentByCategoryId[categoryId] || 0) + safeNumber(tx.amount);
  });

  const budgetStatuses: MonthlyReportBudgetStatus[] = budgets.map((budget: any) => {
    const category = categories.find((item: any) => item.id === budget.category_id);
    const spentAmount = spentByCategoryId[budget.category_id] || 0;
    const limitAmount = safeNumber(budget.limit_amount);
    const percent =
      limitAmount > 0 ? Math.round((spentAmount / limitAmount) * 100) : 0;

    let status: MonthlyReportBudgetStatus['status'] = 'normal';

    if (percent >= 100) status = 'exceeded';
    else if (percent >= 80) status = 'warning';

    return {
      categoryId: budget.category_id,
      categoryName: category?.name || 'Категория',
      limitAmount,
      spentAmount,
      percent,
      remainingAmount: Math.max(limitAmount - spentAmount, 0),
      status,
    };
  });

  const goalStatuses: MonthlyReportGoalStatus[] = goals.map((goal: any) => {
    const targetAmount = safeNumber(goal.target_amount);
    const currentAmount = safeNumber(goal.current_amount);
    const progress =
      targetAmount > 0 ? Math.min(Math.round((currentAmount / targetAmount) * 100), 100) : 0;

    return {
      id: goal.id,
      title: goal.title,
      targetAmount,
      currentAmount,
      progress,
      remainingAmount: Math.max(targetAmount - currentAmount, 0),
      deadline: goal.deadline || null,
    };
  });

  const financialScore = calculateFinancialScore(
    totalIncome,
    totalExpense,
    forecastExpense,
    budgetStatuses,
    goalStatuses
  );

  const financialScoreLabel = getFinancialScoreLabel(financialScore);

  const conclusion = buildConclusion(
    totalIncome,
    totalExpense,
    expensePercent,
    forecastExpense
  );

  const recommendation = buildRecommendation(
    topExpenseCategories,
    budgetStatuses,
    goalStatuses
  );

  return {
    periodName,
    startIso,
    endIso,
    totalIncome,
    totalExpense,
    balance,
    expensePercent,
    forecastExpense,
    dailyAverageExpense,
    dailySafeLimit,
    financialScore,
    financialScoreLabel,
    topExpenseCategories,
    topIncomeCategories,
    budgetStatuses,
    goalStatuses,
    transactionsCount: transactions.length,
    incomeTransactionsCount: incomeTransactions.length,
    expenseTransactionsCount: expenseTransactions.length,
    conclusion,
    recommendation,
  };
};

export const buildPlainTextMonthlyReport = (report: MonthlyReportData) => {
  const topExpenses =
    report.topExpenseCategories.length > 0
      ? report.topExpenseCategories
          .slice(0, 5)
          .map(
            (item, index) =>
              `${index + 1}. ${item.name}: ${formatKzt(item.amount)} (${item.percent}%)`
          )
          .join('\n')
      : 'Нет расходов по категориям.';

  const budgets =
    report.budgetStatuses.length > 0
      ? report.budgetStatuses
          .slice(0, 5)
          .map(
            (item) =>
              `${item.categoryName}: ${formatKzt(item.spentAmount)} / ${formatKzt(item.limitAmount)} (${item.percent}%)`
          )
          .join('\n')
      : 'Бюджеты не установлены.';

  const goals =
    report.goalStatuses.length > 0
      ? report.goalStatuses
          .slice(0, 5)
          .map(
            (item) =>
              `${item.title}: ${formatKzt(item.currentAmount)} / ${formatKzt(item.targetAmount)} (${item.progress}%)`
          )
          .join('\n')
      : 'Финансовые цели не созданы.';

  return [
    `Финансовый отчет FinBuddy за ${report.periodName}`,
    '',
    `Доходы: ${formatKzt(report.totalIncome)}`,
    `Расходы: ${formatKzt(report.totalExpense)}`,
    `Остаток: ${formatKzt(report.balance)}`,
    `Доля расходов от дохода: ${report.expensePercent}%`,
    `Прогноз расходов до конца месяца: ${formatKzt(report.forecastExpense)}`,
    `Безопасный дневной лимит: ${formatKzt(report.dailySafeLimit)}`,
    `Финансовый рейтинг: ${report.financialScore}/100 — ${report.financialScoreLabel}`,
    '',
    'Топ расходов:',
    topExpenses,
    '',
    'Бюджеты:',
    budgets,
    '',
    'Финансовые цели:',
    goals,
    '',
    `Вывод: ${report.conclusion}`,
    `Рекомендация: ${report.recommendation}`,
  ].join('\n');
};
