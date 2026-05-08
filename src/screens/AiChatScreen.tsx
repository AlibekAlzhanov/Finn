import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askFinanceAi } from '../services/aiChatService';
import { useAuthStore } from '../store/useAuthStore';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

const FINANCE_KEYWORDS = [
  // ru
  'финанс',
  'деньг',
  'расход',
  'расходы',
  'трата',
  'траты',
  'тратить',
  'доход',
  'доходы',
  'бюджет',
  'лимит',
  'цель',
  'цели',
  'накоп',
  'накопления',
  'сбереж',
  'сбережения',
  'подписк',
  'подписка',
  'подписки',
  'платеж',
  'платёж',
  'операц',
  'операция',
  'операции',
  'счет',
  'счёт',
  'карта',
  'баланс',
  'тенге',
  'тг',
  'kzt',
  'зарплат',
  'зарплата',
  'долг',
  'долги',
  'кредит',
  'займ',
  'эконом',
  'экономия',
  'покупк',
  'покупка',
  'категор',
  'категория',
  'категории',
  'аналитик',
  'аналитика',
  'отчет',
  'отчёт',
  'kaspi',
  'каспи',
  'депозит',

  // kz
  'ақша',
  'шығын',
  'шығындар',
  'кіріс',
  'бюджет',
  'лимит',
  'мақсат',
  'жинақ',
  'теңге',
  'қарыз',
  'төлем',
  'шот',

  // en
  'money',
  'finance',
  'financial',
  'expense',
  'expenses',
  'income',
  'budget',
  'limit',
  'saving',
  'savings',
  'goal',
  'subscription',
  'payment',
  'transaction',
  'account',
  'balance',
  'debt',
  'loan',
  'credit',
];

const ANALYTICS_KEYWORDS = [
  // ru
  'анализ',
  'проанализируй',
  'анализируй',
  'разбор',
  'итог',
  'итоги',
  'статистика',
  'сводка',
  'отчет',
  'отчёт',
  'покажи',
  'посмотри',
  'сравни',
  'сравнение',
  'динамика',
  'сколько потратил',
  'сколько потратила',
  'сколько ушло',
  'куда ушли',
  'куда ушли деньги',
  'за месяц',
  'за неделю',
  'за год',

  // kz
  'талдау',
  'есеп',
  'қорытынды',
  'статистика',
  'ай бойынша',
  'апта бойынша',
  'жыл бойынша',

  // en
  'analysis',
  'analyze',
  'report',
  'summary',
  'statistics',
  'stats',
  'compare',
  'comparison',
  'overview',
];

const MONTH_KEYWORDS = [
  // ru
  'январь',
  'января',
  'февраль',
  'февраля',
  'март',
  'марта',
  'апрель',
  'апреля',
  'май',
  'мая',
  'июнь',
  'июня',
  'июль',
  'июля',
  'август',
  'августа',
  'сентябрь',
  'сентября',
  'октябрь',
  'октября',
  'ноябрь',
  'ноября',
  'декабрь',
  'декабря',

  // kz
  'қаңтар',
  'ақпан',
  'наурыз',
  'сәуір',
  'мамыр',
  'маусым',
  'шілде',
  'тамыз',
  'қыркүйек',
  'қазан',
  'қараша',
  'желтоқсан',

  // en
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const PERIOD_KEYWORDS = [
  'день',
  'неделя',
  'неделю',
  'месяц',
  'месяца',
  'год',
  'года',
  'сегодня',
  'вчера',
  'позавчера',
  'текущий месяц',
  'прошлый месяц',
  'этот месяц',
  'за период',

  'күн',
  'апта',
  'ай',
  'жыл',
  'бүгін',
  'кеше',

  'day',
  'week',
  'month',
  'year',
  'today',
  'yesterday',
  'period',
];

const BLOCKED_GENERAL_TOPICS = [
  'программ',
  'код',
  'react',
  'typescript',
  'javascript',
  'python',
  '1с',
  'c#',
  'дорама',
  'фильм',
  'сериал',
  'игра',
  'политик',
  'новости',
  'погода',
  'рецепт',
  'готовить',
  'математика',
  'физика',
  'история',
];

const refusalText =
  'Я отвечаю только по FinBuddy и личным финансам: расходы, доходы, бюджет, лимиты, цели, счета, подписки, долги и финансовая аналитика. Переформулируй вопрос в рамках финансов, и я помогу.';

const starterQuestions = [
  'Анализ за май месяц',
  'Покажи итоги расходов',
  'Сводка по категориям',
  'Как уменьшить траты?',
];

const normalize = (value: string) => {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:()\[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const includesAnyKeyword = (text: string, keywords: string[]) => {
  const normalized = normalize(text);

  return keywords.some((keyword) => {
    const normalizedKeyword = normalize(keyword);
    return normalizedKeyword.length > 0 && normalized.includes(normalizedKeyword);
  });
};

const isAnalysisRequest = (text: string) => {
  const normalized = normalize(text);

  const hasAnalyticsKeyword = includesAnyKeyword(normalized, ANALYTICS_KEYWORDS);
  const hasMonthKeyword = includesAnyKeyword(normalized, MONTH_KEYWORDS);
  const hasPeriodKeyword = includesAnyKeyword(normalized, PERIOD_KEYWORDS);
  const hasFinanceKeyword = includesAnyKeyword(normalized, FINANCE_KEYWORDS);

  if (hasAnalyticsKeyword && hasMonthKeyword) return true;
  if (hasAnalyticsKeyword && hasPeriodKeyword) return true;
  if (hasAnalyticsKeyword && hasFinanceKeyword) return true;

  // Например: "анализ за май месяц", "итоги мая", "статистика месяца"
  if (hasAnalyticsKeyword && normalized.length <= 90) return true;

  return false;
};

const isFinanceQuestion = (text: string) => {
  const normalized = normalize(text);

  if (!normalized) return false;

  const hasFinanceKeyword = includesAnyKeyword(normalized, FINANCE_KEYWORDS);

  if (hasFinanceKeyword) return true;

  if (isAnalysisRequest(normalized)) return true;

  // Короткие вопросы после финансового контекста:
  // "что делать?", "как улучшить?", "почему так?", "покажи еще"
  if (
    normalized.length <= 55 &&
    /^(что|как|почему|зачем|сколько|можно|нужно|лучше|посоветуй|покажи|сделай|дай|объясни|сравни)/.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
};

const looksClearlyNotFinance = (text: string) => {
  const normalized = normalize(text);

  const hasBlockedKeyword = includesAnyKeyword(normalized, BLOCKED_GENERAL_TOPICS);
  const hasFinanceMeaning = isFinanceQuestion(normalized);

  return hasBlockedKeyword && !hasFinanceMeaning;
};

const getRequestMode = (text: string) => {
  const normalized = normalize(text);

  if (isAnalysisRequest(normalized)) {
    return 'analysis';
  }

  if (
    normalized.includes('долг') ||
    normalized.includes('кредит') ||
    normalized.includes('займ') ||
    normalized.includes('қарыз') ||
    normalized.includes('debt') ||
    normalized.includes('loan') ||
    normalized.includes('credit')
  ) {
    return 'debt';
  }

  if (
    normalized.includes('лимит') ||
    normalized.includes('бюджет') ||
    normalized.includes('limit') ||
    normalized.includes('budget')
  ) {
    return 'budget';
  }

  if (
    normalized.includes('цель') ||
    normalized.includes('накоп') ||
    normalized.includes('сбереж') ||
    normalized.includes('мақсат') ||
    normalized.includes('жинақ') ||
    normalized.includes('goal') ||
    normalized.includes('saving')
  ) {
    return 'goal';
  }

  return 'general';
};

const getModeInstruction = (mode: string) => {
  if (mode === 'analysis') {
    return `
Пользователь просит финансовый анализ, отчет, итоги, статистику или сводку.

Если пользователь пишет коротко, например:
- "анализ за май месяц"
- "анализ за май"
- "итоги за апрель"
- "статистика месяца"
- "сводка расходов"
- "покажи отчет"

понимай это как просьбу проанализировать финансовые операции пользователя за указанный период.

Формат ответа для анализа:
1. Краткий вывод за период
2. Общий доход
3. Общий расход
4. Баланс за период
5. Самые большие категории расходов
6. Самые крупные или подозрительные траты
7. Что можно сократить
8. Практические рекомендации
9. Итог одним предложением

Если данных за период нет или они не переданы в контексте — не придумывай цифры.
Скажи, что данных за этот период недостаточно, и предложи добавить операции или выбрать другой период.
`;
  }

  if (mode === 'debt') {
    return `
Пользователь спрашивает про долги, кредиты или займы.

Формат ответа:
1. Оцени ситуацию
2. Объясни риски
3. Предложи порядок погашения
4. Дай практический план действий
5. Предупреди, какие расходы лучше временно сократить
`;
  }

  if (mode === 'budget') {
    return `
Пользователь спрашивает про бюджет или лимиты.

Формат ответа:
1. Оцени текущую ситуацию
2. Предложи разумные лимиты
3. Объясни, какие категории контролировать
4. Дай короткий план на неделю или месяц
`;
  }

  if (mode === 'goal') {
    return `
Пользователь спрашивает про финансовые цели или накопления.

Формат ответа:
1. Определи цель
2. Предложи сумму регулярного откладывания
3. Дай примерный план накопления
4. Объясни, какие траты можно уменьшить
`;
  }

  return `
Пользователь задает вопрос по личным финансам или функциям FinBuddy.
Отвечай конкретно, понятно и без лишней воды.
`;
};

export default function AiChatScreen() {
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text:
        'Привет. Я финансовый AI-помощник FinBuddy. Могу помочь с расходами, бюджетом, лимитами, целями, долгами, подписками и финансовой аналитикой. На общие темы не отвечаю.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  };

  const buildFinancePrompt = (question: string) => {
    const mode = getRequestMode(question);
    const modeInstruction = getModeInstruction(mode);

    const recentMessages = messages
      .slice(-8)
      .map((message) => `${message.role === 'user' ? 'Пользователь' : 'AI'}: ${message.text}`)
      .join('\n');

    return `
Ты — финансовый AI-помощник мобильного приложения FinBuddy.
Ты НЕ универсальный чат-бот. Отвечай только по теме личных финансов и функций FinBuddy.

Главная задача:
Помогать пользователю понимать расходы, доходы, бюджет, лимиты, цели, долги, подписки и финансовую аналитику.

Разрешенные темы:
- расходы и доходы
- анализ расходов
- анализ доходов
- финансовая статистика
- бюджет и лимиты
- финансовые цели
- счета и баланс
- подписки и регулярные платежи
- долги, кредиты, займы
- экономия
- финансовая аналитика
- рекомендации по улучшению финансового поведения
- объяснение функций FinBuddy

Запрещенные темы:
- программирование
- учебные задачи не по финансам
- новости, политика, погода
- кино, сериалы, игры, рецепты
- любые общие вопросы вне личных финансов

Правила ответа:
- Регион: Казахстан.
- Валюта: тенге.
- Не используй рубли.
- Не придумывай операции, суммы, доходы и расходы, если их нет в данных.
- Если данных нет — честно скажи, что данных недостаточно.
- Если вопрос короткий, но похож на финансовый анализ, не отказывайся.
- Не отвечай слишком длинно.
- Пиши понятно, как помощник в мобильном приложении.
- Не используй сложные банковские термины без объяснения.
- Давай практические советы.
- Если видишь проблему в расходах — скажи прямо, но мягко.

${modeInstruction}

Контекст последних сообщений:
${recentMessages || 'Контекста пока нет.'}

Текущий вопрос пользователя:
${question}
`;
  };

  const sendMessage = async (customText?: string) => {
    const question = (customText || input).trim();

    if (!question || sending) return;

    if (!user?.id) {
      Alert.alert('Ошибка', 'Пользователь не найден.');
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);
    scrollToBottom();

    try {
      if (looksClearlyNotFinance(question)) {
        const botMessage: ChatMessage = {
          id: `assistant-refusal-${Date.now()}`,
          role: 'assistant',
          text: refusalText,
        };

        setMessages((prev) => [...prev, botMessage]);
        scrollToBottom();
        return;
      }

      const answer = await askFinanceAi(user.id, buildFinancePrompt(question));

      const botMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: answer || 'Не удалось получить ответ. Попробуйте еще раз.',
      };

      setMessages((prev) => [...prev, botMessage]);
      scrollToBottom();
    } catch (error) {
      console.error('AI Chat Error:', error);

      const errorMessage: ChatMessage = {
        id: `assistant-error-${Date.now()}`,
        role: 'assistant',
        text: 'Не удалось получить ответ от AI. Проверь API-ключ, интернет и сервис aiChatService.',
      };

      setMessages((prev) => [...prev, errorMessage]);
      scrollToBottom();
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        text:
          'Чат очищен. Задай вопрос про финансы: расходы, доходы, бюджет, цели, долги, счета или подписки.',
      },
    ]);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
        {!isUser && (
          <View style={styles.avatar}>
            <AppIcon name="ai" size={18} color="#FFFFFF" />
          </View>
        )}

        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <Text style={styles.quickTitle}>Быстрые вопросы</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.starters}
        keyboardShouldPersistTaps="handled"
      >
        {starterQuestions.map((question) => (
          <TouchableOpacity
            key={question}
            style={styles.starterChip}
            onPress={() => sendMessage(question)}
            disabled={sending}
            activeOpacity={0.86}
          >
            <Text style={styles.starterText}>{question}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const composerBottomPadding = Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : 8;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.container}>
        <View style={styles.headerWrap}>
          <ScreenHeader
            title="AI-чат"
            subtitle=""
            back
            icon="ai"
            rightText="Очистить"
            onRightPress={clearChat}
          />
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
        />

        {sending && (
          <View style={styles.typingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.typingText}>AI анализирует...</Text>
          </View>
        )}

        <View
          style={[
            styles.composerWrap,
            {
              paddingBottom: composerBottomPadding,
            },
          ]}
        >
          <View style={styles.composerCard}>
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                placeholder="Например: анализ за май месяц"
                placeholderTextColor={colors.inkMuted}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={700}
                editable={!sending}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                onPress={() => sendMessage()}
                disabled={!canSend}
                activeOpacity={0.86}
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <AppIcon name="send" size={21} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.inputInfoRow}>
              <Text style={styles.inputHint}>AI понимает анализ, отчёты и расходы</Text>
              <Text style={styles.inputCounter}>{input.length}/700</Text>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },

  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: colors.background,
  },

  messagesContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },

  listHeader: {
    paddingBottom: 8,
  },

  quickTitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 10,
  },

  starters: {
    paddingBottom: 10,
  },

  starterChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
  },

  starterText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },

  messageRowUser: {
    justifyContent: 'flex-end',
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  bubble: {
    maxWidth: '82%',
    borderRadius: radius.xl,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },

  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  userBubble: {
    backgroundColor: colors.dark,
  },

  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },

  assistantText: {
    color: colors.ink,
  },

  userText: {
    color: '#FFFFFF',
  },

  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },

  typingText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
  },

  composerWrap: {
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  composerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 10 : 6,
    paddingBottom: Platform.OS === 'ios' ? 10 : 6,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },

  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  sendButtonDisabled: {
    backgroundColor: colors.inkMuted,
    opacity: 0.55,
  },

  inputInfoRow: {
    marginTop: 6,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  inputHint: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '700',
  },

  inputCounter: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '800',
  },
});