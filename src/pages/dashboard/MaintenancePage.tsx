import { useState, useEffect, useCallback } from 'react';
import { Wrench, Archive, AlertCircle, ShieldCheck, RotateCcw, Trash2, Download } from 'lucide-react';
import { getAllSettings, updateSetting, type SettingRow } from '@/lib/settings';
import { createBackupSnapshot, listBackups, restoreBackup, deleteBackup, getBackupSnapshot } from '@/lib/maintenance';
import { useToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { usePermissions } from '@/lib/permissions';
import type { Backup } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import ExportButtons from '@/components/ExportButtons';
import type { ExportColumn } from '@/lib/export';

const backupExportColumns: ExportColumn<Backup>[] = [
  { label: 'Motif', value: (b) => b.reason },
  { label: 'Tables incluses', value: (b) => b.tables_included.join(', ') },
  { label: 'Lignes totales', value: (b) => Object.values(b.row_counts).reduce((a, c) => a + c, 0) },
  { label: 'Créée le', value: (b) => formatDateTime(b.created_at) },
];

export default function MaintenancePage() {
  const toast = useToast();
  const { confirmAction } = useConfirm();
  const { has } = usePermissions();
  const canManage = has('settings.manage') || has('maintenance.manage') || has('accounting.manage');
  const [maintenanceRow, setMaintenanceRow] = useState<SettingRow | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [settings, backupList] = await Promise.all([getAllSettings(), listBackups()]);
      setMaintenanceRow(settings.find((s) => s.key === 'system.maintenance_mode') ?? null);
      setBackups(backupList);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleMaintenance = async () => {
    if (!maintenanceRow) return;
    setActionError(null);
    try {
      const updated = await updateSetting('system.maintenance_mode', !maintenanceRow.value);
      setMaintenanceRow(updated);
      toast.success(updated.value ? 'Mode maintenance activé.' : 'Mode maintenance désactivé.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action impossible.';
      setActionError(message);
      toast.error(message);
    }
  };

  const createBackup = () => {
    confirmAction({
      title: 'Créer une sauvegarde',
      message: 'Une sauvegarde complète des données sera créée immédiatement.',
      confirmLabel: 'Créer la sauvegarde',
      successMessage: 'Sauvegarde créée avec succès.',
      input: { label: 'Motif de la sauvegarde', placeholder: 'ex : avant clôture mensuelle', required: true },
      onConfirm: async (reason) => {
        await createBackupSnapshot(reason ?? '');
        await load();
      },
    });
  };

  const handleRestore = (backup: Backup) => {
    confirmAction({
      title: 'Restaurer cette sauvegarde ?',
      message: `« ${backup.reason} » (${formatDateTime(backup.created_at)}) sera fusionnée dans les données actuelles : les fiches produits, catégories, fournisseurs, clients et paramètres seront remises à leur état sauvegardé. Rien ne sera supprimé, et les commandes ne sont pas concernées. Une sauvegarde de sécurité sera créée automatiquement avant de continuer.`,
      confirmLabel: 'Restaurer',
      successMessage: 'Sauvegarde restaurée avec succès.',
      onConfirm: async () => {
        await restoreBackup(backup.id);
        await load();
      },
    });
  };

  const handleDelete = (backup: Backup) => {
    confirmAction({
      title: 'Supprimer cette sauvegarde ?',
      message: `« ${backup.reason} » (${formatDateTime(backup.created_at)}) sera définitivement supprimée. Cette action est irréversible.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Sauvegarde supprimée.',
      onConfirm: async () => {
        await deleteBackup(backup.id);
        await load();
      },
    });
  };

  const handleDownload = async (backup: Backup) => {
    try {
      const snapshot = await getBackupSnapshot(backup.id);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sauvegarde-cmgs-${backup.created_at.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Téléchargement impossible.');
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

  const isMaintenanceOn = maintenanceRow?.value === true;

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div>
        <h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">Maintenance</h2>
        <p className="text-sm text-sand-500 dark:text-sand-400">Opérations sensibles — à manier avec précaution</p>
      </div>

      {actionError && <div className="card p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{actionError}</div>}

      <div className="card p-5">
        <h3 className="font-semibold text-sand-900 dark:text-sand-100 mb-3 flex items-center gap-2"><Wrench className="w-5 h-5 text-ocre-600" /> Mode maintenance</h3>
        <p className="text-sm text-sand-500 dark:text-sand-400 mb-4">Quand activé, le site client affiche une page d'attente. Le dashboard et l'espace livreur restent accessibles.</p>
        <label className="flex items-center gap-3 p-3 rounded-lg border border-sand-200 dark:border-sand-600 cursor-pointer">
          <input type="checkbox" checked={isMaintenanceOn} disabled={!canManage} onChange={() => void toggleMaintenance()} className="accent-ocre-600" />
          <span className="text-sm font-medium text-sand-900 dark:text-sand-100">{isMaintenanceOn ? 'Site en maintenance' : 'Site accessible normalement'}</span>
        </label>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-sand-900 dark:text-sand-100 flex items-center gap-2"><Archive className="w-5 h-5 text-ocre-600" /> Sauvegardes manuelles</h3>
          <div className="flex items-center gap-2">
            <ExportButtons filename="sauvegardes-ratelafrica" title="Historique des sauvegardes RATELAFRICA" columns={backupExportColumns} rows={backups} />
            <button onClick={() => void createBackup()} disabled={!canManage} className="btn-primary text-sm">Créer une sauvegarde</button>
          </div>
        </div>
        <p className="text-sm text-sand-500 dark:text-sand-400 mb-4 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-green-600" /> Une sauvegarde de moins d'1h est exigée avant toute clôture de période comptable ou suppression de conversation.</p>
        {backups.length === 0 ? (
          <p className="text-sm text-sand-400 dark:text-sand-500 text-center py-4">Aucune sauvegarde pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div key={b.id} className="p-3 rounded-lg bg-sand-50 dark:bg-sand-900/50 border border-sand-200/60 dark:border-sand-700">
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <span className="text-sm font-medium text-sand-900 dark:text-sand-100">{b.reason}</span>
                  <span className="text-xs text-sand-400 dark:text-sand-500">{formatDateTime(b.created_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-sand-500 dark:text-sand-400">{b.tables_included.length} tables — {Object.values(b.row_counts).reduce((a, c) => a + c, 0)} lignes au total</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => void handleDownload(b)} className="w-7 h-7 rounded-lg hover:bg-sand-200 flex items-center justify-center text-sand-500 dark:text-sand-400" title="Télécharger (JSON)"><Download className="w-3.5 h-3.5" /></button>
                    {canManage && <button onClick={() => handleRestore(b)} className="w-7 h-7 rounded-lg hover:bg-indigo-100 flex items-center justify-center text-indigo-600" title="Restaurer"><RotateCcw className="w-3.5 h-3.5" /></button>}
                    {canManage && <button onClick={() => handleDelete(b)} className="w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center text-red-500 dark:text-red-400" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
