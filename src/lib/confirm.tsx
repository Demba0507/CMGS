import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useToast } from '@/lib/toast';

/**
 * Système de confirmation unique pour toute action sensible du Dashboard
 * (§4 du cahier des charges) : un seul composant réutilisable, plutôt que
 * des `window.confirm()` ou des variantes ad hoc par page.
 *
 * Le dialogue reste ouvert pendant `onConfirm` : les boutons sont désactivés
 * et affichent un état de chargement (protection anti double-clic, §8), et
 * une erreur éventuelle s'affiche dans le dialogue sans le fermer, pour que
 * l'utilisateur puisse réessayer ou annuler. Une fois l'action terminée avec
 * succès, une notification de confirmation s'affiche (§9).
 */
export interface ConfirmActionOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style rouge pour les actions destructrices (suppression, désactivation...). */
  danger?: boolean;
  /** Notification affichée après le succès de l'action (§9). */
  successMessage?: string;
  /**
   * Remplace les prompt() natifs du navigateur (§29) pour les actions qui ont
   * besoin d'une information textuelle en plus de la confirmation (motif
   * d'annulation, libellé de période, note de résolution...). Quand présent,
   * un champ est affiché dans le dialogue et sa valeur est passée à onConfirm.
   */
  input?: { label: string; placeholder?: string; required?: boolean; defaultValue?: string; multiline?: boolean };
  onConfirm: (inputValue?: string) => Promise<void> | void;
}

interface ConfirmContextValue {
  confirmAction: (options: ConfirmActionOptions) => void;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [pending, setPending] = useState<ConfirmActionOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const confirmAction = useCallback((options: ConfirmActionOptions) => {
    setPending(options);
    setError(null);
    setBusy(false);
    setInputValue(options.input?.defaultValue ?? '');
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setPending(null);
    setError(null);
  }, [busy]);

  const handleConfirm = useCallback(async () => {
    if (!pending || busy) return;
    if (pending.input?.required && !inputValue.trim()) {
      setError('Ce champ est obligatoire.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pending.onConfirm(pending.input ? inputValue.trim() : undefined);
      toast.success(pending.successMessage ?? 'Action effectuée avec succès.');
      setPending(null);
      setBusy(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue. Veuillez réessayer.';
      setError(message);
      toast.error(message);
      setBusy(false);
    }
  }, [pending, busy, toast, inputValue]);

  return (
    <ConfirmContext.Provider value={{ confirmAction }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={close}>
          <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 border-b border-sand-200 dark:border-sand-700">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${pending.danger ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-ocre-100 dark:bg-ocre-900/40 text-ocre-700 dark:text-ocre-400'}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold text-sand-900 dark:text-sand-50">{pending.title}</h2>
                  <p className="text-sm text-sand-600 dark:text-sand-300 mt-1">{pending.message}</p>
                </div>
              </div>
              <button onClick={close} disabled={busy} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center text-sand-400 disabled:opacity-40 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 pt-4 space-y-3">
              {pending.input && (
                <div>
                  <label className="block text-xs font-medium text-sand-600 dark:text-sand-300 mb-1.5">
                    {pending.input.label}{pending.input.required && ' *'}
                  </label>
                  {pending.input.multiline ? (
                    <textarea
                      autoFocus
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={pending.input.placeholder}
                      disabled={busy}
                      rows={3}
                      className="input resize-none"
                    />
                  ) : (
                    <input
                      autoFocus
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={pending.input.placeholder}
                      disabled={busy}
                      onKeyDown={(e) => e.key === 'Enter' && void handleConfirm()}
                      className="input"
                    />
                  )}
                </div>
              )}
              {error && <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-lg p-3">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={close}
                  disabled={busy}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-sand-300 dark:border-sand-600 bg-white dark:bg-sand-800 text-sand-700 dark:text-sand-200 text-sm font-medium hover:bg-sand-50 dark:hover:bg-sand-700 disabled:opacity-50"
                >
                  {pending.cancelLabel ?? 'Annuler'}
                </button>
                <button
                  onClick={() => void handleConfirm()}
                  disabled={busy}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2 ${pending.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-ocre-600 hover:bg-ocre-700'}`}
                >
                  {busy && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {busy ? 'Veuillez patienter…' : (pending.confirmLabel ?? 'Confirmer')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm doit être utilisé à l'intérieur de <ConfirmProvider>.");
  return ctx;
}
