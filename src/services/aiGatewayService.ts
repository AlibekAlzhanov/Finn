import { supabase } from './supabase';

export type FinanceAiMode = 'chat' | 'analytics' | 'report';

export type FinanceAiGatewayParams = {
  question: string;
  periodStart?: Date | string;
  periodEnd?: Date | string;
  mode?: FinanceAiMode;
};

export type FinanceAiGatewayResult = {
  answer: string;
  source: 'edge-function';
  mode?: FinanceAiMode;
  period?: {
    start: string;
    end: string;
    name: string;
  };
};

const toIso = (value: Date | string | undefined | null) => {
  if (!value) return undefined;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return undefined;

  return date.toISOString();
};

export const callFinanceAiGateway = async ({
  question,
  periodStart,
  periodEnd,
  mode = 'chat',
}: FinanceAiGatewayParams): Promise<FinanceAiGatewayResult> => {
  const cleanQuestion = question.trim();

  if (!cleanQuestion) {
    throw new Error('question is required');
  }

  const { data, error } = await supabase.functions.invoke('finance-ai', {
    body: {
      question: cleanQuestion,
      mode,
      periodStart: toIso(periodStart),
      periodEnd: toIso(periodEnd),
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.answer) {
    throw new Error('finance-ai returned empty answer');
  }

  return {
    answer: String(data.answer),
    source: 'edge-function',
    mode: data.mode,
    period: data.period,
  };
};

export const askFinanceAssistant = async (
  params: FinanceAiGatewayParams
): Promise<string> => {
  const result = await callFinanceAiGateway(params);
  return result.answer;
};

export const analyzeFinancePeriod = async ({
  question,
  periodStart,
  periodEnd,
}: {
  question: string;
  periodStart: Date | string;
  periodEnd: Date | string;
}) => {
  return askFinanceAssistant({
    question,
    periodStart,
    periodEnd,
    mode: 'analytics',
  });
};

export const buildFinanceReportWithAi = async ({
  question,
  periodStart,
  periodEnd,
}: {
  question: string;
  periodStart: Date | string;
  periodEnd: Date | string;
}) => {
  return askFinanceAssistant({
    question,
    periodStart,
    periodEnd,
    mode: 'report',
  });
};
