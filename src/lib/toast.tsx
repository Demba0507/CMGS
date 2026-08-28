import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

/**
 * Système de notification unique pour toute la partie Dashboard (§9 du cahier
 * des charges) : une seule façon d'informer l'utilisateur qu'une opération a
 * réussi ou échoué, plutôt que des `alert()` ou des messages différents par
 * page. S'affiche brièvement puis disparaît automatiquement, et reste
 * consultable/fermable manuellement pendant ce délai.
 */
interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const success = useCallback((message: string) => push('success', message), [push]);
  const error = useCallback((message: string) => push('error', message), [push]);

  return (
    <ToastContext.Provider value={{ success, error }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-2.5 p-3.5 rounded-xl shadow-lg animate-slide-up border ${t.kind === 'success' ? 'bg-white border-green-200' : 'bg-white border-red-200'}`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <p className="text-sm text-sand-800 flex-1 min-w-0">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-sand-400 hover:text-sand-600 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé à l'intérieur de <ToastProvider>.");
  return ctx;
}
