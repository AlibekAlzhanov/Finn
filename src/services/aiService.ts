import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from './supabase';
import { formatKzt } from './financeConfig';

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
  category_name?: string | null;
  note: string;
  tags: string;
};

type CategoryRule = {
  canonical: string;
  type: 'expense' | 'income';
  priority: number;
  keywords: string[];
};

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
      'magnum cafe',
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
      'занял другу',
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

const safeNumber = (value: unknown) => {
  const numberValue = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeText = (value: unknown) => {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const loadUserFinanceDictionaries = async (userId: string) => {
  const [{ data: accounts, error: accountsError }, { data: categories, error: categoriesError }] =
    await Promise.all([
      supabase.from('accounts').select('id, name').eq('user_id', userId),
      supabase.from('categories').select('id, name, type').eq('user_id', userId),
    ]);

  if (accountsError) console.error('Ошибка загрузки счетов:', accountsError);
  if (categoriesError) console.error('Ошибка загрузки категорий:', categoriesError);

  return {
    accounts: (accounts || []) as Account[],
    categories: (categories || []) as Category[],
  };
};

const keywordMatches = (text: string, keyword: string) => {
  const cleanText = normalizeText(text);
  const cleanKeyword = normalizeText(keyword);
  if (!cleanKeyword) return false;
  return cleanText.includes(cleanKeyword);
};

const getStrongSemanticCategoryName = (
  text: string,
  type: 'expense' | 'income' | 'transfer'
) => {
  if (type === 'transfer') return null;

  const rules = type === 'income' ? INCOME_RULES : EXPENSE_RULES;
  const cleanText = normalizeText(text);

  if (!cleanText) return null;

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
  categoryName: string,
  categories: Category[],
  type: 'expense' | 'income' | 'transfer'
) => {
  if (type === 'transfer') return null;

  const cleanName = normalizeText(categoryName);
  if (!cleanName) return null;

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

const findCategoryByText = (
  text: string,
  categories: Category[],
  type: 'expense' | 'income' | 'transfer'
) => {
  if (type === 'transfer') return null;

  const strongCategoryName = getStrongSemanticCategoryName(text, type);

  if (strongCategoryName) {
    const strongCategory = findCategoryByName(strongCategoryName, categories, type);
    if (strongCategory) return strongCategory;
  }

  const suggestedName = getSuggestedCategoryName(text, type);
  const bySuggestedName = findCategoryByName(suggestedName, categories, type);

  if (bySuggestedName) return bySuggestedName;

  const lowerText = normalizeText(text);
  const source = categories.filter((category) => category.type === type);

  const exactInText = source.find((category) =>
    lowerText.includes(normalizeText(category.name))
  );

  return exactInText || null;
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

const buildLocalParsedTransaction = (
  text: string,
  accounts: Account[],
  categories: Category[]
): ParsedTransaction[] => {
  const amountMatch = text.replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)/);
  const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 0;

  if (!amount || amount <= 0) return [];

  const type = inferTransactionType(text);

  const account =
    accounts.find((item) => normalizeText(text).includes(normalizeText(item.name))) ||
    accounts[0] ||
    null;

  const category = findCategoryByText(text, categories, type);
  const suggestedCategoryName = category?.name || getSuggestedCategoryName(text, type);

  const cleanNote = text
    .replace(/\d+(?:[.,]\d+)?/g, '')
    .replace(/₸|тг|тенге|kzt|usd|eur|доллар|долларов|евро/gi, '')
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
      category_name: type === 'transfer' ? null : suggestedCategoryName,
      note: cleanNote || text.trim(),
      tags,
    },
  ];
};

const normalizeEdgeTransactions = (
  rawTransactions: any[],
  accounts: Account[],
  categories: Category[],
  originalText = ''
): ParsedTransaction[] => {
  return (rawTransactions || [])
    .map((item) => {
      const rawType: 'expense' | 'income' | 'transfer' =
        item?.type === 'income' || item?.operation_type === 'income'
          ? 'income'
          : item?.type === 'transfer' || item?.operation_type === 'transfer'
            ? 'transfer'
            : 'expense';

      const textForSemantic = `${originalText} ${item?.note || ''} ${item?.description || ''} ${item?.category_name || item?.categoryName || item?.category || ''}`;
      const inferredType = inferTransactionType(textForSemantic);
      const type = rawType === 'transfer' ? 'transfer' : inferredType;

      const amount = safeNumber(item?.amount ?? item?.sum ?? item?.value ?? item?.price);
      const accountExists = accounts.some((account) => account.id === item?.account_id);

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
      const fallbackCategory = findCategoryByText(textForSemantic, categories, type);

      const selectedCategory =
        semanticCategory ||
        categoryById ||
        categoryByName ||
        fallbackCategory;

      const suggestedCategoryName =
        selectedCategory?.name ||
        strongSemanticCategoryName ||
        rawCategoryName ||
        getSuggestedCategoryName(textForSemantic, type);

      return {
        type,
        amount,
        account_id: accountExists ? item.account_id : accounts[0]?.id || null,
        to_account_id: item?.to_account_id || item?.toAccountId || null,
        category_id: type === 'transfer' ? null : selectedCategory?.id || null,
        category_name: type === 'transfer' ? null : suggestedCategoryName,
        note: String(item?.note || item?.description || item?.title || suggestedCategoryName || 'Операция').trim(),
        tags: Array.isArray(item?.tags)
          ? item.tags.join(', ')
          : String(item?.tags || '').trim(),
      } as ParsedTransaction;
    })
    .filter((item) => item.amount > 0 && item.account_id);
};

export const parseExpenseWithAI = async (
  text: string,
  userId: string
): Promise<ParsedTransaction[] | null> => {
  const cleanText = text.trim();

  if (!cleanText || !userId) return [];

  try {
    const { accounts, categories } = await loadUserFinanceDictionaries(userId);

    if (accounts.length === 0) {
      console.warn('У пользователя нет счетов. AI-ввод невозможен.');
      return [];
    }

    try {
      const { data, error } = await supabase.functions.invoke('parse-transaction', {
        body: {
          text: cleanText,
        },
      });

      if (error) {
        console.warn('parse-transaction Edge Function недоступна, используется локальный парсер:', error);
        return buildLocalParsedTransaction(cleanText, accounts, categories);
      }

      const transactions = normalizeEdgeTransactions(
        data?.transactions || [],
        accounts,
        categories,
        cleanText
      );

      if (transactions.length > 0) {
        return transactions;
      }

      return buildLocalParsedTransaction(cleanText, accounts, categories);
    } catch (edgeError) {
      console.warn('parse-transaction Edge Function недоступна, используется локальный парсер:', edgeError);
      return buildLocalParsedTransaction(cleanText, accounts, categories);
    }
  } catch (error) {
    console.error('Ошибка parseExpenseWithAI:', error);
    return null;
  }
};

export const getBudgetAnalysis = async (
  transactions: any[],
  totalIncome: number,
  totalExpense: number,
  periodName: string
): Promise<string> => {
  const balance = totalIncome - totalExpense;
  const expensePercent =
    totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;

  const expenseTransactions = (transactions || []).filter((tx: any) => tx.type === 'expense');
  const groupedExpenses: Record<string, number> = {};

  expenseTransactions.forEach((tx: any) => {
    const categoryData = Array.isArray(tx.categories) ? tx.categories[0] : tx.categories;
    const categoryName =
      categoryData?.name || tx.category_name || tx.category || 'Без категории';

    groupedExpenses[categoryName] = (groupedExpenses[categoryName] || 0) + safeNumber(tx.amount);
  });

  const topCategories = Object.entries(groupedExpenses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const mainRisk = topCategories[0];

  const topCategoryText =
    topCategories.length > 0
      ? topCategories
          .map(([name, amount], index) => {
            const percent = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
            return `${index + 1}. ${name}: ${formatKzt(amount)} (${percent}%)`;
          })
          .join('\n')
      : 'Расходов по категориям пока недостаточно.';

  let status = 'Финансовое состояние стабильное.';
  let recommendation = 'Продолжайте отслеживать расходы и используйте лимиты в разделе «Бюджеты».';

  if (totalIncome <= 0 && totalExpense > 0) {
    status = 'Доходы за выбранный период отсутствуют, но расходы уже есть.';
    recommendation = 'Добавьте доходы или выберите другой период для анализа.';
  } else if (expensePercent >= 100) {
    status = 'Критический риск: расходы превышают доходы.';
    recommendation = 'Сократите крупнейшие категории расходов и установите жесткие лимиты.';
  } else if (expensePercent >= 90) {
    status = 'Высокий риск перерасхода: расходы почти равны доходам.';
    recommendation = 'Проверьте обязательные расходы и временно ограничьте необязательные покупки.';
  } else if (expensePercent >= 70) {
    status = 'Расходы занимают значительную часть дохода.';
    recommendation = 'Определите 1–2 категории, где можно снизить расходы на 10–15%.';
  } else if (expensePercent <= 50 && totalIncome > 0) {
    status = 'Хороший уровень контроля расходов.';
    recommendation = 'Можно увеличить накопления или направить остаток на финансовую цель.';
  }

  const savingPotential = Math.max(0, Math.round((mainRisk?.[1] || 0) * 0.15));

  return [
    'Локальный анализ FinBuddy.',
    '',
    `Период: ${periodName}`,
    `Доходы: ${formatKzt(totalIncome)}`,
    `Расходы: ${formatKzt(totalExpense)}`,
    `Остаток: ${formatKzt(balance)}`,
    `Доля расходов от дохода: ${expensePercent}%`,
    '',
    `1. Общий вывод: ${status}`,
    `2. Главная зона риска: ${mainRisk ? mainRisk[0] : 'недостаточно данных'}`,
    '3. Крупные категории расходов:',
    topCategoryText,
    `4. Потенциал экономии: примерно ${formatKzt(savingPotential)} в месяц.`,
    `5. Рекомендация: ${recommendation}`,
  ].join('\n');
};

export const transcribeAudio = async (audioUri: string): Promise<string | null> => {
  if (!audioUri) {
    console.warn('audioUri пустой');
    return null;
  }

  try {
    const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: 'base64',
    });

    const { data, error } = await supabase.functions.invoke('transcribe-audio', {
      body: {
        audioBase64,
        mimeType: 'audio/m4a',
        filename: 'voice.m4a',
        language: 'ru',
      },
    });

    if (error) {
      console.error('Ошибка Edge Function transcribe-audio:', error);
      return null;
    }

    return data?.text || null;
  } catch (error) {
    console.error('Audio Transcription Edge Error:', error);
    return null;
  }
};
