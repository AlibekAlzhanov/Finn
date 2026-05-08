import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';
import {
  BASE_CURRENCY,
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  getCurrencyInfo,
  normalizeCurrencyCode,
} from '../services/currencyService';

type Account = {
  id: string;
  name: string | null;
  currency_code?: string | null;
  created_at?: string | null;
};

type Transaction = {
  type?: string | null;
  amount?: number | string | null;
  account_id?: string | null;
  to_account_id?: string | null;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function AccountsScreen() {
  const { user } = useAuthStore();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(BASE_CURRENCY);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user?.id])
  );

  const totalBalanceKzt = useMemo(() => {
    return transactions.reduce((sum, tx) => {
      const amount = safeNumber(tx.amount);

      if (tx.type === 'income') return sum + amount;
      if (tx.type === 'expense') return sum - amount;

      return sum;
    }, 0);
  }, [transactions]);

  const getAccountBalance = (accountId: string) => {
    return transactions.reduce((sum, tx) => {
      const amount = safeNumber(tx.amount);

      if (tx.type === 'income' && tx.account_id === accountId) return sum + amount;
      if (tx.type === 'expense' && tx.account_id === accountId) return sum - amount;

      if (tx.type === 'transfer') {
        if (tx.account_id === accountId) return sum - amount;
        if (tx.to_account_id === accountId) return sum + amount;
      }

      return sum;
    }, 0);
  };

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [accountsResult, transactionsResult] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, name, currency_code, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),

        supabase
          .from('transactions')
          .select('type, amount, account_id, to_account_id')
          .eq('user_id', user.id),
      ]);

      if (accountsResult.error) throw accountsResult.error;
      if (transactionsResult.error) throw transactionsResult.error;

      setAccounts(((accountsResult.data || []).filter(Boolean)) as Account[]);
      setTransactions(((transactionsResult.data || []).filter(Boolean)) as Transaction[]);
    } catch (error) {
      console.error('Ошибка загрузки счетов:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить счета. Если ты еще не выполнил SQL этапа 22, выполни его.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setCurrency(BASE_CURRENCY);
    setModalVisible(true);
  };

  const openEdit = (account: Account) => {
    setEditingId(account.id);
    setName(account.name || '');
    setCurrency(normalizeCurrencyCode(account.currency_code));
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalVisible(false);
    setEditingId(null);
  };

  const saveAccount = async () => {
    if (!user?.id) return;

    const cleanName = name.trim();

    if (!cleanName) {
      Alert.alert('Проверьте данные', 'Введите название счета.');
      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        const { error } = await supabase
          .from('accounts')
          .update({
            name: cleanName,
            currency_code: currency,
          })
          .eq('id', editingId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('accounts').insert({
          user_id: user.id,
          name: cleanName,
          currency_code: currency,
        });

        if (error) throw error;
      }

      closeModal();
      await loadData();
    } catch (error) {
      console.error('Ошибка сохранения счета:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить счет.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = (account: Account) => {
    Alert.alert('Удалить счет?', account.name || 'Счет', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) return;

          try {
            const { error } = await supabase
              .from('accounts')
              .delete()
              .eq('id', account.id)
              .eq('user_id', user.id);

            if (error) throw error;

            await loadData();
          } catch (error) {
            console.error('Ошибка удаления счета:', error);
            Alert.alert('Ошибка', 'Не удалось удалить счет. Возможно, к нему привязаны операции.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка счетов...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScreenHeader
          title="Счета"
          subtitle="С валютой каждого счета"
          back
          icon="wallet"
          rightText="+ Счет"
          onRightPress={openCreate}
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Общий баланс в базовой валюте</Text>
          <Text style={styles.heroAmount}>{formatKzt(totalBalanceKzt)}</Text>
          <Text style={styles.heroText}>
            Аналитика и бюджеты считаются в KZT, даже если операция была в другой валюте.
          </Text>
        </View>

        {accounts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Счетов пока нет</Text>
            <Text style={styles.emptyText}>Создай Kaspi, наличные или валютный счет.</Text>

            <TouchableOpacity style={styles.emptyButton} onPress={openCreate}>
              <Text style={styles.emptyButtonText}>Создать счет</Text>
            </TouchableOpacity>
          </View>
        ) : (
          accounts.map((account) => {
            const info = getCurrencyInfo(account.currency_code);
            const balance = getAccountBalance(account.id);

            return (
              <View key={account.id} style={styles.accountCard}>
                <View style={styles.accountIcon}>
                  <Text style={styles.accountIconText}>{info.symbol}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName}>{account.name || 'Счет'}</Text>
                  <Text style={styles.accountMeta}>
                    Валюта счета: {info.code} · {info.shortName}
                  </Text>
                  <Text style={styles.accountBalance}>Баланс в KZT: {formatKzt(balance)}</Text>
                </View>

                <View style={styles.accountActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => openEdit(account)}>
                    <AppIcon name="edit" size={16} color={colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => deleteAccount(account)}
                  >
                    <AppIcon name="delete" size={16} color={colors.coral} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingId ? 'Изменить счет' : 'Новый счет'}</Text>

            <Text style={styles.inputLabel}>Название</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Например: Kaspi"
              placeholderTextColor={colors.inkMuted}
            />

            <Text style={styles.inputLabel}>Валюта счета</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyRow}>
              {SUPPORTED_CURRENCIES.map((item) => {
                const isActive = currency === item.code;

                return (
                  <TouchableOpacity
                    key={item.code}
                    style={[styles.currencyChip, isActive && styles.currencyChipActive]}
                    onPress={() => setCurrency(item.code)}
                  >
                    <Text style={[styles.currencySymbol, isActive && styles.currencyTextActive]}>
                      {item.symbol}
                    </Text>
                    <Text style={[styles.currencyCode, isActive && styles.currencyTextActive]}>
                      {item.code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveAccount}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Сохранить</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={saving}>
              <Text style={styles.cancelButtonText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 36 },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.inkMuted, fontSize: 14, fontWeight: '700', marginTop: 12 },
  heroCard: { backgroundColor: colors.dark, borderRadius: radius.xxl, padding: 22, marginBottom: 14, ...shadow.elevated },
  heroLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '800' },
  heroAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 8 },
  heroText: { color: '#CBD5E1', fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 8 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...shadow.soft },
  emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: '900', marginBottom: 7 },
  emptyText: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 14 },
  emptyButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  accountCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', marginBottom: 12, ...shadow.soft },
  accountIcon: { width: 50, height: 50, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  accountIconText: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  accountName: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  accountMeta: { color: colors.inkMuted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  accountBalance: { color: colors.inkSoft, fontSize: 12, fontWeight: '800', marginTop: 5 },
  accountActions: { flexDirection: 'row', marginLeft: 8 },
  actionButton: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  deleteButton: { backgroundColor: colors.coralSoft },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(18, 24, 38, 0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 22 },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '900', marginBottom: 18 },
  inputLabel: { color: colors.inkMuted, fontSize: 13, fontWeight: '900', marginBottom: 8 },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, marginBottom: 16 },
  currencyRow: { marginBottom: 16 },
  currencyChip: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: 13, paddingVertical: 10, marginRight: 8, borderWidth: 1, borderColor: colors.border, minWidth: 74, alignItems: 'center' },
  currencyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  currencySymbol: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  currencyCode: { color: colors.inkMuted, fontSize: 11, fontWeight: '900', marginTop: 2 },
  currencyTextActive: { color: '#FFFFFF' },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  cancelButton: { alignItems: 'center', paddingVertical: 14 },
  cancelButtonText: { color: colors.inkMuted, fontSize: 14, fontWeight: '900' },
});
