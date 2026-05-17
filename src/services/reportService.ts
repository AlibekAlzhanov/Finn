import { supabase } from './supabase';
import { formatKzt } from './financeConfig';
import {
  AiInsight,
  AnomalyInsight,
  BudgetStatus,
  buildFinanceIntelligence,
  CategoryInsight,
  FinanceBudget,
  FinanceCategory,
  FinanceGoal,
  FinanceSubscription,
  FinanceTransaction,
  getCurrentMonthPeriod,
  GoalStatus,
  ScoreFactor,
} from './financeIntelligenceService';

export type MonthlyReportCategory = CategoryInsight;

export type MonthlyReportBudgetStatus = BudgetStatus;
export type MonthlyReportGoalStatus = GoalStatus;

export type MonthlyReportData = {
  periodName: string;
  startIso: string;
  endIso: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  expensePercent: number;
  savingRate: number;
  forecastExpense: number;
  dailyAverageExpense: number;
  dailySafeLimit: number;
  financialScore: number;
  financialScoreLabel: string;
  scoreFactors: ScoreFactor[];
  topExpenseCategories: MonthlyReportCategory[];
  topIncomeCategories: MonthlyReportCategory[];
  budgetStatuses: MonthlyReportBudgetStatus[];
  goalStatuses: MonthlyReportGoalStatus[];
  anomalies: AnomalyInsight[];
  insights: AiInsight[];
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

const getCategoryNameFromTransaction = (
  tx: FinanceTransaction,
  categoryMap: Record<string, string>
) => {
  if (tx.category_name) return tx.category_name;

  const embedded = Array.isArray(tx.categories)
    ? tx.categories[0]?.name
    : tx.categories?.name;

  if (embedded) return embedded;

  if (tx.category_id && categoryMap[tx.category_id]) return categoryMap[tx.category_id];

  return 'Без категории';
};

export const getCurrentMonthRange = () => {
  const { start, end } = getCurrentMonthPeriod();
  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    periodName: new Date().toLocaleDateString('ru-KZ', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

const buildCategoryMap = (categories: FinanceCategory[]) => {
  const map: Record<string, string> = {};

  categories.forEach((category) => {
    if (category.id) map[category.id] = category.name || 'Без категории';
  });

  return map;
};

const groupByCategory = (
  transactions: FinanceTransaction[],
  categories: FinanceCategory[],
  type: 'income' | 'expense'
): MonthlyReportCategory[] => {
  const categoryMap = buildCategoryMap(categories);
  const grouped: Record<string, MonthlyReportCategory> = {};

  transactions
    .filter((tx) => tx.type === type)
    .forEach((tx) => {
      const id = tx.category_id || 'unknown';
      const name = getCategoryNameFromTransaction(tx, categoryMap);
      const amount = safeNumber(tx.amount);

      if (!grouped[id]) {
        grouped[id] = {
          id,
          name,
          amount: 0,
          count: 0,
          percent: 0,
        };
      }

      grouped[id].amount += amount;
      grouped[id].count += 1;
    });

  const total = Object.values(grouped).reduce((sum, item) => sum + item.amount, 0);

  return Object.values(grouped)
    .map((item) => ({
      ...item,
      percent: total > 0 ? Math.round((item.amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
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
  goalStatuses: MonthlyReportGoalStatus[],
  insights: AiInsight[]
) => {
  const highInsight = insights.find((insight) => insight.severity === 'high');

  if (highInsight) {
    return highInsight.message;
  }

  const exceededBudget = budgetStatuses.find((budget) => budget.status === 'exceeded');

  if (exceededBudget) {
    return `Лимит по категории «${exceededBudget.categoryName}» превышен. Рекомендуется сократить расходы в этой категории или пересмотреть лимит.`;
  }

  const topCategory = topExpenseCategories[0];

  if (topCategory) {
    return `Самая крупная категория расходов — «${topCategory.name}» (${formatKzt(topCategory.amount)}). Попробуйте снизить её на 10–15%.`;
  }

  const activeGoal = goalStatuses.find((goal) => goal.progress < 100);

  if (activeGoal) {
    return `Есть активная цель «${activeGoal.title}». Направляйте часть свободного остатка на её достижение.`;
  }

  return 'Продолжайте регулярно фиксировать операции, чтобы отчёт был точнее.';
};

export const loadMonthlyReport = async (
  userId: string
): Promise<MonthlyReportData | null> => {
  if (!userId) return null;

  const { start, end, startIso, endIso, periodName } = getCurrentMonthRange();

  const [
    transactionsResult,
    categoriesResult,
    budgetsResult,
    goalsResult,
    subscriptionsResult,
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

    supabase
      .from('recurring_payments')
      .select('id, title, amount, next_payment_date, is_active')
      .eq('user_id', userId)
      .eq('is_active', true),
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

  if (subscriptionsResult.error) {
    console.error('Ошибка загрузки подписок для отчета:', subscriptionsResult.error);
  }

  const transactions = ((transactionsResult.data || []).filter(Boolean)) as FinanceTransaction[];
  const categories = ((categoriesResult.data || []).filter(Boolean)) as FinanceCategory[];
  const budgets = ((budgetsResult.data || []).filter(Boolean)) as FinanceBudget[];
  const goals = ((goalsResult.data || []).filter(Boolean)) as FinanceGoal[];
  const subscriptions = ((subscriptionsResult.data || []).filter(Boolean)) as FinanceSubscription[];

  const intelligence = buildFinanceIntelligence({
    transactions,
    categories,
    budgets,
    goals,
    subscriptions,
    periodStart: start,
    periodEnd: end,
  });

  const topIncomeCategories = groupByCategory(transactions, categories, 'income');

  const conclusion = buildConclusion(
    intelligence.totalIncome,
    intelligence.totalExpense,
    intelligence.expensePercent,
    intelligence.forecastExpense
  );

  const recommendation = buildRecommendation(
    intelligence.topExpenseCategories,
    intelligence.budgetStatuses,
    intelligence.goalStatuses,
    intelligence.insights
  );

  return {
    periodName,
    startIso,
    endIso,
    totalIncome: intelligence.totalIncome,
    totalExpense: intelligence.totalExpense,
    balance: intelligence.balance,
    expensePercent: intelligence.expensePercent,
    savingRate: intelligence.savingRate,
    forecastExpense: intelligence.forecastExpense,
    dailyAverageExpense: intelligence.averageDailyExpense,
    dailySafeLimit: intelligence.dailySafeLimit,
    financialScore: intelligence.financialScore,
    financialScoreLabel: intelligence.financialScoreLabel,
    scoreFactors: intelligence.scoreFactors,
    topExpenseCategories: intelligence.topExpenseCategories,
    topIncomeCategories,
    budgetStatuses: intelligence.budgetStatuses,
    goalStatuses: intelligence.goalStatuses,
    anomalies: intelligence.anomalies,
    insights: intelligence.insights,
    transactionsCount: intelligence.transactionsCount,
    incomeTransactionsCount: intelligence.incomeTransactionsCount,
    expenseTransactionsCount: intelligence.expenseTransactionsCount,
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

  const factors =
    report.scoreFactors.length > 0
      ? report.scoreFactors
          .map((item) => `${item.impact > 0 ? '+' : ''}${item.impact}: ${item.title}`)
          .join('\n')
      : 'Недостаточно факторов для объяснения рейтинга.';

  const anomalies =
    report.anomalies.length > 0
      ? report.anomalies
          .slice(0, 5)
          .map((item, index) => `${index + 1}. ${item.title}: ${formatKzt(item.amount)}`)
          .join('\n')
      : 'Аномальные расходы не обнаружены.';

  const insights =
    report.insights.length > 0
      ? report.insights
          .slice(0, 5)
          .map((item, index) => `${index + 1}. ${item.title}: ${item.message}`)
          .join('\n')
      : 'Персональные инсайты пока не сформированы.';

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
    `Финансовое состояние: ${report.financialScore}/100 — ${report.financialScoreLabel}`,
    '',
    'Почему такой рейтинг:',
    factors,
    '',
    'Топ расходов:',
    topExpenses,
    '',
    'Аномальные расходы:',
    anomalies,
    '',
    'Что важно сейчас:',
    insights,
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
