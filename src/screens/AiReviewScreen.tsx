import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';
import {
  BASE_CURRENCY,
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  detectCurrencyCodeFromText,
  formatCurrencyAmount,
  normalizeCurrencyCode,
} from '../services/currencyService';
import {
  getExchangeRate,
  prepareCurrencyTransactionPayload,
} from '../services/exchangeRateService';
import { normalizeAiOperationCurrencies } from '../services/aiCurrencyOperationEnhancer';

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

type ReviewRow = {
  localId: string;
  type: TxType;
  amountText: string;
  currency: CurrencyCode;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  categoryName: string;
  note: string;
  tagsText: string;
  ratePreview?: {
    rate: number;
    convertedAmount: number;
    source: string;
  } | null;
  currencyDetectedBy?: 'ai' | 'near_amount' | 'text' | 'default';
};

const safeNumber = (value: unknown) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: unknown) => {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').trim();
};

const normalizeTags = (value: string): string[] | null => {
  const tags = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : null;
};

export default function AiReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuthStore();

  const rawData = Array.isArray(route.params?.data) ? route.params.data : [];
  const defaultAccountId = route.params?.defaultAccountId || '';
  const originalText = String(route.params?.originalText || '');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const totalBaseAmount = useMemo(() => {
    return rows.reduce((sum, row) => {
      if (row.ratePreview?.convertedAmount) return sum + row.ratePreview.convertedAmount;
      return sum + safeNumber(row.amountText);
    }, 0);
  }, [rows]);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  useEffect(() => {
    if (loading) return;
    if (rows.length > 0) return;

    const enhancedData = normalizeAiOperationCurrencies(rawData, originalText);
    const built = buildRows(enhancedData);
    setRows(built);

    built.forEach((row) => refreshRatePreview(row.localId, row.currency, row.amountText));
  }, [loading, accounts, categories]);

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
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

      setAccounts(((accountsResult.data || []).filter(Boolean)) as Account[]);
      setCategories(((categoriesResult.data || []).filter(Boolean)) as Category[]);
    } catch (error) {
      console.error('Ошибка загрузки AI Review:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить данные.');
    } finally {
      setLoading(false);
    }
  };

  const findCategoryId = (name: string, type: TxType) => {
    if (type === 'transfer') return '';

    const cleanName = normalize(name);

    if (!cleanName) return '';

    const source = categories.filter((category) => category.type === type);

    const exact = source.find((category) => normalize(category.name) === cleanName);
    if (exact) return exact.id;

    const included = source.find((category) => {
      const categoryName = normalize(category.name);
      return categoryName.includes(cleanName) || cleanName.includes(categoryName);
    });

    return included?.id || '';
  };

  const buildRows = (items: any[]): ReviewRow[] => {
    const firstAccount = accounts.find((account) => account.id === defaultAccountId) || accounts[0];
    const secondAccount = accounts.find((account) => account.id !== firstAccount?.id) || accounts[0];

    if (!items || items.length === 0) {
      return [
        {
          localId: `ai-row-empty-${Date.now()}`,
          type: 'expense',
          amountText: '',
          currency: detectCurrencyCodeFromText(originalText),
          currencyDetectedBy: 'text',
          accountId: firstAccount?.id || '',
          toAccountId: secondAccount?.id || '',
          categoryId: '',
          categoryName: '',
          note: originalText,
          tagsText: '',
          ratePreview: null,
        },
      ];
    }

    return items.map((item, index) => {
      const type: TxType =
        item?.type === 'income' || item?.operation_type === 'income'
          ? 'income'
          : item?.type === 'transfer' || item?.operation_type === 'transfer'
            ? 'transfer'
            : 'expense';

      const categoryName = String(
        item?.categoryName ||
          item?.category_name ||
          item?.category ||
          item?.name ||
          ''
      );

      const amountValue =
        item?.amount ??
        item?.sum ??
        item?.value ??
        item?.price ??
        '';

      const detectedCurrency =
        item?.currency ||
        item?.currency_code ||
        item?.original_currency ||
        detectCurrencyCodeFromText(`${originalText} ${item?.note || ''} ${item?.description || ''}`);

      return {
        localId: `ai-row-${index}-${Date.now()}`,
        type,
        amountText: String(amountValue || ''),
        currency: normalizeCurrencyCode(detectedCurrency),
        currencyDetectedBy: item?.currency_detected_by || 'text',
        accountId: firstAccount?.id || '',
        toAccountId: secondAccount?.id || '',
        categoryId: findCategoryId(categoryName, type),
        categoryName,
        note: String(item?.note || item?.description || item?.title || categoryName || originalText || ''),
        tagsText: Array.isArray(item?.tags) ? item.tags.join(', ') : String(item?.tags || ''),
        ratePreview: null,
      };
    });
  };

  const updateRow = (localId: string, patch: Partial<ReviewRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  };

  const refreshRatePreview = async (
    localId: string,
    currency: CurrencyCode,
    amountText: string
  ) => {
    const amount = safeNumber(amountText);

    if (amount <= 0) {
      updateRow(localId, { ratePreview: null });
      return;
    }

    try {
      const rate = await getExchangeRate(currency, BASE_CURRENCY);

      updateRow(localId, {
        ratePreview: {
          rate: rate.rate,
          convertedAmount: Math.round(amount * rate.rate * 100) / 100,
          source: rate.source,
        },
      });
    } catch (error) {
      console.log('AI Review rate preview failed:', error);
      updateRow(localId, { ratePreview: null });
    }
  };

  const createCategoryIfNeeded = async (row: ReviewRow) => {
    if (!user?.id || row.type === 'transfer') return '';

    if (row.categoryId) return row.categoryId;

    const cleanName = row.categoryName.trim() || row.note.trim();

    if (!cleanName) return '';

    const existingId = findCategoryId(cleanName, row.type);

    if (existingId) return existingId;

    const { data, error } = await supabase
      .from('categories')
      .insert({
        user_id: user.id,
        name: cleanName,
        type: row.type,
      })
      .select('id')
      .single();

    if (error) throw error;

    return data?.id || '';
  };

  const saveAll = async () => {
    if (!user?.id) return;

    try {
      setSaving(true);

      for (const row of rows) {
        const amount = safeNumber(row.amountText);

        if (amount <= 0) {
          throw new Error('В одной из операций не указана сумма.');
        }

        if (!row.accountId) {
          throw new Error('В одной из операций не выбран счет.');
        }

        if (row.type === 'transfer' && !row.toAccountId) {
          throw new Error('В переводе не выбран счет получения.');
        }

        if (row.type === 'transfer' && row.accountId === row.toAccountId) {
          throw new Error('В переводе счета должны отличаться.');
        }

        const categoryId = await createCategoryIfNeeded(row);

        if (row.type !== 'transfer' && !categoryId) {
          throw new Error('В одной из операций не выбрана категория.');
        }

        const currencyPayload = await prepareCurrencyTransactionPayload({
          amount,
          originalCurrency: row.currency,
          baseCurrency: BASE_CURRENCY,
        });

        const { error } = await supabase.from('transactions').insert({
          user_id: user.id,
          type: row.type,
          account_id: row.accountId,
          to_account_id: row.type === 'transfer' ? row.toAccountId : null,
          category_id: row.type === 'transfer' ? null : categoryId,
          note: row.note.trim() || null,
          tags: normalizeTags(row.tagsText),
          transaction_date: new Date().toISOString(),
          ...currencyPayload,
        });

        if (error) throw error;
      }

      Alert.alert('Готово', 'AI-операции сохранены с учетом валют.', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Root'),
        },
      ]);
    } catch (error: any) {
      console.error('Ошибка сохранения AI операций:', error);
      Alert.alert('Ошибка', error?.message || 'Не удалось сохранить AI-операции.');
    } finally {
      setSaving(false);
    }
  };

  const renderTypeSwitch = (row: ReviewRow) => {
    const types: TxType[] = ['expense', 'income', 'transfer'];

    return (
      <View style={styles.typeSwitch}>
        {types.map((type) => {
          const isActive = row.type === type;

          return (
            <TouchableOpacity
              key={`${row.localId}-${type}`}
              style={[styles.typeOption, isActive && styles.typeOptionActive]}
              onPress={() =>
                updateRow(row.localId, {
                  type,
                  categoryId: type === 'transfer' ? '' : findCategoryId(row.categoryName, type),
                })
              }
            >
              <Text style={[styles.typeText, isActive && styles.typeTextActive]}>
                {type === 'expense' ? 'Расход' : type === 'income' ? 'Доход' : 'Перевод'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderCurrencyPicker = (row: ReviewRow) => (
    <>
      <Text style={styles.inputLabel}>Валюта</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
        {SUPPORTED_CURRENCIES.map((item) => {
          const isActive = row.currency === item.code;

          return (
            <TouchableOpacity
              key={`${row.localId}-${item.code}`}
              style={[styles.currencyChip, isActive && styles.currencyChipActive]}
              onPress={() => {
                updateRow(row.localId, { currency: item.code });
                refreshRatePreview(row.localId, item.code, row.amountText);
              }}
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

  const renderAccountPicker = (row: ReviewRow, field: 'accountId' | 'toAccountId', label: string) => (
    <>
      <Text style={styles.inputLabel}>{label}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
        {accounts.map((account) => {
          const isActive = row[field] === account.id;

          return (
            <TouchableOpacity
              key={`${row.localId}-${field}-${account.id}`}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => updateRow(row.localId, { [field]: account.id })}
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

  const renderCategoryPicker = (row: ReviewRow) => {
    if (row.type === 'transfer') return null;

    const source = categories.filter((category) => category.type === row.type);

    return (
      <>
        <Text style={styles.inputLabel}>Категория</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
          {source.map((category) => {
            const isActive = row.categoryId === category.id;

            return (
              <TouchableOpacity
                key={`${row.localId}-${category.id}`}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() =>
                  updateRow(row.localId, {
                    categoryId: category.id,
                    categoryName: category.name || '',
                  })
                }
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {category.name || 'Категория'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.inputLabel}>Новая категория / название из AI</Text>
        <TextInput
          style={styles.input}
          value={row.categoryName}
          onChangeText={(value) => updateRow(row.localId, { categoryName: value })}
          placeholder="Например: Кино"
          placeholderTextColor={colors.inkMuted}
        />
      </>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Проверка AI-операций...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="AI-проверка"
          subtitle="Перед сохранением проверь валюту и курс"
          back
          icon="ai"
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Итого после конвертации</Text>
          <Text style={styles.heroAmount}>
            {formatCurrencyAmount(totalBaseAmount, BASE_CURRENCY)}
          </Text>
          <Text style={styles.heroText}>
            В базу сохраняется сумма в KZT, а исходная валюта остается в истории операции.
          </Text>
        </View>

        {rows.map((row, index) => (
          <View key={row.localId} style={styles.reviewCard}>
            <Text style={styles.cardTitle}>Операция {index + 1}</Text>

            {renderTypeSwitch(row)}

            <Text style={styles.inputLabel}>Сумма</Text>
            <TextInput
              style={styles.amountInput}
              value={row.amountText}
              onChangeText={(value) => {
                updateRow(row.localId, { amountText: value });
                refreshRatePreview(row.localId, row.currency, value);
              }}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.inkMuted}
            />

            {renderCurrencyPicker(row)}

            <Text style={styles.currencyDetectText}>
              Валюта определена: {row.currencyDetectedBy === 'ai'
                ? 'AI'
                : row.currencyDetectedBy === 'near_amount'
                  ? 'по сумме в тексте'
                  : row.currencyDetectedBy === 'text'
                    ? 'по тексту'
                    : 'по умолчанию'}
            </Text>

            {row.ratePreview && (
              <View style={styles.rateBox}>
                <Text style={styles.rateText}>
                  ≈ {formatCurrencyAmount(row.ratePreview.convertedAmount, BASE_CURRENCY)}
                </Text>
                <Text style={styles.rateSubText}>
                  1 {row.currency} = {row.ratePreview.rate.toFixed(4)} {BASE_CURRENCY} · {row.ratePreview.source}
                </Text>
              </View>
            )}

            {renderAccountPicker(row, 'accountId', row.type === 'transfer' ? 'Счет списания' : 'Счет')}
            {row.type === 'transfer' && renderAccountPicker(row, 'toAccountId', 'Счет получения')}
            {renderCategoryPicker(row)}

            <Text style={styles.inputLabel}>Заметка</Text>
            <TextInput
              style={styles.input}
              value={row.note}
              onChangeText={(value) => updateRow(row.localId, { note: value })}
              placeholder="Например: кофе"
              placeholderTextColor={colors.inkMuted}
            />

            <Text style={styles.inputLabel}>Теги</Text>
            <TextInput
              style={styles.input}
              value={row.tagsText}
              onChangeText={(value) => updateRow(row.localId, { tagsText: value })}
              placeholder="например: еда, долг"
              placeholderTextColor={colors.inkMuted}
            />
          </View>
        ))}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveAll}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Сохранить все операции</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  heroAmount: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 8 },
  heroText: { color: '#CBD5E1', fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 8 },
  reviewCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12, ...shadow.soft },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: 12 },
  typeSwitch: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 5, flexDirection: 'row', marginBottom: 14 },
  typeOption: { flex: 1, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  typeOptionActive: { backgroundColor: colors.primary },
  typeText: { color: colors.inkMuted, fontSize: 12, fontWeight: '900' },
  typeTextActive: { color: '#FFFFFF' },
  inputLabel: { color: colors.inkMuted, fontSize: 13, fontWeight: '900', marginBottom: 8 },
  amountInput: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 13, fontSize: 26, color: colors.ink, fontWeight: '900', marginBottom: 14 },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, marginBottom: 14 },
  pickerRow: { marginBottom: 14 },
  chip: { backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.inkMuted, fontSize: 13, fontWeight: '900' },
  chipTextActive: { color: '#FFFFFF' },
  currencyChip: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: 13, paddingVertical: 10, marginRight: 8, borderWidth: 1, borderColor: colors.border, minWidth: 74, alignItems: 'center' },
  currencyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  currencySymbol: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  currencyCode: { color: colors.inkMuted, fontSize: 11, fontWeight: '900', marginTop: 2 },
  currencyTextActive: { color: '#FFFFFF' },
  currencyDetectText: { color: colors.inkMuted, fontSize: 11, fontWeight: '800', marginTop: -6, marginBottom: 12 },
  rateBox: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12, marginBottom: 14 },
  rateText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  rateSubText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700', marginTop: 4 },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
