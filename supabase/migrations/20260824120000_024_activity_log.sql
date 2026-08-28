/*
  Étape 6 du cahier des charges de corrections CMGS — Journal des activités.

  Le système de journalisation (table event_logs + RPC log_audit_event) existait
  déjà et est utilisé de façon très large dans le code existant (employés,
  fournisseurs, livraisons, commandes multi-fournisseurs, réclamations,
  paramètres, sauvegardes, et les corbeilles ajoutées à l'étape 5). L'audit
  préalable (§17) a toutefois révélé deux lacunes concrètes :

  1) La policy RLS d'écriture sur event_logs exigeait la permission
     `audit.view` pour... écrire un log — un mélange entre "consulter le
     journal" et "pouvoir y ajouter une entrée" qui n'a pas de sens : la RPC
     log_audit_event() est SECURITY DEFINER et n'a jamais eu besoin de cette
     policy pour fonctionner (elle contourne RLS), mais un code appelant qui
     écrirait directement dans la table (ce qui arrivait dans OrdersPage,
     voir plus bas) échouait silencieusement pour la plupart des employés.
     Correction : on retire l'écriture directe de la table aux utilisateurs
     authentifiés, pour que log_audit_event() reste l'unique chemin d'écriture
     (cohérent avec §17 : pas de contrôle uniquement optionnel côté client).

  2) Le changement de statut d'une commande (OrdersPage.tsx) écrivait
     directement dans `event_logs` sans passer par log_audit_event(), donc
     sans l'identité de l'employé (`employee_id` restait vide). Corrigé côté
     frontend pour utiliser logAuditEvent(), qui capture auth.uid() côté
     serveur.

  3) L'écran Logs affichait l'action et la date, mais jamais l'auteur, alors
     que c'est explicitement demandé au §6. Lire `profiles` pour retrouver le
     nom de l'auteur exige la permission `employees.view`, différente de
     `audit.view` : quelqu'un avec accès au journal mais pas à la liste des
     employés ne verrait aucun nom. Nouvelle RPC `list_audit_logs()`,
     SECURITY DEFINER, qui joint l'auteur et n'exige que `audit.view`.

  Additive uniquement.
*/

-- ============ 1) ÉCRITURE : UNIQUEMENT VIA log_audit_event() ============
drop policy if exists "logs_insert_authorized" on public.event_logs;
revoke insert, update on public.event_logs from authenticated;
-- La suppression reste possible pour l'administrateur (purge de vieux logs), inchangé.

-- ============ 2) LECTURE ENRICHIE (avec l'auteur) ============
create or replace function public.list_audit_logs(p_limit integer default 200)
returns table (
  id uuid,
  event_type text,
  entity_type text,
  entity_id uuid,
  description text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_email text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_permission('audit.view') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  return query
  select
    l.id, l.event_type, l.entity_type, l.entity_id, l.description, l.old_value, l.new_value, l.created_at,
    p.id, p.full_name, p.email
  from public.event_logs l
  left join public.profiles p on p.id = l.employee_id
  order by l.created_at desc
  limit least(coalesce(p_limit, 200), 500);
end;
$$;
revoke all on function public.list_audit_logs(integer) from public;
grant execute on function public.list_audit_logs(integer) to authenticated;
