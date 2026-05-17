import { supabase } from './supabase';
import { chargeDueSubscriptions } from './subscriptionService';
import {
  buildFinanceIntelligence,
  getCurrentMonthPeriod,
  FinanceBudget,
  FinanceCategory,
  FinanceGoal,
  FinanceIntelligenceResult,
  FinanceSubscription,
  FinanceTransaction,
} from './financeIntelligenceService';

export type FinanceIntelligenceLoadResult = {
  intelligence: FinanceIntelligenceResult;
  totalBalance: number;
  raw: {
    transactions: FinanceTransaction[];
    categories: FinanceCategory[];
    budgets: FinanceBudget[];
    goals: FinanceGoal[];
    subscriptions: FinanceSubscription[];
  };
  meta: {
    periodStart: Date;
    periodEnd: Date;
    chargedSubscriptionsCount: number;
  };
};

export type LoadFinanceIntelligenceParams = {
  userId: string;
  periodStart?: Date;
  periodEnd?: Date;
  autoChargeSubscriptions?: boolean;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getMonthPeriod = (date = new Date()) => {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
};

export const getYearPeriod = (date = new Date()) => {
  return {
    start: new Date(date.getFullYear(), 0, 1),
    end: new Date(date.getFullYear() + 1, 0, 1),
  };
};

export const calculateTotalBalance = (transactions: FinanceTransaction[]) => {
  return transactions.reduce((sum, tx) => {
    const amount = safeNumber(tx.amount);

    if (tx.type === 'income') return sum + amount;
    if (tx.type === 'expense') return sum - amount;

    return sum;
  }, 0);
};

const throwIfError = (label: string, error: unknown) => {
  if (error) {
    console.error(label, error);
    throw error;
  }
};

export const loadFinanceIntelligence = async ({
  userId,
  periodStart,
  periodEnd,
  autoChargeSubscriptions = false,
}: LoadFinanceIntelligenceParams): Promise<FinanceIntelligenceLoadResult> => {
  if (!userId) {
    throw new Error('userId is required for loadFinanceIntelligence');
  }

  const fallbackPeriod = getCurrentMonthPeriod();
  const start = periodStart || fallbackPeriod.start;
  const end = periodEnd || fallbackPeriod.end;

  let chargedSubscriptionsCount = 0;

  if (autoChargeSubscriptions) {
    try {
      const result = await chargeDueSubscriptions(userId);
      chargedSubscriptionsCount = result?.createdCount || 0;
    } catch (error) {
      console.error('Ошибка автосписаний в intelligence loader:', error);
      chargedSubscriptionsCount = 0;
    }
  }

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
      .eq('user_id', userId)
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
      .eq('is_active', true)
      .order('next_payment_date', { ascending: true }),
  ]);

  throwIfError('Ошибка загрузки операций для intelligence:', transactionsResult.error);
  throwIfError('Ошибка загрузки категорий для intelligence:', categoriesResult.error);
  throwIfError('Ошибка загрузки бюджетов для intelligence:', budgetsResult.error);
  throwIfError('Ошибка загрузки целей для intelligence:', goalsResult.error);
  throwIfError('Ошибка загрузки подписок для intelligence:', subscriptionsResult.error);

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

  return {
    intelligence,
    totalBalance: calculateTotalBalance(transactions),
    raw: {
      transactions,
      categories,
      budgets,
      goals,
      subscriptions,
    },
    meta: {
      periodStart: start,
      periodEnd: end,
      chargedSubscriptionsCount,
    },
  };
};

export const loadCurrentMonthFinanceIntelligence = async (
  userId: string,
  options?: {
    autoChargeSubscriptions?: boolean;
  }
) => {
  const period = getMonthPeriod();

  return loadFinanceIntelligence({
    userId,
    periodStart: period.start,
    periodEnd: period.end,
    autoChargeSubscriptions: options?.autoChargeSubscriptions,
  });
};

export const loadFinanceIntelligenceForPeriod = async ({
  userId,
  periodStart,
  periodEnd,
}: {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
}) => {
  return loadFinanceIntelligence({
    userId,
    periodStart,
    periodEnd,
    autoChargeSubscriptions: false,
  });
};
