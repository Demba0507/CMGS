import { Trash2 } from 'lucide-react';

/**
 * Barre d'actions affichée au-dessus d'une liste en mode "Corbeille" (§ demande
 * de Demba : sélection multiple + bouton pour vider la corbeille, sans aucune
 * friction — pas de mot de passe, pas de condition de sauvegarde récente).
 */
export default function TrashActionsBar({
  count, selectedCount, allSelected, onToggleAll, onDeleteSelected, onEmptyTrash, busy,
}: {
  count: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onDeleteSelected: () => void;
  onEmptyTrash: () => void;
  busy?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <label className="flex items-center gap-2 text-sm text-sand-700 dark:text-sand-300 cursor-pointer select-none">
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="rounded" />
        {selectedCount > 0 ? `${selectedCount} sélectionné${selectedCount > 1 ? 's' : ''}` : `Tout sélectionner (${count})`}
      </label>
      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <button
            onClick={onDeleteSelected}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Supprimer la sélection ({selectedCount})
          </button>
        )}
        <button
          onClick={onEmptyTrash}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" /> Vider la corbeille
        </button>
      </div>
    </div>
  );
}
