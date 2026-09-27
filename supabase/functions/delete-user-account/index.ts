// Supabase Edge Function — suppression réelle d'un compte Supabase Auth.
//
// Contexte (§33/§41/§42 du cahier des charges) : la clé service_role, seule
// habilitée à appeler auth.admin.deleteUser(), ne doit jamais être exposée
// au frontend. Cette fonction est donc le SEUL endroit du projet où cette
// clé est utilisée pour cette opération.
//
// Sécurité en deux temps :
//   1) Le token JWT de l'appelant (Authorization: Bearer ...) est vérifié
//      avec un client anon-key classique, puis sa permission est vérifiée
//      via la RPC has_permission() existante — exactement la même règle
//      que partout ailleurs dans l'app (RLS/RPC, jamais un simple masquage
//      frontend). Si la permission manque, la fonction refuse avant même
//      de toucher au client service-role.
//   2) Seulement après validation, un second client (service-role,
//      utilisé uniquement en mémoire côté serveur) exécute la suppression.
//
// Ordre de suppression — CORRIGÉ (§15 du prompt de correction complète) :
// l'ancienne version supprimait d'abord la ligne `profiles`, puis le compte
// Auth dans un second appel réseau séparé. Si ce second appel échouait, le
// profil était déjà perdu mais le compte Auth restait actif : un utilisateur
// orphelin, capable de se reconnecter sans aucun profil ni permission.
//
// La contrainte profiles.id -> auth.users(id) est désormais ON DELETE CASCADE
// (migration 052_safe_user_deletion.sql) : on supprime maintenant directement
// le compte Auth, et PostgreSQL supprime la ligne `profiles` automatiquement
// et atomiquement dans la même opération sous-jacente. Impossible d'obtenir
// l'un sans l'autre — soit les deux disparaissent ensemble, soit aucun des
// deux n'est touché si l'appel échoue. Aucune table de commandes/clients ne
// référence `profiles` : cette suppression n'affecte jamais l'historique
// commercial (déjà protégé séparément par customers/drivers + leur propre
// corbeille).
//
// Garde-fous : un administrateur ne peut pas se supprimer lui-même depuis
// cette action, et le dernier compte ADMIN restant ne peut pas être
// supprimé (éviter un verrouillage total du système).

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Authentification requise.' }, 401);
  }

  let targetUserId: string;
  try {
    const body = await req.json();
    targetUserId = String(body.user_id ?? '');
    if (!targetUserId) throw new Error('missing user_id');
  } catch {
    return json({ error: 'Requête invalide : user_id manquant.' }, 400);
  }

  // Étape 1 — vérification de permission avec les droits RÉELS de l'appelant
  // (client anon-key + son propre token, donc soumis aux mêmes RLS que le reste de l'app).
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: caller, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller?.user) {
    return json({ error: 'Session invalide.' }, 401);
  }

  if (caller.user.id === targetUserId) {
    return json({ error: 'Vous ne pouvez pas supprimer votre propre compte depuis cette action.' }, 400);
  }

  const { data: allowed, error: permError } = await callerClient.rpc('has_permission', { required_permission: 'employees.delete' });
  if (permError || !allowed) {
    return json({ error: 'Permission refusée : vous ne pouvez pas supprimer de compte utilisateur.' }, 403);
  }

  // Étape 2 — opérations privilégiées, uniquement après validation de la permission.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: targetProfile, error: profileFetchError } = await adminClient
    .from('profiles')
    .select('id, email, full_name, account_type')
    .eq('id', targetUserId)
    .maybeSingle();

  if (profileFetchError || !targetProfile) {
    return json({ error: 'Compte introuvable.' }, 404);
  }

  if (targetProfile.account_type === 'ADMIN') {
    const { count } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('account_type', 'ADMIN')
      .eq('is_active', true);
    if ((count ?? 0) <= 1) {
      return json({ error: 'Impossible de supprimer le dernier compte administrateur.' }, 400);
    }
  }

  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(targetUserId);
  if (deleteAuthError) {
    return json({ error: 'Impossible de supprimer le compte de connexion.' }, 500);
  }
  // La ligne `profiles` disparaît automatiquement ici (ON DELETE CASCADE) —
  // plus d'appel séparé, donc plus aucun risque d'état intermédiaire orphelin.

  // Journalisé via le client de l'appelant (pas le client service-role, qui n'a pas
  // de session) pour que auth.uid() dans log_audit_event pointe vers le bon acteur.
  await callerClient.rpc('log_audit_event', {
    p_event_type: 'USER_ACCOUNT_DELETED',
    p_entity_type: 'profile',
    p_entity_id: targetUserId,
    p_description: `Compte supprimé définitivement : ${targetProfile.email}`,
    p_old_value: targetProfile,
    p_new_value: null,
  });

  return json({ success: true });
});
