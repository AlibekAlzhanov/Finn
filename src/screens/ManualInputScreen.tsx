import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';
import {
  BASE_CURRENCY,
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  formatCurrencyAmount,
  normalizeCurrencyCode,
} from '../services/currencyService';
import {
  getExchangeRate,
  prepareCurrencyTransactionPayload,
} from '../services/exchangeRateService';

type TxType = 'expense' | 'income' | 'transfer';

type Account = {
  id: string;
  name: string | null;
  currency_code?: string | null;
};

type Category = {
  id: string;
  name: string | null;
  type: string | null;
};

const safeNumber = (value: string) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const todayDateOnly = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const normalizeTags = (value: string): string[] | null => {
  const tags = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : null;
};

export default function ManualInputScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(BASE_CURRENCY);
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayDateOnly());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [ratePreview, setRatePreview] = useState<{
    rate: number;
    source: string;
    convertedAmount: number;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user?.id])
  );

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => category.type === type);
  }, [categories, type]);

  const selectedAccount = accounts.find((account) => account.id === accountId);

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [accountsResult, categoriesResult] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, name, currency_code')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),

        supabase
          .from('categories')
          .select('id, name, type')
          .eq('user_id', user.id)
          .order('name', { ascending: true }),
      ]);

      if (accountsResult.error) throw accountsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      const loadedAccounts = ((accountsResult.data || []).filter(Boolean)) as Account[];
      const loadedCategories = ((categoriesResult.data || []).filter(Boolean)) as Category[];

      setAccounts(loadedAccounts);
      setCategories(loadedCategories);

      const firstAccount = loadedAccounts[0];

      if (firstAccount) {
        setAccountId((prev) => prev || firstAccount.id);
        setCurrency(normalizeCurrencyCode(firstAccount.currency_code));
      }

      const firstCategory = loadedCategories.find((category) => category.type === type);

      if (firstCategory) {
        setCategoryId((prev) => prev || firstCategory.id);
      }

      const secondAccount = loadedAccounts.find((account) => account.id !== firstAccount?.id);
      setToAccountId((prev) => prev || secondAccount?.id || loadedAccounts[0]?.id || '');
    } catch (error) {
      console.error('Ошибка загрузки ручного ввода:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить данные.');
    } finally {
      setLoading(false);
    }
  };

  const refreshRatePreview = async (nextCurrency?: CurrencyCode, nextAmount?: string) => {
    const usedCurrency = nextCurrency || currency;
    const usedAmount = safeNumber(nextAmount ?? amount);

    if (usedAmount <= 0) {
      setRatePreview(null);
      return;
    }

    try {
      const rate = await getExchangeRate(usedCurrency, BASE_CURRENCY);
      setRatePreview({
        rate: rate.rate,
        source: rate.source,
        convertedAmount: Math.round(usedAmount * rate.rate * 100) / 100,
      });
    } catch (error) {
      console.log('Ошибка предпросмотра курса:', error);
      setRatePreview(null);
    }
  };

  const changeType = (nextType: TxType) => {
    setType(nextType);

    if (nextType === 'transfer') {
      setCategoryId('');
      return;
    }

    const firstCategory = categories.find((category) => category.type === nextType);
    setCategoryId(firstCategory?.id || '');
  };

  const changeAccount = (nextAccountId: string) => {
    setAccountId(nextAccountId);

    const account = accounts.find((item) => item.id === nextAccountId);

    if (account?.currency_code) {
      const nextCurrency = normalizeCurrencyCode(account.currency_code);
      setCurrency(nextCurrency);
      refreshRatePreview(nextCurrency, amount);
    }
  };

  const saveTransaction = async () => {
    if (!user?.id) return;

    const numericAmount = safeNumber(amount);

    if (numericAmount <= 0) {
      Alert.alert('Проверьте данные', 'Введите сумму.');
      return;
    }

    if (!accountId) {
      Alert.alert('Проверьте данные', 'Выберите счет.');
      return;
    }

    if (type !== 'transfer' && !categoryId) {
      Alert.alert('Проверьте данные', 'Выберите категорию.');
      return;
    }

    if (type === 'transfer' && !toAccountId) {
      Alert.alert('Проверьте данные', 'Выберите счет получения.');
      return;
    }

    if (type === 'transfer' && accountId === toAccountId) {
      Alert.alert('Проверьте данные', 'Счета перевода должны отличаться.');
      return;
    }

    try {
      setSaving(true);

      const currencyPayload = await prepareCurrencyTransactionPayload({
        amount: numericAmount,
        originalCurrency: currency,
        baseCurrency: BASE_CURRENCY,
      });

      const date = new Date(`${transactionDate}T12:00:00`);

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        type,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        category_id: type === 'transfer' ? null : categoryId,
        note: note.trim() || null,
        tags: normalizeTags(tags),
        transaction_date: date.toISOString(),
        ...currencyPayload,
      });

      if (error) throw error;

      Alert.alert('Готово', 'Операция сохранена.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('Ошибка сохранения операции:', error);
      Alert.alert(
        'Ошибка',
        error?.message || 'Не удалось сохранить операцию. Проверь курс валют и интернет.'
      );
    } finally {
      setSaving(false);
    }
  };

  const renderTypeSwitch = () => {
    const types: Array<{ key: TxType; label: string; icon: 'budget' | 'plus' | 'sync' }> = [
      { key: 'expense', label: 'Расход', icon: 'budget' },
      { key: 'income', label: 'Доход', icon: 'plus' },
      { key: 'transfer', label: 'Перевод', icon: 'sync' },
    ];

    return (
      <View style={styles.typeSwitch}>
        {types.map((item) => {
          const isActive = type === item.key;

          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.typeOption, isActive && styles.typeOptionActive]}
              onPress={() => changeType(item.key)}
              activeOpacity={0.86}
            >
              <AppIcon
                name={item.icon}
                size={17}
                color={isActive ? '#FFFFFF' : colors.inkMuted}
              />
              <Text style={[styles.typeText, isActive && styles.typeTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderCurrencyPicker = () => (
    <>
      <Text style={styles.inputLabel}>Валюта операции</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
        {SUPPORTED_CURRENCIES.map((item) => {
          const isActive = currency === item.code;

          return (
            <TouchableOpacity
              key={item.code}
              style={[styles.currencyChip, isActive && styles.currencyChipActive]}
              onPress={() => {
                setCurrency(item.code);
                refreshRatePreview(item.code, amount);
              }}
              activeOpacity={0.86}
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
    </>
  );

  const renderAccountPicker = (field: 'accountId' | 'toAccountId', label: string) => {
    const value = field === 'accountId' ? accountId : toAccountId;

    return (
      <>
        <Text style={styles.inputLabel}>{label}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
          {accounts.map((account) => {
            const isActive = value === account.id;

            return (
              <TouchableOpacity
                key={`${field}-${account.id}`}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() =>
                  field === 'accountId'
                    ? changeAccount(account.id)
                    : setToAccountId(account.id)
                }
                activeOpacity={0.86}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {account.name || 'Счет'} · {normalizeCurrencyCode(account.currency_code)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </>
    );
  };

  const renderCategoryPicker = () => {
    if (type === 'transfer') return null;

    return (
      <>
        <Text style={styles.inputLabel}>Категория</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
          {filteredCategories.map((category) => {
            const isActive = categoryId === category.id;

            return (
              <TouchableOpacity
                key={category.id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setCategoryId(category.id)}
                activeOpacity={0.86}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {category.name || 'Категория'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка формы...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Новая операция"
          subtitle="С поддержкой валют"
          back
          icon="plus"
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Сумма операции</Text>

          <View style={styles.amountRow}>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(value) => {
                setAmount(value);
                refreshRatePreview(currency, value);
              }}
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />

            <View style={styles.amountCurrencyBadge}>
              <Text style={styles.amountCurrencyText}>{currency}</Text>
            </View>
          </View>

          {ratePreview ? (
            <View style={styles.rateBox}>
              <Text style={styles.rateText}>
                ≈ {formatCurrencyAmount(ratePreview.convertedAmount, BASE_CURRENCY)}
              </Text>
              <Text style={styles.rateSubText}>
                Курс: 1 {currency} = {ratePreview.rate.toFixed(4)} {BASE_CURRENCY} · {ratePreview.source}
              </Text>
            </View>
          ) : (
            <Text style={styles.rateMuted}>
              Для KZT курс 1:1. Для валют курс загрузится автоматически.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          {renderTypeSwitch()}
          {renderCurrencyPicker()}
          {renderAccountPicker('accountId', type === 'transfer' ? 'Счет списания' : 'Счет')}

          {type === 'transfer' && renderAccountPicker('toAccountId', 'Счет получения')}

          {renderCategoryPicker()}

          <Text style={styles.inputLabel}>Дата</Text>
          <TextInput
            style={styles.input}
            value={transactionDate}
            onChangeText={setTransactionDate}
            placeholder="2026-05-14"
            placeholderTextColor={colors.inkMuted}
          />

          <Text style={styles.inputLabel}>Заметка</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="Например: кофе"
            placeholderTextColor={colors.inkMuted}
          />

          <Text style={styles.inputLabel}>Теги</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="например: работа, поездка"
            placeholderTextColor={colors.inkMuted}
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveTransaction}
            disabled={saving}
            activeOpacity={0.86}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Сохранить операцию</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 36 },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.inkMuted, fontSize: 14, fontWeight: '700', marginTop: 12 },
  heroCard: { backgroundColor: colors.dark, borderRadius: radius.xxl, padding: 20, marginBottom: 14, ...shadow.elevated },
  heroLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '800' },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  amountInput: { flex: 1, color: '#FFFFFF', fontSize: 42, fontWeight: '900', paddingVertical: 4 },
  amountCurrencyBadge: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  amountCurrencyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  rateBox: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: radius.lg, padding: 12, marginTop: 14 },
  rateText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  rateSubText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', marginTop: 4 },
  rateMuted: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, ...shadow.soft },
  typeSwitch: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 5, flexDirection: 'row', marginBottom: 16 },
  typeOption: { flex: 1, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  typeOptionActive: { backgroundColor: colors.primary },
  typeText: { color: colors.inkMuted, fontSize: 12, fontWeight: '900', marginLeft: 6 },
  typeTextActive: { color: '#FFFFFF' },
  inputLabel: { color: colors.inkMuted, fontSize: 13, fontWeight: '900', marginBottom: 8 },
  pickerRow: { marginBottom: 16 },
  chip: { backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.inkMuted, fontSize: 13, fontWeight: '900' },
  chipTextActive: { color: '#FFFFFF' },
  currencyChip: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: 13, paddingVertical: 10, marginRight: 8, borderWidth: 1, borderColor: colors.border, minWidth: 74, alignItems: 'center' },
  currencyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  currencySymbol: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  currencyCode: { color: colors.inkMuted, fontSize: 11, fontWeight: '900', marginTop: 2 },
  currencyTextActive: { color: '#FFFFFF' },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, marginBottom: 14 },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
