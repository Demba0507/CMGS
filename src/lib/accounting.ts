import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { AccountingPeriod, PeriodFinancials } from '@/lib/types';

export async function listAccountingPeriods(): Promise<AccountingPeriod[]> {
  const { data, error } = await supabase.from('accounting_periods').select('*').order('started_at', { ascending: false });
  if (error) throw new Error('Impossible de charger les périodes comptables.');
  return (data as AccountingPeriod[]) ?? [];
}

export async function getPeriodFinancials(periodId?: string): Promise<PeriodFinancials | null> {
  const { data, error } = await supabase.rpc('get_period_financials', { p_period_id: periodId ?? null });
  if (error) throw new Error(friendlyError(error, 'Impossible de calculer le bilan.'));
  const rows = data as PeriodFinancials[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function closeAccountingPeriod(nextLabel?: string): Promise<AccountingPeriod> {
  const { data, error } = await supabase.rpc('close_accounting_period', { p_next_label: nextLabel ?? null });
  if (error) throw new Error(friendlyError(error, 'Impossible de clôturer la période.'));
  return data as AccountingPeriod;
}
