import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Les permissions réelles sont toujours vérifiées côté serveur (RLS + RPC).
 * Ce contexte ne sert qu'à adapter l'interface (afficher/masquer des actions) :
 * un masquage frontend n'est jamais considéré comme une protection à lui seul (§17).
 */
interface PermissionsContextValue {
  permissions: Set<string>;
  loading: boolean;
  has: (code: string) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_permissions');
    setPermissions(new Set(error ? [] : ((data as string[] | null) ?? [])));
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const has = useCallback((code: string) => permissions.has(code), [permissions]);

  return (
    <PermissionsContext.Provider value={{ permissions, loading, has, refresh }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions doit être utilisé à l'intérieur de <PermissionsProvider>.");
  return ctx;
}
