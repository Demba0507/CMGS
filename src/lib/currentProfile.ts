import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface CurrentProfile {
  fullName: string | null;
  email: string | null;
}

/** Profil de l'utilisateur connecté, pour l'affichage (initiales, nom) — pas pour les décisions de sécurité. */
export function useCurrentProfile(): CurrentProfile {
  const [profile, setProfile] = useState<CurrentProfile>({ fullName: null, email: null });

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || !active) return;
      const { data: row } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle();
      if (active) setProfile({ fullName: row?.full_name ?? null, email: row?.email ?? user.email ?? null });
    })();
    return () => { active = false; };
  }, []);

  return profile;
}
