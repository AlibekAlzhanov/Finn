// Supabase Edge Function: parse-transaction
// Deploy:
//   npx supabase functions deploy parse-transaction
// Secret:
//   npx supabase secrets set GROQ_API_KEY=your_groq_key

import { createClient } from 'npm:@supabase/supabase-js@2';

type Account = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
  type: string;
};

type CategoryRule = {
  canonical: string;
  type: 'expense' | 'income';
  priority: number;
  keywords: string[];
};

type ParseTransactionRequest = {
  text?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CHAT_MODEL = 'llama-3.3-70b-versatile';

const EXPENSE_RULES: CategoryRule[] = [
  {
    canonical: 'Подписки',
    type: 'expense',
    priority: 120,
    keywords: [
      'подписк',
      'subscription',
      'яндекс плюс',
      'yandex plus',
      'ya plus',
      'netflix',
      'spotify',
      'icloud',
      'кинопоиск',
      'youtube premium',
      'apple music',
      'chatgpt',
      'openai',
      'google one',
      'telegram premium',
    ],
  },
  {
    canonical: 'Кафе и рестораны',
    type: 'expense',
    priority: 95,
    keywords: [
      'кофе',
      'кафе',
      'ресторан',
      'обед',
      'ужин',
      'завтрак',
      'донер',
      'шаурма',
      'бургер',
      'пицца',
      'суши',
      'kfc',
      'starbucks',
      'старбакс',
    ],
  },
  {
    canonical: 'Продукты',
    type: 'expense',
    priority: 90,
    keywords: [
      'продукт',
      'еда домой',
      'супермаркет',
      'магазин',
      'magnum',
      'small',
      'анвар',
      'овощ',
      'фрукт',
      'мясо',
      'хлеб',
      'молоко',
    ],
  },
  {
    canonical: 'Транспорт',
    type: 'expense',
    priority: 80,
    keywords: [
      'такси',
      'яндекс go',
      'yandex go',
      'indrive',
      'uber',
      'автобус',
      'метро',
      'проезд',
      'транспорт',
      'бензин',
      'заправка',
      'парковка',
    ],
  },
  {
    canonical: 'Долг',
    type: 'expense',
    priority: 110,
    keywords: [
      'отдал долг',
      'отдала долг',
      'вернул долг',
      'вернула долг',
      'погасил долг',
      'погасила долг',
      'закрыл долг',
      'закрыла долг',
      'одолжил',
      'одолжила',
    ],
  },
  {
    canonical: 'Подарок',
    type: 'expense',
    priority: 90,
    keywords: ['купил подарок', 'купила подарок', 'подарил', 'подарила', 'подарки'],
  },
  {
    canonical: 'Одежда',
    type: 'expense',
    priority: 70,
    keywords: ['одежд', 'кроссов', 'футболк', 'куртка', 'брюки', 'джинсы', 'обувь', 'zara'],
  },
  {
    canonical: 'Развлечения',
    type: 'expense',
    priority: 65,
    keywords: ['кино', 'игра', 'развлеч', 'театр', 'концерт', 'караоке', 'боулинг', 'ps store'],
  },
  {
    canonical: 'Здоровье',
    type: 'expense',
    priority: 65,
    keywords: ['аптека', 'лекар', 'клиника', 'здоров', 'врач', 'стоматолог', 'анализ'],
  },
  {
    canonical: 'Образование',
    type: 'expense',
    priority: 65,
    keywords: ['учеб', 'курс', 'книга', 'университет', 'образование', 'udemy', 'coursera'],
  },
  {
    canonical: 'Дом',
    type: 'expense',
    priority: 60,
    keywords: ['дом', 'ремонт', 'быт', 'товары для дома', 'хоз', 'ikea', 'мебель'],
  },
];

const INCOME_RULES: CategoryRule[] = [
  {
    canonical: 'Зарплата',
    type: 'income',
    priority: 100,
    keywords: ['зарплат', 'аванс', 'премия', 'оклад'],
  },
  {
    canonical: 'Подработка',
    type: 'income',
    priority: 90,
    keywords: ['подработка', 'фриланс', 'проект', 'заказ', 'работа'],
  },
  {
    canonical: 'Подарок',
    type: 'income',
    priority: 95,
    keywords: ['подарили', 'подарок', 'подарил мне', 'мне подарили', 'gift', 'донат', 'презент'],
  },
  {
    canonical: 'Долг',
    type: 'income',
    priority: 95,
    keywords: ['отдали долг', 'вернули долг', 'мне вернули', 'вернули мне', 'возврат долга', 'долг вернули'],
  },
  {
    canonical: 'Перевод',
    type: 'income',
    priority: 40,
    keywords: ['перевод получил', 'поступил перевод', 'поступление'],
  },
];

const json = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
};

const normalizeText = (value: unknown) => {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const keywordMatches = (text: string, keyword: string) => {
  const cleanText = normalizeText(text);
  const cleanKeyword = normalizeText(keyword);
  if (!cleanKeyword) return false;
  return cleanText.includes(cleanKeyword);
};

const sanitizeCurrencyText = (text: string) => {
  return text
    .replace(/руб(лей|ля|ль|\.|)/gi, '₸')
    .replace(/₽/g, '₸')
    .replace(/RUB/gi, 'KZT');
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

const inferTransactionType = (text: string): 'expense' | 'income' | 'transfer' => {
  const normalizedText = normalizeText(text);

  if (/перев[её]л|перевод|с одного счета|на другой счет|между счетами/.test(normalizedText)) {
    return 'transfer';
  }

  if (/(^|\s)(я\s+)?(отдал|отдала|вернул|вернула|погасил|погасила|закрыл|закрыла)\s+долг/.test(normalizedText)) {
    return 'expense';
  }

  if (
    /зарплат|доход|получил|получила|поступил|поступление|аванс|премия|оклад|подарили|мне подарили|подарок|отдали долг|вернули долг|мне вернули|вернули мне|возврат долга/.test(
      normalizedText
    )
  ) {
    return 'income';
  }

  return 'expense';
};

const getStrongSemanticCategoryName = (
  text: string,
  type: 'expense' | 'income' | 'transfer'
) => {
  if (type === 'transfer') return null;

  const rules = type === 'income' ? INCOME_RULES : EXPENSE_RULES;
  const cleanText = normalizeText(text);

  const scored = rules
    .map((rule) => {
      const matchCount = rule.keywords.filter((keyword) =>
        keywordMatches(cleanText, keyword)
      ).length;

      return {
        rule,
        score: matchCount > 0 ? rule.priority + matchCount * 15 : 0,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.rule.canonical || null;
};

const findCategoryByName = (
  categoryName: string | null | undefined,
  categories: Category[],
  type: 'expense' | 'income' | 'transfer'
) => {
  if (!categoryName || type === 'transfer') return null;

  const cleanName = normalizeText(categoryName);
  const source = categories.filter((category) => category.type === type);

  const exact = source.find((category) => normalizeText(category.name) === cleanName);
  if (exact) return exact;

  const included = source.find((category) => {
    const existingName = normalizeText(category.name);
    return existingName.includes(cleanName) || cleanName.includes(existingName);
  });

  return included || null;
};

const getSuggestedCategoryName = (
  text: string,
  type: 'expense' | 'income' | 'transfer'
) => {
  const strong = getStrongSemanticCategoryName(text, type);
  if (strong) return strong;

  if (type === 'income') return 'Доход';
  if (type === 'transfer') return '';

  const cleaned = text
    .replace(/\d+(?:[.,]\d+)?/g, '')
    .replace(/₸|тг|тенге|kzt|usd|eur|доллар|долларов|евро/gi, '')
    .replace(/\b(купил|купила|оплатил|оплатила|заплатил|заплатила|потратил|потратила)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned ? cleaned.slice(0, 32) : 'Новая категория';
};

const postProcessTransaction = (
  item: any,
  originalText: string,
  accounts: Account[],
  categories: Category[]
) => {
  const rawType: 'expense' | 'income' | 'transfer' =
    item?.type === 'income' || item?.operation_type === 'income'
      ? 'income'
      : item?.type === 'transfer' || item?.operation_type === 'transfer'
        ? 'transfer'
        : 'expense';

  const textForSemantic = `${originalText} ${item?.note || ''} ${item?.description || ''} ${item?.category_name || item?.categoryName || item?.category || ''}`;
  const inferredType = inferTransactionType(textForSemantic);
  const type = rawType === 'transfer' ? 'transfer' : inferredType;

  const accountId = accounts.some((account) => account.id === item?.account_id)
    ? item.account_id
    : accounts[0]?.id || null;

  const rawCategoryId = item?.category_id || item?.categoryId || null;
  const rawCategoryName =
    item?.category_name ||
    item?.categoryName ||
    item?.category ||
    item?.name ||
    '';

  const strongSemanticCategoryName = getStrongSemanticCategoryName(textForSemantic, type);

  const semanticCategory = strongSemanticCategoryName
    ? findCategoryByName(strongSemanticCategoryName, categories, type)
    : null;

  const categoryById = categories.find(
    (category) => category.id === rawCategoryId && category.type === type
  );

  const categoryByName = findCategoryByName(rawCategoryName, categories, type);

  const selectedCategory =
    semanticCategory ||
    categoryById ||
    categoryByName ||
    null;

  const categoryName =
    selectedCategory?.name ||
    strongSemanticCategoryName ||
    rawCategoryName ||
    getSuggestedCategoryName(textForSemantic, type);

  return {
    type,
    amount: Number(item?.amount || item?.sum || item?.value || item?.price || 0),
    account_id: accountId,
    to_account_id: item?.to_account_id || item?.toAccountId || null,
    category_id: type === 'transfer' ? null : selectedCategory?.id || null,
    category_name: type === 'transfer' ? null : categoryName,
    note: String(item?.note || item?.description || item?.title || categoryName || originalText).trim(),
    tags: Array.isArray(item?.tags) ? item.tags.join(', ') : String(item?.tags || '').trim(),
  };
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
      return json({ error: 'Supabase env is not configured.' }, 500);
    }

    if (!groqKey) {
      return json({ error: 'GROQ_API_KEY is not configured.' }, 500);
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

    const body = (await req.json()) as ParseTransactionRequest;
    const text = String(body.text || '').trim();

    if (!text) {
      return json({ transactions: [] });
    }

    const [{ data: accounts, error: accountsError }, { data: categories, error: categoriesError }] =
      await Promise.all([
        supabaseAdmin.from('accounts').select('id, name').eq('user_id', user.id),
        supabaseAdmin.from('categories').select('id, name, type').eq('user_id', user.id),
      ]);

    if (accountsError) throw accountsError;
    if (categoriesError) throw categoriesError;

    const safeAccounts = (accounts || []) as Account[];
    const safeCategories = (categories || []) as Category[];

    if (safeAccounts.length === 0) {
      return json({ transactions: [] });
    }

    const accountsList =
      safeAccounts.map((account) => `- ${account.name} (ID: ${account.id})`).join('\n') ||
      'Нет счетов';

    const categoriesList =
      safeCategories
        .map((category) => `- ${category.name} [Тип: ${category.type}] (ID: ${category.id})`)
        .join('\n') || 'Нет категорий';

    const systemInstruction = `
Ты финансовый ИИ-ассистент приложения FinBuddy.
Твоя задача — извлечь финансовые операции из текста пользователя.

Пользователь находится в Казахстане.
Валюта приложения — казахстанский тенге.
Если пользователь указывает доллары, евро или другую валюту — сумму всё равно верни числом, валюту отдельно не нужно.

Верни только строгий JSON объект с ключом "transactions".
Никакого markdown, комментариев или пояснений.

Доступные счета:
${accountsList}

Доступные категории:
${categoriesList}

Главное правило категорий:
- category_name должен быть короткой финансовой категорией, а не всей фразой.
- Нельзя делать category_name вроде "купил подписку яндекс", "подарили долларов", "отдали долг 5000".
- Если категории нет в списке, верни category_id: null и короткий category_name.

Правила:
1. type: только "expense", "income" или "transfer".
2. amount: только число.
3. account_id: ID подходящего счета из списка. Если явно не указан, выбери первый/самый подходящий счет.
4. category_id: ID подходящей категории из списка.
5. Для расхода выбирай категорию type="expense", для дохода type="income".
6. Если подходящей категории нет, category_id должен быть null.
7. category_name всегда заполняй коротким названием категории.
8. note: короткое понятное описание операции.
9. tags: ключевые слова через запятую.
10. Если в тексте несколько операций, верни несколько объектов в массиве.
11. Не придумывай ID, используй только ID из списков.

Семантические примеры:
- "купил подписку яндекс", "оплатил яндекс плюс", "яндекс плюс 1490" → category_name: "Подписки", type: "expense"
- "яндекс такси 2500", "такси 2500" → category_name: "Транспорт", type: "expense"
- "кофе 2500", "донер 1200", "обед 3500" → category_name: "Кафе и рестораны", type: "expense"
- "magnum 12000", "продукты 12000" → category_name: "Продукты", type: "expense"
- "подарили 100 долларов", "подарок 100 долларов" → category_name: "Подарок", type: "income"
- "отдали долг", "вернули долг", "мне вернули долг" → category_name: "Долг", type: "income"
- "отдал долг", "вернул долг", "погасил долг" → category_name: "Долг", type: "expense"
- "зарплата 300000" → category_name: "Зарплата", type: "income"

Формат:
{
  "transactions": [
    {
      "type": "expense",
      "amount": 2500,
      "account_id": "uuid",
      "category_id": "uuid или null",
      "category_name": "Кафе и рестораны",
      "note": "Кофе",
      "tags": "кофе"
    }
  ]
}
`;

    const response = await fetch(GROQ_CHAT_URL, {
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
            content: systemInstruction,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0,
        max_tokens: 800,
        response_format: {
          type: 'json_object',
        },
      }),
    });

    const rawText = await response.text();

    if (!response.ok) {
      console.error('Groq parse-transaction error status:', response.status);
      console.error('Groq parse-transaction error body:', rawText);

      return json(
        {
          error: 'Groq parse-transaction request failed.',
          providerStatus: response.status,
        },
        502
      );
    }

    const parsed = extractJsonObject(sanitizeCurrencyText(rawText));
    const rawTransactions = Array.isArray(parsed?.transactions) ? parsed.transactions : [];

    const transactions = rawTransactions
      .map((item: any) => postProcessTransaction(item, text, safeAccounts, safeCategories))
      .filter((item: any) => item.amount > 0 && item.account_id);

    return json({
      transactions,
      source: 'edge-function',
    });
  } catch (error) {
    console.error('parse-transaction function error:', error);

    return json(
      {
        error: error instanceof Error ? error.message : 'Unknown parse-transaction error.',
      },
      500
    );
  }
});
