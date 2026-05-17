// Supabase Edge Function: finance-ai
// Deno runtime.
// Deploy:
//   supabase functions deploy finance-ai
// Set secret:
//   supabase secrets set GROQ_API_KEY=your_groq_key

import { createClient } from 'npm:@supabase/supabase-js@2';

type FinanceAiMode = 'chat' | 'analytics' | 'report';

type FinanceAiRequest = {
  question?: string;
  mode?: FinanceAiMode;
  periodStart?: string;
  periodEnd?: string;
};

type FinanceTransaction = {
  id?: string;
  type?: string | null;
  amount?: number | string | null;
  transaction_date?: string | null;
  category_id?: string | null;
  note?: string | null;
};

type FinanceCategory = {
  id: string;
  name: string | null;
  type?: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CHAT_MODEL = 'llama-3.3-70b-versatile';

const json = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: unknown) => {
  if (!value) return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return null;

  return date;
};

const getCurrentMonthPeriod = () => {
  const now = new Date();

  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
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

const formatKzt = (amount: number) => {
  const rounded = Math.round(amount || 0);

  return `${rounded.toLocaleString('ru-KZ')} ₸`;
};

const sanitizeCurrencyText = (text: string) => {
  return text
    .replace(/руб(лей|ля|ль|\.|)/gi, '₸')
    .replace(/₽/g, '₸')
    .replace(/RUB/gi, 'KZT');
};

const getCategoryName = (
  tx: FinanceTransaction,
  categoryMap: Record<string, string>
) => {
  if (tx.category_id && categoryMap[tx.category_id]) {
    return categoryMap[tx.category_id];
  }

  return 'Без категории';
};

const buildTopCategories = (
  transactions: FinanceTransaction[],
  categories: FinanceCategory[],
  totalExpense: number
) => {
  const categoryMap: Record<string, string> = {};

  categories.forEach((category) => {
    categoryMap[category.id] = category.name || 'Без категории';
  });

  const grouped: Record<
    string,
    {
      id: string;
      name: string;
      amount: number;
      count: number;
      percent: number;
    }
  > = {};

  transactions
    .filter((tx) => tx.type === 'expense')
    .forEach((tx) => {
      const id = tx.category_id || 'unknown';
      const amount = safeNumber(tx.amount);

      if (!grouped[id]) {
        grouped[id] = {
          id,
          name: getCategoryName(tx, categoryMap),
          amount: 0,
          count: 0,
          percent: 0,
        };
      }

      grouped[id].amount += amount;
      grouped[id].count += 1;
    });

  return Object.values(grouped)
    .map((item) => ({
      ...item,
      percent:
        totalExpense > 0 ? Math.round((item.amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
};

const detectAnomalies = (
  transactions: FinanceTransaction[],
  categories: FinanceCategory[]
) => {
  const categoryMap: Record<string, string> = {};

  categories.forEach((category) => {
    categoryMap[category.id] = category.name || 'Без категории';
  });

  const expenses = transactions.filter(
    (tx) => tx.type === 'expense' && safeNumber(tx.amount) > 0
  );

  if (expenses.length < 3) return [];

  const amounts = expenses.map((tx) => safeNumber(tx.amount));
  const avg = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const variance =
    amounts.reduce((sum, amount) => sum + Math.pow(amount - avg, 2), 0) /
    amounts.length;
  const stdDev = Math.sqrt(variance);

  return expenses
    .filter((tx) => {
      const amount = safeNumber(tx.amount);
      return amount > avg + stdDev * 1.5 || amount >= avg * 2;
    })
    .sort((a, b) => safeNumber(b.amount) - safeNumber(a.amount))
    .slice(0, 6)
    .map((tx) => ({
      id: tx.id,
      title: tx.note || getCategoryName(tx, categoryMap),
      categoryName: getCategoryName(tx, categoryMap),
      amount: safeNumber(tx.amount),
      reason: `Расход выше обычного уровня. Средний расход: ${formatKzt(avg)}.`,
    }));
};

const buildFinanceSummary = (
  transactions: FinanceTransaction[],
  categories: FinanceCategory[],
  periodStart: Date,
  periodEnd: Date
) => {
  const incomes = transactions.filter((tx) => tx.type === 'income');
  const expenses = transactions.filter((tx) => tx.type === 'expense');

  const totalIncome = incomes.reduce((sum, tx) => sum + safeNumber(tx.amount), 0);
  const totalExpense = expenses.reduce(
    (sum, tx) => sum + safeNumber(tx.amount),
    0
  );

  const balance = totalIncome - totalExpense;
  const expensePercent =
    totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;
  const savingRate =
    totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  const now = new Date();
  const periodDays = Math.max(
    1,
    Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000))
  );

  const elapsedDays =
    now > periodStart && now < periodEnd
      ? Math.max(
          1,
          Math.ceil((now.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000))
        )
      : periodDays;

  const averageDailyExpense = totalExpense / elapsedDays;
  const forecastExpense = Math.round(averageDailyExpense * periodDays);
  const forecastDiff = forecastExpense - totalIncome;

  const remainingDays =
    now > periodStart && now < periodEnd
      ? Math.max(
          1,
          Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        )
      : periodDays;

  const dailySafeLimit = Math.max(
    0,
    Math.round((totalIncome - totalExpense) / remainingDays)
  );

  let score = 50;

  if (totalIncome > totalExpense) score += 20;
  else if (totalExpense > 0) score -= 20;

  if (totalIncome > 0 && forecastExpense <= totalIncome) score += 15;
  else if (totalIncome > 0 && forecastExpense > totalIncome) score -= 15;

  if (savingRate >= 20) score += 15;
  else if (savingRate < 5 && totalIncome > 0) score -= 10;

  const financialScore = Math.max(0, Math.min(100, Math.round(score)));

  const topExpenseCategories = buildTopCategories(
    transactions,
    categories,
    totalExpense
  );
  const anomalies = detectAnomalies(transactions, categories);

  return {
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      name: formatPeriodName(periodStart, periodEnd),
    },
    totalIncome,
    totalExpense,
    balance,
    expensePercent,
    savingRate,
    averageDailyExpense: Math.round(averageDailyExpense),
    forecastExpense,
    forecastDiff,
    dailySafeLimit,
    financialScore,
    transactionsCount: transactions.length,
    incomeTransactionsCount: incomes.length,
    expenseTransactionsCount: expenses.length,
    topExpenseCategories,
    anomalies,
  };
};

const getSystemPrompt = (mode: FinanceAiMode) => {
  const modeInstruction =
    mode === 'analytics'
      ? 'Ты анализируешь выбранный пользователем период. Не переходи на текущий месяц, если указан другой период.'
      : mode === 'report'
        ? 'Ты формируешь краткий финансовый отчёт и план действий.'
        : 'Ты отвечаешь как персональный AI-помощник по финансам внутри приложения FinBuddy.';

  return `
Ты AI-финансовый помощник приложения FinBuddy.

Пользователь находится в Казахстане.
Валюта приложения — казахстанский тенге.
Все суммы выводи только в тенге с символом ₸.
Не используй рубли, ₽ или RUB.

${modeInstruction}

Правила:
1. Не выдумывай операции, суммы, категории и цели.
2. Используй только переданный финансовый контекст.
3. Если данных мало, скажи, каких данных не хватает.
4. Ответ должен быть коротким, практичным и с конкретными действиями.
5. Не давай инвестиционных гарантий.
6. Пиши на русском языке.
`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const groqKey = Deno.env.get('GROQ_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        {
          error:
            'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured in Edge Function environment.',
        },
        500
      );
    }

    if (!groqKey) {
      return json(
        {
          error: 'GROQ_API_KEY is not configured. Run: supabase secrets set GROQ_API_KEY=...',
        },
        500
      );
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return json({ error: 'Missing Authorization Bearer token.' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return json({ error: 'Invalid user token.' }, 401);
    }

    const body = (await req.json()) as FinanceAiRequest;
    const question = String(body.question || '').trim();
    const mode = body.mode || 'chat';

    if (!question) {
      return json({ error: 'question is required.' }, 400);
    }

    const fallbackPeriod = getCurrentMonthPeriod();
    const periodStart = toDate(body.periodStart) || fallbackPeriod.start;
    const periodEnd = toDate(body.periodEnd) || fallbackPeriod.end;

    const [
      transactionsResult,
      categoriesResult,
      budgetsResult,
      goalsResult,
      subscriptionsResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('transactions')
        .select('id, type, amount, transaction_date, category_id, note, tags')
        .eq('user_id', user.id)
        .gte('transaction_date', periodStart.toISOString())
        .lt('transaction_date', periodEnd.toISOString())
        .order('transaction_date', { ascending: false }),

      supabaseAdmin
        .from('categories')
        .select('id, name, type')
        .eq('user_id', user.id),

      supabaseAdmin
        .from('budgets')
        .select('id, category_id, limit_amount, period')
        .eq('user_id', user.id),

      supabaseAdmin
        .from('goals')
        .select('id, title, target_amount, current_amount, deadline')
        .eq('user_id', user.id),

      supabaseAdmin
        .from('recurring_payments')
        .select('id, title, amount, next_payment_date, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('next_payment_date', { ascending: true }),
    ]);

    if (transactionsResult.error) throw transactionsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;

    const transactions = (transactionsResult.data || []) as FinanceTransaction[];
    const categories = (categoriesResult.data || []) as FinanceCategory[];

    const summary = buildFinanceSummary(
      transactions,
      categories,
      periodStart,
      periodEnd
    );

    const compactContext = {
      mode,
      userEmail: user.email,
      summary,
      budgets: budgetsResult.data || [],
      goals: goalsResult.data || [],
      subscriptions: subscriptionsResult.data || [],
      recentTransactions: transactions.slice(0, 35),
    };

    const aiResponse = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(mode),
          },
          {
            role: 'user',
            content: `
Финансовый контекст пользователя:
${JSON.stringify(compactContext, null, 2)}

Вопрос пользователя:
${question}

Ответь на русском языке. Все суммы указывай в тенге, формат "25 000 ₸".
`,
          },
        ],
        temperature: mode === 'chat' ? 0.25 : 0.18,
        max_tokens: mode === 'chat' ? 900 : 1100,
      }),
    });

    const aiRawText = await aiResponse.text();

    if (!aiResponse.ok) {
      console.error('Groq error status:', aiResponse.status);
      console.error('Groq error body:', aiRawText);

      return json(
        {
          error: 'AI provider request failed.',
          providerStatus: aiResponse.status,
        },
        502
      );
    }

    const aiData = JSON.parse(aiRawText);
    const answer = aiData?.choices?.[0]?.message?.content;

    if (!answer) {
      return json({ error: 'AI provider returned empty answer.' }, 502);
    }

    return json({
      answer: sanitizeCurrencyText(String(answer).trim()),
      mode,
      period: summary.period,
      source: 'edge-function',
    });
  } catch (error) {
    console.error('finance-ai function error:', error);

    return json(
      {
        error: error instanceof Error ? error.message : 'Unknown finance-ai error.',
      },
      500
    );
  }
});
