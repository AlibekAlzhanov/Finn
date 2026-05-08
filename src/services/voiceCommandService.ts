export type VoiceActionKind = 'budget' | 'goal' | 'account' | 'category' | 'subscription';

export type VoiceAction = {
  kind: VoiceActionKind;
  amount?: number | null;
  categoryName?: string | null;
  title?: string | null;
  name?: string | null;
  currentAmount?: number | null;
  deadline?: string | null;
  startDate?: string | null;
  nextPaymentDate?: string | null;
  categoryType?: 'expense' | 'income';
};

export type UniversalVoiceCommand =
  | {
      intent: 'navigation';
      screen: string;
      reply?: string;
      originalText: string;
    }
  | {
      intent: 'review';
      actions: VoiceAction[];
      reply?: string;
      originalText: string;
    }
  | {
      intent: 'transaction';
      reply?: string;
      originalText: string;
    }
  | {
      intent: 'unknown';
      reply?: string;
      originalText: string;
    };

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

const normalize = (value: string) => {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractAmount = (text: string): number | null => {
  const normalized = text.replace(/\u00A0/g, ' ');

  const match = normalized.match(/(\d[\d\s.,]*)\s*(тыс|тысяч|k|к)?/i);

  if (!match) return null;

  const rawNumber = match[1]
    .replace(/\s/g, '')
    .replace(',', '.');

  const parsed = Number(rawNumber);

  if (!Number.isFinite(parsed)) return null;

  const unit = String(match[2] || '').toLowerCase();

  if (unit === 'тыс' || unit === 'тысяч' || unit === 'k' || unit === 'к') {
    return Math.round(parsed * 1000);
  }

  return Math.round(parsed);
};

const removeAmount = (text: string) => {
  return text
    .replace(/\d[\d\s.,]*\s*(тыс|тысяч|k|к)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const cleanName = (text: string, words: string[]) => {
  let result = normalize(removeAmount(text));

  words.forEach((word) => {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
  });

  return result
    .replace(/\b(поставь|установи|создай|добавь|сделай|открой|покажи|мне|пожалуйста|на|для|в|по|тенге|тг|kzt|каждый|месяц|ежемесячно|ежемесячный|первое|списание|сегодня|завтра)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};


const toDateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const inferStartDate = (text: string): string | null => {
  const value = normalize(text);
  const direct = value.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);

  if (direct) {
    return `${direct[1]}-${direct[2].padStart(2, '0')}-${direct[3].padStart(2, '0')}`;
  }

  if (/\b(сегодня|сейчас|сразу)\b/.test(value)) {
    return toDateOnly(new Date());
  }

  if (/\b(завтра)\b/.test(value)) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return toDateOnly(date);
  }

  if (/\b(через месяц|следующий месяц|со следующего месяца)\b/.test(value)) {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return toDateOnly(date);
  }

  return null;
};

const getNavigationScreen = (text: string): string | null => {
  const value = normalize(text);

  const hasNavigationVerb =
    /\b(открой|покажи|перейди|зайди|запусти|посмотри)\b/.test(value);

  if (!hasNavigationVerb) return null;

  if (/\b(месячн|отчет|отчёт|report)\b/.test(value)) return 'MonthlyReport';
  if (/\b(аналитик|статист|график|расходы|доходы)\b/.test(value)) return 'Stats';
  if (/\b(ai|ии|чат|ассистент)\b/.test(value)) return 'AiChat';
  if (/\b(подписк|регуляр|автоплатеж|автосписан)\b/.test(value)) return 'RecurringPayments';
  if (/\b(истор|операц)\b/.test(value)) return 'History';
  if (/\b(ручн|ввод)\b/.test(value)) return 'ManualInput';
  if (/\b(счет|счёт|счета|карта|карты|кошелек|кошелёк)\b/.test(value)) return 'Accounts';
  if (/\b(категор)\b/.test(value)) return 'ManageCategories';
  if (/\b(цель|цели|накоп)\b/.test(value)) return 'Goals';
  if (/\b(бюджет|лимит)\b/.test(value)) return 'Budgets';
  if (/\b(сервис|меню|функц)\b/.test(value)) return 'Services';

  return null;
};

const parseLocalCommand = (text: string): UniversalVoiceCommand | null => {
  const value = normalize(text);
  const amount = extractAmount(text);
  const navigationScreen = getNavigationScreen(text);

  if (navigationScreen) {
    return {
      intent: 'navigation',
      screen: navigationScreen,
      originalText: text,
      reply: 'Открываю нужный экран.',
    };
  }

  const createVerb = /\b(создай|добавь|поставь|установи|сделай|запиши|заведи)\b/.test(value);


  if (/\b(подписк|регуляр|автоплатеж|автоплатёж|автосписан|ежемесячн)\b/.test(value) && amount) {
    const name = cleanName(text, [
      'подписка',
      'подписку',
      'подписки',
      'регулярный',
      'регулярную',
      'регулярные',
      'автоплатеж',
      'автоплатёж',
      'автосписание',
      'ежемесячный',
      'ежемесячную',
    ]);
    const date = inferStartDate(text);

    return {
      intent: 'review',
      originalText: text,
      reply: 'Проверьте подписку перед сохранением.',
      actions: [
        {
          kind: 'subscription',
          title: name || 'Новая подписка',
          name: name || 'Новая подписка',
          amount,
          categoryName: 'Подписки',
          startDate: date,
          nextPaymentDate: date,
        },
      ],
    };
  }

  if (/\b(лимит|бюджет)\b/.test(value) && amount) {
    const categoryName = cleanName(text, [
      'лимит',
      'бюджет',
      'расход',
      'расходы',
      'месячный',
      'месяц',
    ]);

    return {
      intent: 'review',
      originalText: text,
      reply: 'Проверьте лимит перед сохранением.',
      actions: [
        {
          kind: 'budget',
          amount,
          categoryName: categoryName || null,
        },
      ],
    };
  }

  if (/\b(цель|цели|накопить|копить|собрать|накопления)\b/.test(value) && amount) {
    const title = cleanName(text, [
      'цель',
      'цели',
      'накопить',
      'копить',
      'собрать',
      'накопления',
      'финансовая',
    ]);

    return {
      intent: 'review',
      originalText: text,
      reply: 'Проверьте цель перед сохранением.',
      actions: [
        {
          kind: 'goal',
          title: title || 'Финансовая цель',
          amount,
          currentAmount: 0,
        },
      ],
    };
  }

  if (
    createVerb &&
    /\b(счет|счёт|карту|карта|кошелек|кошелёк|аккаунт)\b/.test(value)
  ) {
    const name = cleanName(text, [
      'счет',
      'счёт',
      'счета',
      'карту',
      'карта',
      'кошелек',
      'кошелёк',
      'аккаунт',
    ]);

    return {
      intent: 'review',
      originalText: text,
      reply: 'Проверьте счет перед сохранением.',
      actions: [
        {
          kind: 'account',
          name: name || 'Новый счет',
        },
      ],
    };
  }

  if (createVerb && /\b(категор)\b/.test(value)) {
    const categoryType =
      /\b(доход|дохода|income|зарплат|поступлен)\b/.test(value)
        ? 'income'
        : 'expense';

    const name = cleanName(text, [
      'категория',
      'категорию',
      'категории',
      'расход',
      'расхода',
      'расходы',
      'доход',
      'дохода',
      'доходы',
    ]);

    return {
      intent: 'review',
      originalText: text,
      reply: 'Проверьте категорию перед сохранением.',
      actions: [
        {
          kind: 'category',
          name: name || 'Новая категория',
          categoryType,
        },
      ],
    };
  }

  if (amount) {
    return {
      intent: 'transaction',
      originalText: text,
      reply: 'Похоже на финансовую операцию.',
    };
  }

  return null;
};

const safeJsonParse = (content: string): any | null => {
  try {
    const cleaned = content
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) return null;

    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch (error) {
    return null;
  }
};

const sanitizeAiCommand = (text: string, json: any): UniversalVoiceCommand | null => {
  if (!json || typeof json !== 'object') return null;

  if (json.intent === 'navigation' && typeof json.screen === 'string') {
    return {
      intent: 'navigation',
      screen: json.screen,
      originalText: text,
      reply: typeof json.reply === 'string' ? json.reply : undefined,
    };
  }

  if (json.intent === 'review' && Array.isArray(json.actions)) {
    const actions: VoiceAction[] = json.actions
      .map((action: any) => {
        const kind = action?.kind;

        if (!['budget', 'goal', 'account', 'category', 'subscription'].includes(kind)) {
          return null;
        }

        return {
          kind,
          amount:
            typeof action.amount === 'number'
              ? action.amount
              : action.amount
                ? extractAmount(String(action.amount))
                : null,
          categoryName:
            typeof action.categoryName === 'string'
              ? action.categoryName
              : null,
          title:
            typeof action.title === 'string'
              ? action.title
              : null,
          name:
            typeof action.name === 'string'
              ? action.name
              : null,
          currentAmount:
            typeof action.currentAmount === 'number'
              ? action.currentAmount
              : action.currentAmount
                ? extractAmount(String(action.currentAmount))
                : null,
          deadline:
            typeof action.deadline === 'string'
              ? action.deadline
              : null,
          startDate:
            typeof action.startDate === 'string'
              ? action.startDate
              : inferStartDate(text),
          nextPaymentDate:
            typeof action.nextPaymentDate === 'string'
              ? action.nextPaymentDate
              : inferStartDate(text),
          categoryType:
            action.categoryType === 'income'
              ? 'income'
              : 'expense',
        } as VoiceAction;
      })
      .filter(Boolean);

    if (actions.length === 0) return null;

    return {
      intent: 'review',
      actions,
      originalText: text,
      reply: typeof json.reply === 'string' ? json.reply : undefined,
    };
  }

  if (json.intent === 'transaction') {
    return {
      intent: 'transaction',
      originalText: text,
      reply: typeof json.reply === 'string' ? json.reply : undefined,
    };
  }

  return null;
};

const parseWithGroq = async (text: string): Promise<UniversalVoiceCommand | null> => {
  if (!GROQ_API_KEY) return null;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `
Ты классифицируешь голосовые команды для мобильного приложения личных финансов FinBuddy.
Регион: Казахстан. Валюта: тенге.

Верни только JSON без markdown.

Поддерживаемые intent:
1. navigation — открыть экран
2. review — создать/изменить сущность после подтверждения
3. transaction — обычная финансовая операция
4. unknown — непонятно

Экраны для navigation:
Stats, Budgets, Goals, Accounts, Services, History, ManualInput, ManageCategories, AiChat, AiStatic, RecurringPayments, MonthlyReport

Для review верни actions:
- budget: { "kind":"budget", "categoryName":"Продукты", "amount":50000 }
- goal: { "kind":"goal", "title":"Айфон", "amount":700000, "currentAmount":0, "deadline":null }
- account: { "kind":"account", "name":"Kaspi" }
- category: { "kind":"category", "name":"Кофе", "categoryType":"expense" или "income" }
- subscription: { "kind":"subscription", "title":"Netflix", "amount":3990, "categoryName":"Подписки", "startDate":"2026-05-14" }

Примеры:
"поставь лимит на продукты 50000" => review budget
"создай цель айфон 700000" => review goal
"добавь счет каспи" => review account
"создай категорию кофе расход" => review category
"добавь подписку netflix 3990 каждый месяц" => review subscription
"создай подписку spotify 2500 сегодня" => review subscription
"открой отчет за месяц" => navigation MonthlyReport
"покажи аналитику" => navigation Stats
"кофе 2500" => transaction

JSON формат:
{
  "intent": "review",
  "reply": "кратко",
  "actions": []
}
или
{
  "intent": "navigation",
  "screen": "Stats",
  "reply": "кратко"
}
или
{
  "intent": "transaction",
  "reply": "кратко"
}
`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) return null;

    const json = safeJsonParse(content);

    return sanitizeAiCommand(text, json);
  } catch (error) {
    console.error('Voice command Groq error:', error);
    return null;
  }
};

export const parseUniversalVoiceCommand = async (
  text: string
): Promise<UniversalVoiceCommand> => {
  const local = parseLocalCommand(text);

  // Локальные команды для лимитов/целей/счетов лучше выполнять сразу:
  // так быстрее и не зависит от API.
  if (local && local.intent !== 'transaction') {
    return local;
  }

  const ai = await parseWithGroq(text);

  if (ai) return ai;

  if (local) return local;

  return {
    intent: 'unknown',
    originalText: text,
    reply: 'Не удалось понять команду.',
  };
};
