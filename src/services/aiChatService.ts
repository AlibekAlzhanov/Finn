import { supabase } from './supabase';
import { FINANCE_REGION, KAZAKHSTAN_AI_RULES, formatKzt } from './financeConfig';

type FinanceContext = {
  transactions: any[];
  categories: any[];
  accounts: any[];
  budgets: any[];
  goals: any[];
};

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CHAT_MODEL = 'llama-3.3-70b-versatile';

const getGroqKey = () => {
  const key = process.env.EXPO_PUBLIC_GROQ_API_KEY?.trim();

  if (!key || key.includes('ТВОЙ_') || key.includes('YOUR_')) {
    return null;
  }

  return key;
};

const safeNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const getMonthRange = () => {
  const now = new Date();

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    monthName: now.toLocaleDateString(FINANCE_REGION.locale, {
      month: 'long',
      year: 'numeric',
    }),
  };
};

const getCategoryName = (tx: any) => {
  const categoryData = Array.isArray(tx.categories)
    ? tx.categories[0]
    : tx.categories;

  return (
    categoryData?.name ||
    tx.category_name ||
    tx.category ||
    'Без категории'
  );
};

const groupExpensesByCategory = (transactions: any[]) => {
  const grouped: Record<string, number> = {};

  transactions
    .filter((tx) => tx.type === 'expense')
    .forEach((tx) => {
      const categoryName = getCategoryName(tx);

      grouped[categoryName] =
        (grouped[categoryName] || 0) + safeNumber(tx.amount);
    });

  return grouped;
};

const buildFinanceSummary = (context: FinanceContext) => {
  const transactions = context.transactions || [];

  const totalIncome = transactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + safeNumber(tx.amount), 0);

  const totalExpense = transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + safeNumber(tx.amount), 0);

  const balance = totalIncome - totalExpense;

  const expensesByCategory = groupExpensesByCategory(transactions);

  const topCategories = Object.entries(expensesByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const expensePercent =
    totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;

  const now = new Date();

  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();

  const currentDay = now.getDate();

  const forecastExpense =
    currentDay > 0 ? Math.round((totalExpense / currentDay) * daysInMonth) : 0;

  const remainingDays = Math.max(daysInMonth - currentDay + 1, 1);

  const dailySafeLimit = Math.max(
    0,
    Math.round((totalIncome - totalExpense) / remainingDays)
  );

  return {
    totalIncome,
    totalExpense,
    balance,
    expensePercent,
    forecastExpense,
    dailySafeLimit,
    topCategories,
    expensesByCategory,
  };
};

const localAnswer = (question: string, context: FinanceContext) => {
  const summary = buildFinanceSummary(context);
  const lowerQuestion = question.toLowerCase();

  const topCategory = summary.topCategories[0];

  if (
    lowerQuestion.includes('сколько') &&
    (lowerQuestion.includes('потрат') || lowerQuestion.includes('расход'))
  ) {
    return [
      `За текущий месяц расходы составили ${formatKzt(summary.totalExpense)}.`,
      `Доходы: ${formatKzt(summary.totalIncome)}.`,
      `Остаток: ${formatKzt(summary.balance)}.`,
      topCategory
        ? `Самая крупная категория расходов: ${topCategory[0]} — ${formatKzt(topCategory[1])}.`
        : 'Пока недостаточно расходов для анализа по категориям.',
    ].join('\n');
  }

  if (
    lowerQuestion.includes('накоп') ||
    lowerQuestion.includes('отклады') ||
    lowerQuestion.includes('цель')
  ) {
    const activeGoals = (context.goals || []).filter((goal) => {
      const target = safeNumber(goal.target_amount);
      const current = safeNumber(goal.current_amount);

      return target > current;
    });

    if (activeGoals.length === 0) {
      return [
        'У вас пока нет активных финансовых целей или все цели уже выполнены.',
        'Создайте цель в разделе «Цели», чтобы я мог рассчитать план накопления в тенге.',
      ].join('\n');
    }

    const goal = activeGoals[0];
    const target = safeNumber(goal.target_amount);
    const current = safeNumber(goal.current_amount);
    const remaining = Math.max(target - current, 0);

    return [
      `По цели «${goal.title}» осталось накопить ${formatKzt(remaining)}.`,
      `Ваш текущий остаток за месяц: ${formatKzt(summary.balance)}.`,
      `Безопасный дневной лимит сейчас: ${formatKzt(summary.dailySafeLimit)}.`,
      summary.balance > 0
        ? 'Рекомендация: часть положительного остатка направляйте на цель сразу после поступления дохода.'
        : 'Рекомендация: сначала снизьте расходы, чтобы появился свободный остаток для накоплений.',
    ].join('\n');
  }

  if (
    lowerQuestion.includes('что сократить') ||
    lowerQuestion.includes('эконом') ||
    lowerQuestion.includes('риск')
  ) {
    if (!topCategory) {
      return 'Пока недостаточно расходов для поиска зоны экономии. Добавьте больше операций.';
    }

    const savingPotential = Math.round(topCategory[1] * 0.15);

    return [
      `Главная зона риска: ${topCategory[0]} — ${formatKzt(topCategory[1])}.`,
      `Если сократить эту категорию на 15%, можно сэкономить примерно ${formatKzt(savingPotential)}.`,
      `Доля расходов от дохода: ${summary.expensePercent}%.`,
      'Рекомендация: поставьте лимит в разделе «Бюджеты» и отслеживайте прогресс.',
    ].join('\n');
  }

  return [
    `Краткий анализ за текущий месяц:`,
    `Доходы: ${formatKzt(summary.totalIncome)}`,
    `Расходы: ${formatKzt(summary.totalExpense)}`,
    `Остаток: ${formatKzt(summary.balance)}`,
    `Прогноз расходов до конца месяца: ${formatKzt(summary.forecastExpense)}`,
    `Безопасный дневной лимит: ${formatKzt(summary.dailySafeLimit)}`,
    topCategory
      ? `Самая крупная категория расходов: ${topCategory[0]} — ${formatKzt(topCategory[1])}.`
      : 'Пока недостаточно данных по категориям.',
  ].join('\n');
};

const loadFinanceContext = async (userId: string): Promise<FinanceContext> => {
  const { startIso, endIso } = getMonthRange();

  const [
    transactionsResult,
    categoriesResult,
    accountsResult,
    budgetsResult,
    goalsResult,
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, type, amount, note, tags, transaction_date, categories(name)')
      .eq('user_id', userId)
      .gte('transaction_date', startIso)
      .lt('transaction_date', endIso)
      .order('transaction_date', { ascending: false })
      .limit(200),

    supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', userId),

    supabase
      .from('accounts')
      .select('id, name')
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
    console.error('Ошибка загрузки операций для AI-чата:', transactionsResult.error);
  }

  if (categoriesResult.error) {
    console.error('Ошибка загрузки категорий для AI-чата:', categoriesResult.error);
  }

  if (accountsResult.error) {
    console.error('Ошибка загрузки счетов для AI-чата:', accountsResult.error);
  }

  if (budgetsResult.error) {
    console.error('Ошибка загрузки бюджетов для AI-чата:', budgetsResult.error);
  }

  if (goalsResult.error) {
    console.error('Ошибка загрузки целей для AI-чата:', goalsResult.error);
  }

  return {
    transactions: transactionsResult.data || [],
    categories: categoriesResult.data || [],
    accounts: accountsResult.data || [],
    budgets: budgetsResult.data || [],
    goals: goalsResult.data || [],
  };
};

export const askFinanceAi = async (
  userId: string,
  question: string
): Promise<string> => {
  const cleanQuestion = question.trim();

  if (!userId) {
    return 'Пользователь не найден. Перезайдите в аккаунт.';
  }

  if (!cleanQuestion) {
    return 'Введите вопрос по финансам.';
  }

  const context = await loadFinanceContext(userId);
  const summary = buildFinanceSummary(context);
  const { monthName } = getMonthRange();

  const apiKey = getGroqKey();

  if (!apiKey) {
    return localAnswer(cleanQuestion, context);
  }

  const compactTransactions = (context.transactions || []).slice(0, 80).map((tx) => ({
    type: tx.type,
    amount_kzt: safeNumber(tx.amount),
    currency: FINANCE_REGION.currencyCode,
    category: getCategoryName(tx),
    note: tx.note || '',
    tags: tx.tags || '',
    date: tx.transaction_date,
  }));

  const compactBudgets = (context.budgets || []).map((budget) => ({
    category_id: budget.category_id,
    limit_amount_kzt: safeNumber(budget.limit_amount),
    currency: FINANCE_REGION.currencyCode,
    period: budget.period,
  }));

  const compactGoals = (context.goals || []).map((goal) => ({
    title: goal.title,
    target_amount_kzt: safeNumber(goal.target_amount),
    current_amount_kzt: safeNumber(goal.current_amount),
    currency: FINANCE_REGION.currencyCode,
    deadline: goal.deadline,
  }));

  const financeContext = {
    region: FINANCE_REGION.country,
    currency: {
      code: FINANCE_REGION.currencyCode,
      symbol: FINANCE_REGION.currencySymbol,
      name_ru: FINANCE_REGION.currencyNameRu,
      output_format: '25 000 ₸',
    },
    period: monthName,
    summary: {
      totalIncomeKzt: summary.totalIncome,
      totalExpenseKzt: summary.totalExpense,
      balanceKzt: summary.balance,
      expensePercent: summary.expensePercent,
      forecastExpenseKzt: summary.forecastExpense,
      dailySafeLimitKzt: summary.dailySafeLimit,
      topCategoriesKzt: summary.topCategories,
    },
    transactions: compactTransactions,
    budgets: compactBudgets,
    goals: compactGoals,
  };

  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          {
            role: 'system',
            content: `
Ты AI-финансовый ассистент приложения FinBuddy.

${KAZAKHSTAN_AI_RULES}

Строгие правила:
1. Все суммы считай в казахстанских тенге.
2. В ответе используй только формат "25 000 ₸".
3. Не пиши "рублей", "руб.", "₽", "RUB".
4. Не конвертируй тенге в другую валюту.
5. Используй только переданный финансовый контекст.
6. Не выдумывай операции, счета, категории и суммы.
7. Отвечай кратко, конкретно и полезно.
`,
          },
          {
            role: 'user',
            content: `
Финансовый контекст пользователя:
${JSON.stringify(financeContext, null, 2)}

Вопрос пользователя:
${cleanQuestion}

Напомни себе: все суммы в ответе должны быть в тенге, формат "25 000 ₸".
`,
          },
        ],
        temperature: 0.25,
        max_tokens: 800,
      }),
    });

    const rawText = await response.text();

    if (!response.ok) {
      console.error('AI Chat Groq Error Status:', response.status);
      console.error('AI Chat Groq Error Body:', rawText);

      return localAnswer(cleanQuestion, context);
    }

    const data = JSON.parse(rawText);
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return localAnswer(cleanQuestion, context);
    }

    return content
      .trim()
      .replace(/руб(лей|ля|ль|\.|)/gi, '₸')
      .replace(/₽/g, '₸')
      .replace(/RUB/gi, 'KZT');
  } catch (error) {
    console.error('Ошибка AI-чата:', error);
    return localAnswer(cleanQuestion, context);
  }
};
