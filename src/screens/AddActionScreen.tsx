import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { useAuthStore } from '../store/useAuthStore';
import { supabase } from '../services/supabase';
import { parseExpenseWithAI, transcribeAudio } from '../services/aiService';
import { parseUniversalVoiceCommand } from '../services/voiceCommandService';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon, { IconName } from '../components/ui/AppIcon';

type ActionItem = {
  title: string;
  subtitle: string;
  icon: IconName;
  onPress: () => void;
  badge?: string;
};

export default function AddActionScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const [aiText, setAiText] = useState('');
  const [processing, setProcessing] = useState(false);

  const openTransactionReview = async (textToProcess: string) => {
    if (!user?.id) return;

    const { data: accounts, error: accError } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (accError) console.error('Ошибка поиска счета:', accError);

    if (!accounts || accounts.length === 0) {
      Alert.alert('Ошибка', "Сначала создайте счет в разделе 'Счета'");
      return;
    }

    const parsedData = await parseExpenseWithAI(textToProcess, user.id);

    if (parsedData && parsedData.length > 0) {
      navigation.navigate('AiReview', {
        data: parsedData,
        defaultAccountId: accounts[0].id,
        originalText: textToProcess,
      });
    } else {
      Alert.alert('AI не понял', 'Попробуйте сформулировать иначе.');
    }
  };

  const processCommand = async (textToProcess: string) => {
    if (!textToProcess.trim() || !user?.id) return;

    Keyboard.dismiss();
    setProcessing(true);

    try {
      const command = await parseUniversalVoiceCommand(textToProcess);
      setAiText('');

      if (command.intent === 'navigation') {
        navigation.navigate(command.screen);
        return;
      }

      if (command.intent === 'review') {
        navigation.navigate('VoiceActionReview', {
          command,
        });
        return;
      }

      if (command.intent === 'transaction') {
        await openTransactionReview(textToProcess);
        return;
      }

      await openTransactionReview(textToProcess);
    } catch (error) {
      console.error('Ошибка обработки команды:', error);
      Alert.alert('Системная ошибка', 'Не удалось обработать команду.');
    } finally {
      setProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к микрофону для голосового ввода.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      console.error('Ошибка старта записи:', error);
      Alert.alert('Ошибка', 'Не удалось начать запись голоса.');
    }
  };

  const stopRecording = async () => {
    try {
      setProcessing(true);
      await audioRecorder.stop();

      const uri = audioRecorder.uri;

      if (!uri) {
        Alert.alert('Ошибка', 'Файл записи не найден.');
        setProcessing(false);
        return;
      }

      const text = await transcribeAudio(uri);

      if (text) {
        setAiText(text);
        await processCommand(text);
      } else {
        Alert.alert('Ошибка', 'Не удалось распознать речь.');
        setProcessing(false);
      }
    } catch (error) {
      console.error('Ошибка остановки записи:', error);
      Alert.alert('Ошибка', 'Не удалось остановить запись.');
      setProcessing(false);
    }
  };

  const handleVoicePress = async () => {
    if (recorderState.isRecording) await stopRecording();
    else await startRecording();
  };

  const actions: ActionItem[] = [
    {
      title: 'Ручной ввод',
      subtitle: 'Добавить доход, расход или перевод вручную',
      icon: 'plus',
      onPress: () => navigation.navigate('ManualInput'),
    },
    {
      title: 'Голосом',
      subtitle: 'Скажи: “кофе 2500” или “создай цель айфон 700000”',
      icon: 'mic',
      onPress: handleVoicePress,
      badge: recorderState.isRecording ? 'Идёт запись' : undefined,
    },
    {
      title: 'AI-помощник',
      subtitle: 'Спроси совет или попроси анализ расходов',
      icon: 'ai',
      onPress: () => navigation.navigate('AiChat'),
      badge: 'AI',
    },
    {
      title: 'Счета',
      subtitle: 'Добавить карту, наличные или другой источник денег',
      icon: 'wallet',
      onPress: () => navigation.navigate('Accounts'),
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Добавить"
          subtitle="Быстрый ввод операций и команд"
          icon="plus"
        />

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <AppIcon name="plus" size={28} color="#FFFFFF" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Одно место для ввода</Text>
            <Text style={styles.heroText}>
              Добавляй операции вручную, голосом или через AI-команду.
            </Text>
          </View>
        </View>

        <View style={styles.aiInputCard}>
          <Text style={styles.inputTitle}>AI-ввод текстом</Text>
          <Text style={styles.inputSubtitle}>
            Напиши простую команду: “продукты 8500”, “зарплата 300000”, “подписка Netflix 3990”.
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Например: кофе 2500"
              placeholderTextColor={colors.inkMuted}
              value={aiText}
              onChangeText={setAiText}
              multiline
              maxLength={220}
              editable={!processing && !recorderState.isRecording}
            />

            <TouchableOpacity
              style={[
                styles.sendButton,
                aiText.trim() ? styles.sendButtonActive : styles.sendButtonDisabled,
              ]}
              onPress={() => processCommand(aiText)}
              disabled={processing || recorderState.isRecording || !aiText.trim()}
              activeOpacity={0.86}
            >
              {processing ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <AppIcon name="send" size={22} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actionsGrid}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.title}
              style={styles.actionCard}
              onPress={action.onPress}
              disabled={processing && action.title === 'Голосом'}
              activeOpacity={0.86}
            >
              <View style={styles.actionIcon}>
                {processing && action.title === 'Голосом' ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <AppIcon name={action.icon} size={24} color={colors.primary} />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.actionTitleRow}>
                  <Text style={styles.actionTitle}>{action.title}</Text>

                  {!!action.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{action.badge}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Подсказка</Text>
          <Text style={styles.noteText}>
            Чем проще команда, тем точнее AI распознаёт операцию. Например: “такси 1700” или “зарплата 250000”.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 36 },

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.elevated,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  heroText: { color: '#CBD5E1', fontSize: 13, lineHeight: 19, marginTop: 5, fontWeight: '700' },

  aiInputCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    ...shadow.soft,
  },
  inputTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  inputSubtitle: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    minHeight: 50,
    maxHeight: 105,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sendButtonActive: { backgroundColor: colors.dark },
  sendButtonDisabled: { backgroundColor: colors.inkMuted },

  actionsGrid: { marginBottom: 14 },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.soft,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  actionTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  actionSubtitle: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  badge: {
    marginLeft: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: colors.primary, fontSize: 10, fontWeight: '900' },

  noteCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: 16,
  },
  noteTitle: { color: colors.primaryDark, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  noteText: { color: colors.primaryDark, fontSize: 13, lineHeight: 19, fontWeight: '700' },
});
