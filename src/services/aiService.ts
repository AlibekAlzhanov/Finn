import { supabase } from './supabase';
import { FINANCE_REGION, KAZAKHSTAN_AI_RULES, formatKzt } from './financeConfig';

type Account = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
  type: 'expense' | 'income' | 'transfer' | string;
};

type ParsedTransaction = {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  account_id: string | null;
  to_account_id?: string | null;
  category_id: string | null;
  note: string;
  tags: string;
};

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

const CHAT_MODEL = 'llama-3.3-70b-versatile';
const WHISPER_MODEL = 'whisper-large-v3';

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

const extractJsonObject = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      throw new Error('JSON объект не найден в ответе ИИ');
    }

    return JSON.parse(text.slice(start, end + 1));
  }
};

const sanitizeCurrencyText = (text: string) => {
  return text
    .replace(/руб(лей|ля|ль|\.|)/gi, '₸')
    .replace(/₽/g, '₸')
    .replace(/RUB/gi, 'KZT');
};

const fetchGroqChat = async (
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    max_tokens?: number;
    json?: boolean;
  }
) => {
  const apiKey = getGroqKey();

  if (!apiKey) {
    throw new Error(
      'EXPO_PUBLIC_GROQ_API_KEY не найден или указан неверно. Проверь .env.'
    );
  }

  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.max_tokens ?? 700,
      ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    console.error('Groq API Error Status:', response.status);
    console.error('Groq API Error Body:', rawText);

    throw new Error(`Groq API Error ${response.status}`);
  }

  const data = JSON.parse(rawText);
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    console.error('Пустой ответ Groq:', data);
    throw new Error('Groq вернул пустой ответ');
  }

  return sanitizeCurrencyText(content.trim());
};

const loadUserFinanceDictionaries = async (userId: string) => {
  const [{ data: accounts, error: accountsError }, { data: categories, error: categoriesError }] =
    await Promise.all([
      supabase.from('accounts').select('id, name').eq('user_id', userId),
      supabase.from('categories').select('id, name, type').eq('user_id', userId),
    ]);

  if (accountsError) {
    console.error('Ошибка загрузки счетов:', accountsError);
  }

  if (categoriesError) {
    console.error('Ошибка загрузки категорий:', categoriesError);
  }

  return {
    accounts: (accounts || []) as Account[],
    categories: (categories || []) as Category[],
  };
};

const findCategoryByText = (
  text: string,
  categories: Category[],
  type: 'expense' | 'income' | 'transfer'
) => {
  const lowerText = text.toLowerCase();

  const typeCategories = categories.filter((category) => category.type === type);

  const exactMatch = typeCategories.find((category) =>
    lowerText.includes(category.name.toLowerCase())
  );

  if (exactMatch) return exactMatch;

  const expenseRules: Array<{ keywords: string[]; names: string[] }> = [
    {
      keywords: ['magnum', 'small', 'анвар', 'продукт', 'еда', 'супермаркет', 'магазин'],
      names: ['продукты', 'еда', 'питание'],
    },
    {
      keywords: ['кофе', 'кафе', 'старбакс', 'starbucks', 'ресторан', 'обед', 'ужин'],
      names: ['кафе', 'рестораны', 'еда', 'питание'],
    },
    {
      keywords: ['такси', 'yandex', 'яндекс', 'indrive', 'автобус', 'транспорт', 'kaspi'],
      names: ['транспорт', 'такси'],
    },
    {
      keywords: ['кино', 'netflix', 'spotify', 'игра', 'развлеч'],
      names: ['развлечения', 'подписки'],
    },
    {
      keywords: ['аптека', 'лекар', 'клиника', 'здоров'],
      names: ['здоровье', 'медицина'],
    },
    {
      keywords: ['учеб', 'курс', 'книга', 'университет'],
      names: ['обучение', 'образование'],
    },
  ];

  for (const rule of expenseRules) {
    const hasKeyword = rule.keywords.some((keyword) => lowerText.includes(keyword));

    if (!hasKeyword) continue;

    const category = typeCategories.find((item) =>
      rule.names.some((name) => item.name.toLowerCase().includes(name))
    );

    if (category) return category;
  }

  return typeCategories[0] || categories[0] || null;
};

const buildLocalParsedTransaction = (
  text: string,
  accounts: Account[],
  categories: Category[]
): ParsedTransaction[] => {
  const normalizedText = text.toLowerCase();

  const amountMatch = text
    .replace(/\s/g, '')
    .match(/(\d+(?:[.,]\d+)?)/);

  const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 0;

  if (!amount || amount <= 0) {
    return [];
  }

  const isIncome =
    /зарплат|доход|получил|получила|поступил|поступление|аванс|премия/i.test(
      normalizedText
    );

  const isTransfer =
    /перев[её]л|перевод|с одного счета|на другой счет|между счетами/i.test(
      normalizedText
    );

  const type: 'expense' | 'income' | 'transfer' = isTransfer
    ? 'transfer'
    : isIncome
      ? 'income'
      : 'expense';

  const account =
    accounts.find((item) => normalizedText.includes(item.name.toLowerCase())) ||
    accounts[0] ||
    null;

  const category = findCategoryByText(text, categories, type);

  const cleanNote = text
    .replace(/\d+(?:[.,]\d+)?/g, '')
    .replace(/₸|тг|тенге|kzt/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const tags = cleanNote
    .split(/[,\s]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 3)
    .slice(0, 5)
    .join(', ');

  return [
    {
      type,
      amount,
      account_id: account?.id || null,
      category_id: category?.id || null,
      note: cleanNote || text.trim(),
      tags,
    },
  ];
};

const normalizeTransactions = (
  rawTransactions: any[],
  accounts: Account[],
  categories: Category[]
): ParsedTransaction[] => {
  return (rawTransactions || [])
    .map((item) => {
      const type =
        item?.type === 'income' || item?.type === 'transfer'
          ? item.type
          : 'expense';

      const accountExists = accounts.some((account) => account.id === item?.account_id);

      const categoryExists = categories.some(
        (category) => category.id === item?.category_id
      );

      const fallbackCategory = categories.find((category) => category.type === type);

      return {
        type,
        amount: safeNumber(item?.amount),
        account_id: accountExists ? item.account_id : accounts[0]?.id || null,
        to_account_id: item?.to_account_id || null,
        category_id: categoryExists
          ? item.category_id
          : fallbackCategory?.id || categories[0]?.id || null,
        note: String(item?.note || 'Операция').trim(),
        tags: String(item?.tags || '').trim(),
      } as ParsedTransaction;
    })
    .filter((item) => item.amount > 0 && item.account_id);
};

// ==========================================
// ФУНКЦИЯ 1: Ввод операций текстом/голосом
// ==========================================
export const parseExpenseWithAI = async (
  text: string,
  userId: string
): Promise<ParsedTransaction[] | null> => {
  const cleanText = text.trim();

  if (!cleanText || !userId) {
    return [];
  }

  try {
    const { accounts, categories } = await loadUserFinanceDictionaries(userId);

    if (accounts.length === 0) {
      console.warn('У пользователя нет счетов. AI-ввод невозможен.');
      return [];
    }

    const accountsList =
      accounts.map((account) => `- ${account.name} (ID: ${account.id})`).join('\n') ||
      'Нет счетов';

    const categoriesList =
      categories
        .map(
          (category) =>
            `- ${category.name} [Тип: ${category.type}] (ID: ${category.id})`
        )
        .join('\n') || 'Нет категорий';

    const systemInstruction = `
Ты финансовый ИИ-ассистент приложения FinBuddy.
Твоя задача — извлечь финансовые операции из текста пользователя.

${KAZAKHSTAN_AI_RULES}

Верни только строгий JSON объект с ключом "transactions".
Никакого markdown, комментариев или пояснений.

Доступные счета:
${accountsList}

Доступные категории:
${categoriesList}

Правила:
1. type: только "expense", "income" или "transfer".
2. amount: только число. Сумма всегда в казахстанских тенге, KZT.
3. account_id: ID подходящего счета из списка. Если явно не указан, выбери наиболее подходящий доступный счет.
4. category_id: ID подходящей категории из списка. Для расхода выбирай категорию type="expense", для дохода type="income".
5. note: короткое понятное описание операции.
6. tags: ключевые слова через запятую. Извлекай бренды, места, назначение покупки.
7. Если в тексте несколько операций, верни несколько объектов в массиве.
8. Не придумывай ID, используй только ID из списков.
9. Если пользователь пишет "тг", "тенге", "₸" или просто число — это KZT.

Формат:
{
  "transactions": [
    {
      "type": "expense",
      "amount": 2500,
      "account_id": "uuid",
      "category_id": "uuid",
      "note": "Кофе в Starbucks",
      "tags": "кофе, starbucks"
    }
  ]
}
`;

    try {
      const content = await fetchGroqChat(
        [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: cleanText },
        ],
        {
          temperature: 0,
          max_tokens: 800,
          json: true,
        }
      );

      const parsed = extractJsonObject(content);
      const transactions = normalizeTransactions(
        parsed?.transactions || [],
        accounts,
        categories
      );

      if (transactions.length > 0) {
        return transactions;
      }

      return buildLocalParsedTransaction(cleanText, accounts, categories);
    } catch (aiError) {
      console.warn('AI-ввод недоступен, используется локальный парсер:', aiError);
      return buildLocalParsedTransaction(cleanText, accounts, categories);
    }
  } catch (error) {
    console.error('Ошибка parseExpenseWithAI:', error);
    return null;
  }
};

// ==========================================
// ФУНКЦИЯ 2: Финансовая аналитика
// ==========================================
export const getBudgetAnalysis = async (
  transactions: any[],
  totalIncome: number,
  totalExpense: number,
  periodName: string
): Promise<string> => {
  const localFallbackAnalysis = () => {
    const balance = totalIncome - totalExpense;
    const expensePercent =
      totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;

    const expenseTransactions = (transactions || []).filter(
      (tx: any) => tx.type === 'expense'
    );

    const groupedExpenses: Record<string, number> = {};

    expenseTransactions.forEach((tx: any) => {
      const categoryData = Array.isArray(tx.categories)
        ? tx.categories[0]
        : tx.categories;

      const categoryName =
        categoryData?.name ||
        tx.category_name ||
        tx.category ||
        'Без категории';

      groupedExpenses[categoryName] =
        (groupedExpenses[categoryName] || 0) + safeNumber(tx.amount);
    });

    const topCategories = Object.entries(groupedExpenses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const mainRisk = topCategories[0];

    const topCategoryText =
      topCategories.length > 0
        ? topCategories
            .map(([name, amount], index) => {
              const percent =
                totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;

              return `${index + 1}. ${name}: ${formatKzt(amount)} (${percent}%)`;
            })
            .join('\n')
        : 'Расходов по категориям пока недостаточно.';

    let status = 'Финансовое состояние стабильное.';
    let recommendation =
      'Продолжайте отслеживать расходы и используйте лимиты в разделе «Бюджеты».';

    if (totalIncome <= 0 && totalExpense > 0) {
      status = 'Доходы за выбранный период отсутствуют, но расходы уже есть.';
      recommendation = 'Добавьте доходы или выберите другой период для анализа.';
    } else if (expensePercent >= 100) {
      status = 'Критический риск: расходы превышают доходы.';
      recommendation =
        'Сократите крупнейшие категории расходов и установите жесткие лимиты.';
    } else if (expensePercent >= 90) {
      status = 'Высокий риск перерасхода: расходы почти равны доходам.';
      recommendation =
        'Проверьте обязательные расходы и временно ограничьте необязательные покупки.';
    } else if (expensePercent >= 70) {
      status = 'Расходы занимают значительную часть дохода.';
      recommendation =
        'Определите 1–2 категории, где можно снизить расходы на 10–15%.';
    } else if (expensePercent <= 50 && totalIncome > 0) {
      status = 'Хороший уровень контроля расходов.';
      recommendation =
        'Можно увеличить накопления или направить остаток на финансовую цель.';
    }

    const savingPotential = Math.max(
      0,
      Math.round((mainRisk?.[1] || 0) * 0.15)
    );

    return [
      'AI-анализ временно недоступен, поэтому показан локальный анализ.',
      '',
      `Период: ${periodName}`,
      `Доходы: ${formatKzt(totalIncome)}`,
      `Расходы: ${formatKzt(totalExpense)}`,
      `Остаток: ${formatKzt(balance)}`,
      `Доля расходов от дохода: ${expensePercent}%`,
      '',
      `1. Общий вывод: ${status}`,
      `2. Главная зона риска: ${mainRisk ? mainRisk[0] : 'недостаточно данных'}`,
      `3. Крупные категории расходов:`,
      topCategoryText,
      `4. Потенциал экономии: примерно ${formatKzt(savingPotential)} в месяц.`,
      `5. Рекомендация: ${recommendation}`,
    ].join('\n');
  };

  try {
    const expenseTransactions = (transactions || []).filter(
      (tx: any) => tx.type === 'expense'
    );

    const groupedExpenses: Record<string, number> = {};

    expenseTransactions.forEach((tx: any) => {
      const categoryData = Array.isArray(tx.categories)
        ? tx.categories[0]
        : tx.categories;

      const categoryName =
        categoryData?.name ||
        tx.category_name ||
        tx.category ||
        'Без категории';

      groupedExpenses[categoryName] =
        (groupedExpenses[categoryName] || 0) + safeNumber(tx.amount);
    });

    const balance = totalIncome - totalExpense;
    const expensePercent =
      totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;

    const prompt = `
Проанализируй личные финансы пользователя приложения FinBuddy.

${KAZAKHSTAN_AI_RULES}

Период: ${periodName}

Показатели:
- Доходы: ${formatKzt(totalIncome)}
- Расходы: ${formatKzt(totalExpense)}
- Остаток: ${formatKzt(balance)}
- Доля расходов от дохода: ${expensePercent}%

Расходы по категориям:
${JSON.stringify(groupedExpenses, null, 2)}

Дай ответ на русском языке в таком формате:

1. Общий вывод:
2. Главная зона риска:
3. Что можно сократить:
4. Потенциал экономии:
5. Практическая рекомендация:

Строго используй валюту тенге и формат "25 000 ₸".
Не используй рубли, ₽ или RUB.
Ответ должен быть коротким, конкретным и полезным.
`;

    const content = await fetchGroqChat(
      [
        {
          role: 'system',
          content: `
Ты финансовый аналитик FinBuddy.

${KAZAKHSTAN_AI_RULES}

Отвечай кратко, понятно и на русском языке.
Все суммы — только в казахстанских тенге, формат "25 000 ₸".
`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      {
        temperature: 0.3,
        max_tokens: 700,
      }
    );

    return sanitizeCurrencyText(content);
  } catch (error) {
    console.warn('AI-анализ недоступен, используется локальный анализ:', error);
    return localFallbackAnalysis();
  }
};

// ==========================================
// ФУНКЦИЯ 3: Перевод голоса в текст
// ==========================================
export const transcribeAudio = async (audioUri: string): Promise<string | null> => {
  const apiKey = getGroqKey();

  if (!apiKey) {
    console.warn('EXPO_PUBLIC_GROQ_API_KEY не найден. Голосовой ввод недоступен.');
    return null;
  }

  if (!audioUri) {
    console.warn('audioUri пустой');
    return null;
  }

  try {
    const formData = new FormData();

    formData.append('file', {
      uri: audioUri,
      name: 'audio.m4a',
      type: 'audio/m4a',
    } as any);

    formData.append('model', WHISPER_MODEL);
    formData.append('language', 'ru');

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const rawText = await response.text();

    if (!response.ok) {
      console.error('Groq Whisper Error Status:', response.status);
      console.error('Groq Whisper Error Body:', rawText);
      return null;
    }

    const data = JSON.parse(rawText);

    return data?.text || null;
  } catch (error) {
    console.error('Audio Transcription Error:', error);
    return null;
  }
};
