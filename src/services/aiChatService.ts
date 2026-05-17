import { supabase } from './supabase';
import {
  buildFinanceIntelligence,
  FinanceBudget,
  FinanceCategory,
  FinanceGoal,
  FinanceSubscription,
  FinanceTransaction,
  getCurrentMonthPeriod,
} from './financeIntelligenceService';
import { formatKzt } from './financeConfig';
import { askFinanceAssistant, FinanceAiMode } from './aiGatewayService';

export type AskFinanceAiParams = {
  userId: string;
  question: string;
  periodStart?: Date | string;
  periodEnd?: Date | string;
  mode?: FinanceAiMode;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: Date | string | undefined | null) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeParams = (
  paramsOrUserId: string | AskFinanceAiParams,
  legacyQuestion?: string
): AskFinanceAiParams => {
  if (typeof paramsOrUserId === 'string') {
    return {
      userId: paramsOrUserId,
      question: legacyQuestion || '',
      mode: 'chat',
    };
  }

  return {
    ...paramsOrUserId,
    mode: paramsOrUserId.mode || 'chat',
  };
};

const formatPeriodName = (start: Date, end: Date) => {
  const startText = start.toLocaleDateString('ru-KZ', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const endSafe = new Date(end);
  endSafe.setDate(endSafe.getDate() - 1);

  const endText = endSafe.toLocaleDateString('ru-KZ', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return `${startText} — ${endText}`;
};

const loadFinanceContext = async (params: AskFinanceAiParams) => {
  const fallbackPeriod = getCurrentMonthPeriod();
  const periodStart = toDate(params.periodStart) || fallbackPeriod.start;
  const periodEnd = toDate(params.periodEnd) || fallbackPeriod.end;

  const [
    transactionsResult,
    categoriesResult,
    budgetsResult,
    goalsResult,
    subscriptionsResult,
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, type, amount, transaction_date, category_id, note, tags')
      .eq('user_id', params.userId)
      .gte('transaction_date', periodStart.toISOString())
      .lt('transaction_date', periodEnd.toISOString())
      .order('transaction_date', { ascending: false }),

    supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', params.userId),

    supabase
      .from('budgets')
      .select('id, category_id, limit_amount, period')
      .eq('user_id', params.userId),

    supabase
      .from('goals')
      .select('id, title, target_amount, current_amount, deadline')
      .eq('user_id', params.userId),

    supabase
      .from('recurring_payments')
      .select('id, title, amount, next_payment_date, is_active')
      .eq('user_id', params.userId)
      .eq('is_active', true)
      .order('next_payment_date', { ascending: true }),
  ]);

  if (transactionsResult.error) throw transactionsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;

  if (budgetsResult.error) {
    console.error('Ошибка загрузки бюджетов для локального AI fallback:', budgetsResult.error);
  }

  if (goalsResult.error) {
    console.error('Ошибка загрузки целей для локального AI fallback:', goalsResult.error);
  }

  if (subscriptionsResult.error) {
    console.error('Ошибка загрузки подписок для локального AI fallback:', subscriptionsResult.error);
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
    periodStart,
    periodEnd,
  });

  return {
    periodStart,
    periodEnd,
    periodName: formatPeriodName(periodStart, periodEnd),
    transactions,
    categories,
    budgets,
    goals,
    subscriptions,
    intelligence,
  };
};

const buildLocalAnswer = async (params: AskFinanceAiParams) => {
  const context = await loadFinanceContext(params);
  const intelligence = context.intelligence;
  const topCategory = intelligence.topExpenseCategories[0];
  const mainInsight = intelligence.insights[0];

  const lines = [
    'AI-сервер временно недоступен, поэтому показан локальный анализ FinBuddy.',
    '',
    `Период: ${context.periodName}`,
    `Доходы: ${formatKzt(intelligence.totalIncome)}`,
    `Расходы: ${formatKzt(intelligence.totalExpense)}`,
    `Баланс: ${formatKzt(intelligence.balance)}`,
    `Финансовое состояние: ${intelligence.financialScore}/100 — ${intelligence.financialScoreLabel}`,
    `Прогноз расходов: ${formatKzt(intelligence.forecastExpense)}`,
    `Безопасный дневной лимит: ${formatKzt(intelligence.dailySafeLimit)}`,
  ];

  if (topCategory) {
    lines.push(
      '',
      `Главная категория расходов: ${topCategory.name} — ${formatKzt(topCategory.amount)} (${topCategory.percent}%).`
    );
  }

  if (mainInsight) {
    lines.push('', `Что важно сейчас: ${mainInsight.title}. ${mainInsight.message}`);
  }

  if (intelligence.anomalies.length > 0) {
    lines.push(
      '',
      `Аномальные расходы: ${intelligence.anomalies
        .slice(0, 3)
        .map((item) => `${item.title} — ${formatKzt(item.amount)}`)
        .join('; ')}.`
    );
  }

  const totalExpense = intelligence.totalExpense;
  const recommendedCut = topCategory ? Math.round(topCategory.amount * 0.1) : 0;

  if (topCategory && recommendedCut > 0 && totalExpense > 0) {
    lines.push(
      '',
      `Рекомендация: попробуй снизить категорию «${topCategory.name}» примерно на ${formatKzt(recommendedCut)}.`
    );
  } else {
    lines.push(
      '',
      'Рекомендация: добавь больше операций, чтобы FinBuddy мог дать точные персональные советы.'
    );
  }

  return lines.join('\n');
};

export const askFinanceAi = async (
  paramsOrUserId: string | AskFinanceAiParams,
  legacyQuestion?: string
): Promise<string> => {
  const params = normalizeParams(paramsOrUserId, legacyQuestion);
  const cleanQuestion = params.question.trim();

  if (!params.userId || !cleanQuestion) {
    return 'Напишите вопрос по финансам, и я помогу его разобрать.';
  }

  try {
    return await askFinanceAssistant({
      question: cleanQuestion,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      mode: params.mode || 'chat',
    });
  } catch (error) {
    console.error('finance-ai Edge Function недоступна, используется fallback:', error);
    return buildLocalAnswer(params);
  }
};
