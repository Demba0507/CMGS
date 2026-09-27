import { useState, useEffect, useCallback } from 'react';
import { Store, Truck, CreditCard, Bot, Users, Lock, AlertCircle } from 'lucide-react';
import { getAllSettings, updateSetting, type SettingRow } from '@/lib/settings';
import { useToast } from '@/lib/toast';

/** Regroupe la liste plate des paramètres par catégorie pour l'affichage. */
function groupByCategory(rows: SettingRow[]): Record<string, SettingRow[]> {
  return rows.reduce<Record<string, SettingRow[]>>((acc, row) => {
    (acc[row.category] ??= []).push(row);
    return acc;
  }, {});
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Store }> = {
  commerce: { label: 'Commerce', icon: Store },
  payments: { label: 'Paiements', icon: CreditCard },
  chatbot: { label: 'Chatbot IA', icon: Bot },
  customers: { label: 'Clients', icon: Users },
  service_client: { label: 'Service client', icon: Truck },
};

export default function SettingsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await getAllSettings());
    } catch {
      setLoadError("Impossible de charger les paramètres — vous n'avez pas l'autorisation nécessaire pour cette section.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (key: string, value: unknown) => {
    setSavingKey(key);
    setSaveError(null);
    try {
      const updated = await updateSetting(key, value);
      setRows((prev) => prev.map((r) => (r.key === key ? updated : r)));
      setSavedKey(key);
      setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mise à jour impossible.';
      setSaveError(message);
      toast.error(message);
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (loadError) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="card p-5 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
        </div>
      </div>
    );
  }

  const grouped = groupByCategory(rows);
  const categoryOrder = ['commerce', 'payments', 'chatbot', 'customers', 'service_client'];

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div>
        <h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">Paramètres</h2>
        <p className="text-sm text-sand-500 dark:text-sand-400">Configuration de la plateforme — chaque modification est journalisée.</p>
      </div>

      {saveError && <div className="card p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{saveError}</div>}

      {categoryOrder.filter((c) => grouped[c]?.length).map((category) => {
        const meta = CATEGORY_META[category] ?? { label: category, icon: Store };
        const Icon = meta.icon;
        return (
          <div key={category} className="card p-5">
            <h3 className="font-semibold text-sand-900 dark:text-sand-100 mb-4 flex items-center gap-2"><Icon className="w-5 h-5 text-ocre-600" /> {meta.label}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {grouped[category].map((row) => (
                <SettingField
                  key={row.key}
                  row={row}
                  saving={savingKey === row.key}
                  saved={savedKey === row.key}
                  onSave={(value) => save(row.key, value)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettingField({ row, saving, saved, onSave }: { row: SettingRow; saving: boolean; saved: boolean; onSave: (value: unknown) => void }) {
  const isAutoOrangeMoney = row.key === 'payments.orange_money_auto_enabled';

  if (isAutoOrangeMoney) {
    return (
      <label className="flex items-center gap-3 p-3 rounded-lg border border-sand-200 dark:border-sand-700 opacity-70 cursor-not-allowed">
        <input type="checkbox" checked={false} disabled className="accent-ocre-600" />
        <Lock className="w-4 h-4 text-sand-400 dark:text-sand-500 shrink-0" />
        <div>
          <div className="text-sm font-medium text-sand-900 dark:text-sand-100">Orange Money (automatique)</div>
          <div className="text-xs text-sand-500 dark:text-sand-400">Indisponible tant que l'API réelle n'est pas intégrée — ne peut pas être activé depuis cette page.</div>
        </div>
      </label>
    );
  }

  if (typeof row.value === 'boolean') {
    return (
      <label className="flex items-center gap-3 p-3 rounded-lg border border-sand-200 dark:border-sand-700">
        <input
          type="checkbox"
          checked={row.value}
          disabled={saving}
          onChange={(e) => onSave(e.target.checked)}
          className="accent-ocre-600"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-sand-900 dark:text-sand-100">{row.description ?? row.key}</div>
        </div>
        {saved && <span className="text-xs text-green-600 shrink-0">Enregistré</span>}
      </label>
    );
  }

  if (typeof row.value === 'number') {
    return (
      <div>
        <label className="label">{row.description ?? row.key}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="input"
            defaultValue={row.value}
            disabled={saving}
            onBlur={(e) => {
              const next = parseInt(e.target.value, 10);
              if (!Number.isNaN(next) && next !== row.value) onSave(next);
            }}
          />
          {saved && <span className="text-xs text-green-600 shrink-0">Enregistré</span>}
        </div>
      </div>
    );
  }

  if (Array.isArray(row.value)) {
    return (
      <div>
        <label className="label">{row.description ?? row.key}</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="input"
            placeholder="Numéros séparés par une virgule, ex: +223 70 00 00 00, +223 76 00 00 00"
            defaultValue={(row.value as string[]).join(', ')}
            disabled={saving}
            onBlur={(e) => {
              const next = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
              onSave(next);
            }}
          />
          {saved && <span className="text-xs text-green-600 shrink-0">Enregistré</span>}
        </div>
      </div>
    );
  }

  if (typeof row.value === 'string') {
    return (
      <div>
        <label className="label">{row.description ?? row.key}</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="input"
            placeholder="Non configuré"
            defaultValue={row.value}
            disabled={saving}
            onBlur={(e) => {
              if (e.target.value !== row.value) onSave(e.target.value);
            }}
          />
          {saved && <span className="text-xs text-green-600 shrink-0">Enregistré</span>}
        </div>
      </div>
    );
  }

  return null;
}
