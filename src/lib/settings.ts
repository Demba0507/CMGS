import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';

/** Sous-ensemble sûr des paramètres, lisible sans authentification (jamais orange_money_auto_enabled). */
export interface PublicSettings {
  'commerce.delivery_fee_default': number;
  'payments.cash_on_delivery_enabled': boolean;
  'payments.orange_money_manual_enabled': boolean;
  'payments.orange_money_merchant_number': string;
  'chatbot.enabled': boolean;
  'customers.account_required': boolean;
  'service_client.phone_numbers': string[];
  'system.maintenance_mode': boolean;
}

export interface SettingRow {
  key: string;
  value: unknown;
  category: string;
  description: string | null;
  is_public: boolean;
  updated_at: string;
  updated_by: string | null;
}

const PUBLIC_SETTINGS_DEFAULTS: PublicSettings = {
  'commerce.delivery_fee_default': 1000,
  'payments.cash_on_delivery_enabled': true,
  'payments.orange_money_manual_enabled': true,
  'payments.orange_money_merchant_number': '',
  'chatbot.enabled': true,
  'customers.account_required': false,
  'service_client.phone_numbers': [],
  'system.maintenance_mode': false,
};

/** Lecture publique (site, chatbot). Ne lève jamais d'erreur : retombe sur des valeurs par défaut sûres. */
export async function getPublicSettings(): Promise<PublicSettings> {
  const { data, error } = await supabase.rpc('get_public_settings');
  if (error || !data) return PUBLIC_SETTINGS_DEFAULTS;
  return { ...PUBLIC_SETTINGS_DEFAULTS, ...(data as Partial<PublicSettings>) };
}

/** Lecture complète (dashboard admin). Nécessite la permission settings.manage côté RLS. */
export async function getAllSettings(): Promise<SettingRow[]> {
  const { data, error } = await supabase.from('settings').select('*').order('category').order('key');
  if (error) throw new Error('Impossible de charger les paramètres.');
  return (data as SettingRow[]) ?? [];
}

/** Écriture admin d'un paramètre. Passe par la RPC sécurisée (validation + journalisation côté serveur). */
export async function updateSetting(key: string, value: unknown): Promise<SettingRow> {
  const { data, error } = await supabase.rpc('update_setting', { p_key: key, p_value: value });
  if (error) throw new Error(friendlyError(error, 'Impossible de mettre à jour ce paramètre.'));
  return data as SettingRow;
}
