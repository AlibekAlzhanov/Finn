import { supabase } from './supabase';

export type SubscriptionRow = {
  id: string;
  user_id: string;
  title: string | null;
  amount: number | string | null;
  account_id: string | null;
  category_id: string | null;
  next_payment_date: string | null;
  start_date?: string | null;
  frequency?: string | null;
  is_active?: boolean | null;
  note?: string | null;
  created_at?: string | null;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseDateOnly = (value: string | null | undefined) => {
  if (!value) return null;

  const [year, month, day] = value.split('-').map((item) => Number(item));

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return null;

  return date;
};

const addOneMonth = (date: Date) => {
  const next = new Date(date);
  const originalDay = next.getDate();

  next.setMonth(next.getMonth() + 1);

  // Если было 31 число, а следующий месяц короче, JS может перескочить.
  // Возвращаем последний день нужного месяца.
  if (next.getDate() !== originalDay) {
    next.setDate(0);
  }

  return next;
};

const isSameMonth = (left: Date, right: Date) => {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
};

const buildSubscriptionOperationKey = (subscriptionId: string, date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `subscription:${subscriptionId}:${date.getFullYear()}-${month}`;
};

const hasTransactionForSubscriptionMonth = async (
  userId: string,
  subscriptionId: string,
  dueDate: Date
) => {
  const operationKey = buildSubscriptionOperationKey(subscriptionId, dueDate);

  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .ilike('note', `%${operationKey}%`)
    .limit(1);

  if (error) throw error;

  return (data || []).length > 0;
};

export const createSubscriptionTransaction = async (
  userId: string,
  subscription: SubscriptionRow,
  dueDate: Date
) => {
  const amount = safeNumber(subscription.amount);

  if (!subscription.account_id) {
    throw new Error('У подписки не выбран счет списания.');
  }

  if (!subscription.category_id) {
    throw new Error('У подписки не выбрана категория.');
  }

  if (amount <= 0) {
    throw new Error('У подписки не указана сумма.');
  }

  const operationKey = buildSubscriptionOperationKey(subscription.id, dueDate);
  const alreadyExists = await hasTransactionForSubscriptionMonth(
    userId,
    subscription.id,
    dueDate
  );

  if (alreadyExists) {
    return {
      created: false,
      operationKey,
    };
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'expense',
    amount,
    account_id: subscription.account_id,
    category_id: subscription.category_id,
    note: `${subscription.title || 'Подписка'} · автосписание · ${operationKey}`,
    tags: ['подписка', operationKey],
    transaction_date: dueDate.toISOString(),
  });

  if (error) throw error;

  return {
    created: true,
    operationKey,
  };
};

export const chargeDueSubscriptions = async (userId: string) => {
  const today = new Date();

  const { data, error } = await supabase
    .from('recurring_payments')
    .select(
      'id, user_id, title, amount, account_id, category_id, next_payment_date, start_date, frequency, is_active, note, created_at'
    )
    .eq('user_id', userId)
    .eq('is_active', true)
    .lte('next_payment_date', toDateOnly(today));

  if (error) throw error;

  const subscriptions = ((data || []).filter(Boolean)) as SubscriptionRow[];

  let createdCount = 0;

  for (const subscription of subscriptions) {
    let dueDate = parseDateOnly(subscription.next_payment_date);

    if (!dueDate) continue;

    // Создаем операции за все пропущенные месяцы, но не дублируем уже созданные.
    // Ограничение 24 итерации защищает от случайно старых дат.
    let guard = 0;

    while (dueDate <= today && guard < 24) {
      const result = await createSubscriptionTransaction(userId, subscription, dueDate);

      if (result.created) createdCount += 1;

      dueDate = addOneMonth(dueDate);
      guard += 1;
    }

    const { error: updateError } = await supabase
      .from('recurring_payments')
      .update({
        next_payment_date: toDateOnly(dueDate),
      })
      .eq('id', subscription.id)
      .eq('user_id', userId);

    if (updateError) throw updateError;
  }

  return {
    checkedCount: subscriptions.length,
    createdCount,
  };
};

export const chargeSubscriptionNow = async (
  userId: string,
  subscription: SubscriptionRow
) => {
  const today = new Date();

  const result = await createSubscriptionTransaction(userId, subscription, today);

  const nextPaymentDate = addOneMonth(today);

  const { error } = await supabase
    .from('recurring_payments')
    .update({
      next_payment_date: toDateOnly(nextPaymentDate),
    })
    .eq('id', subscription.id)
    .eq('user_id', userId);

  if (error) throw error;

  return result;
};

export const normalizeSubscriptionDate = toDateOnly;


export const parseSubscriptionDateOnly = parseDateOnly;
export const formatSubscriptionDateOnly = toDateOnly;

export const daysBetweenToday = (value: string | null | undefined) => {
  const target = parseDateOnly(value);
  const today = parseDateOnly(toDateOnly(new Date()));

  if (!target || !today) return null;

  return Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

export const getUpcomingSubscriptions = async (userId: string, days = 7) => {
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + days);

  const { data, error } = await supabase
    .from('recurring_payments')
    .select(
      'id, user_id, title, amount, account_id, category_id, next_payment_date, start_date, frequency, is_active, note, created_at'
    )
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('next_payment_date', toDateOnly(today))
    .lte('next_payment_date', toDateOnly(maxDate))
    .order('next_payment_date', { ascending: true });

  if (error) throw error;

  return ((data || []).filter(Boolean)) as SubscriptionRow[];
};
