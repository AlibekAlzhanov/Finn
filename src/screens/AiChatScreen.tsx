import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../store/useAuthStore';
import { askFinanceAi } from '../services/aiChatService';
import {
  FinanceIntelligenceLoadResult,
  loadCurrentMonthFinanceIntelligence,
} from '../services/financeIntelligenceDataService';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';
import EmptyState from '../components/common/EmptyState';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

const quickQuestions = [
  'Что у меня сейчас с финансами?',
  'Какие расходы стоит сократить?',
  'Почему такой финансовый рейтинг?',
  'Где риск перерасхода?',
  'Какой лимит поставить на главную категорию?',
  'Что сделать до конца месяца?',
];

const createMessageId = () => {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function AiChatScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const scrollRef = useRef<ScrollView | null>(null);

  const [data, setData] = useState<FinanceIntelligenceLoadResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text:
        'Я AI-помощник FinBuddy. Я анализирую твои расходы, бюджет, цели, подписки и могу объяснить, что важно сделать сейчас.',
    },
  ]);

  const [input, setInput] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setLoadingData(false);
      return;
    }

    try {
      setLoadingData(true);

      const result = await loadCurrentMonthFinanceIntelligence(user.id, {
        autoChargeSubscriptions: false,
      });

      setData(result);
    } catch (error) {
      console.error('Ошибка загрузки AI-помощника:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить финансовый контекст.');
    } finally {
      setLoadingData(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const intelligence = data?.intelligence;

  const sendQuestion = async (question?: string) => {
    const text = (question || input).trim();

    if (!text || !user?.id || sending) return;

    Keyboard.dismiss();
    setInput('');

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      text,
    };

    setMessages((current) => [...current, userMessage]);
    setSending(true);

    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);

    try {
      const answer = await askFinanceAi({
        userId: user.id,
        question: text,
        periodStart: data?.meta.periodStart,
        periodEnd: data?.meta.periodEnd,
        mode: 'chat',
      });

      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        text: answer,
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      console.error('Ошибка отправки вопроса AI:', error);

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: 'assistant',
          text: 'Не удалось получить ответ. Попробуйте ещё раз.',
        },
      ]);
    } finally {
      setSending(false);

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 120);
    }
  };

  if (loadingData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка AI-помощника...</Text>
      </View>
    );
  }

  if (!intelligence) {
    return (
      <View style={styles.emptyScreen}>
        <ScreenHeader
          title="AI-помощник"
          subtitle="Объясняет финансы и предлагает действия"
          icon="ai"
          back
        />

        <EmptyState
          title="Нет финансового контекста"
          description="Добавь доходы, расходы, бюджеты или цели, чтобы AI-помощник мог давать персональные ответы."
          icon="ai"
          actionLabel="Добавить операцию"
          onAction={() => navigation.navigate('AddAction')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="AI-помощник"
          subtitle="Объясняет финансы и предлагает действия"
          icon="ai"
          back
        />

        <View style={styles.quickCard}>
          <Text style={styles.sectionTitle}>Быстрые вопросы</Text>

          <View style={styles.quickWrap}>
            {quickQuestions.map((question) => (
              <TouchableOpacity
                key={question}
                style={styles.quickChip}
                onPress={() => sendQuestion(question)}
                disabled={sending}
                activeOpacity={0.86}
              >
                <Text style={styles.quickChipText}>{question}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.chatCard}>
          <Text style={styles.sectionTitle}>Диалог</Text>

          {messages.map((message) => {
            const isUser = message.role === 'user';

            return (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  isUser ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isUser ? styles.userMessageText : styles.assistantMessageText,
                  ]}
                >
                  {message.text}
                </Text>
              </View>
            );
          })}

          {sending && (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.typingText}>Finn думает...</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.inputPanel}>
        <TextInput
          style={styles.input}
          placeholder="Спроси: что мне сократить?"
          placeholderTextColor={colors.inkMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={300}
          editable={!sending}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            input.trim() ? styles.sendButtonActive : styles.sendButtonDisabled,
          ]}
          onPress={() => sendQuestion()}
          disabled={sending || !input.trim()}
          activeOpacity={0.86}
        >
          {sending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <AppIcon name="send" size={22} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 120 },

  emptyScreen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '700',
  },

  quickCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    ...shadow.soft,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  quickWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quickChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
  },
  quickChipText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },

  chatCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  messageBubble: {
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 10,
    maxWidth: '92%',
  },
  userBubble: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  assistantMessageText: {
    color: colors.ink,
  },
  typingText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },

  inputPanel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    ...shadow.elevated,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    minHeight: 48,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 9,
  },
  sendButtonActive: {
    backgroundColor: colors.dark,
  },
  sendButtonDisabled: {
    backgroundColor: colors.inkMuted,
  },
});