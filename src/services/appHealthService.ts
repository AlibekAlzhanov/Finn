import { supabase } from './supabase';

export type AppHealthCheckResult = {
  ok: boolean;
  checks: {
    name: string;
    ok: boolean;
    message: string;
  }[];
};

const checkTable = async (tableName: string) => {
  try {
    const { error } = await supabase.from(tableName).select('id').limit(1);

    if (error) {
      return {
        name: tableName,
        ok: false,
        message: error.message,
      };
    }

    return {
      name: tableName,
      ok: true,
      message: 'OK',
    };
  } catch (error) {
    return {
      name: tableName,
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const runAppHealthCheck = async (): Promise<AppHealthCheckResult> => {
  const checks = await Promise.all([
    checkTable('accounts'),
    checkTable('categories'),
    checkTable('transactions'),
    checkTable('budgets'),
    checkTable('goals'),
    checkTable('recurring_payments'),
  ]);

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
};
