/*
  Correction complète CMGS — Étape 9 (§26 du prompt maître) : audit complet du
  système de sauvegarde.

  PROBLÈME CONSTATÉ : create_backup_snapshot() ne capturait que 9 tables
  (products, categories, suppliers, customers, orders, order_items, settings,
  roles, role_permissions). Toutes les autres données opérationnelles listées
  explicitement par le prompt maître en étaient absentes : paiements,
  livraisons, retours, réclamations, conversations/messages, notifications,
  livreurs, variantes, images produits, logs, et plus.

  CORRECTION — BACKUP : create_backup_snapshot() capture désormais 33 tables
  au lieu de 9, couvrant l'intégralité des données opérationnelles listées par
  le prompt maître, plus les tables de support directement liées (ex :
  delivery_failures/delivery_proofs avec deliveries, complaint_messages avec
  complaints).

  DEUX TABLES DÉLIBÉRÉMENT EXCLUES DE LA SAUVEGARDE (documenté, §26 le
  demande explicitement en cas d'exclusion) :
  - "backups" elle-même : sauvegarder la table des sauvegardes dans une
    sauvegarde n'a pas de sens (récursif) et ferait grossir chaque snapshot
    de tout l'historique des précédents.
  - "permissions" : catalogue statique des codes de permission définis par les
    migrations elles-mêmes (schéma, pas donnée utilisateur) — son contenu ne
    change jamais en dehors d'une migration, donc il n'y a rien à perdre qui
    ne soit pas déjà dans le code source du projet.
  ("supplier_stock_reports", l'ancienne table du modèle de stock déclaré/
  vérifié, a été supprimée par la migration 033 — elle n'existe plus et ne
  peut donc plus être sauvegardée ; c'est le comportement attendu.)

  CORRECTION — RESTAURATION : restore_backup() n'est volontairement PAS
  étendue aux 24 tables nouvellement sauvegardées. Elle reste scopée aux 7
  tables déjà gérées (catalogue et paramètres, jamais de données
  transactionnelles vivantes — décision déjà expliquée à Demba lors d'une
  session précédente pour orders/order_items). Les tables nouvellement
  sauvegardées sont soit transactionnelles et liées à des commandes ou
  conversations en cours (payments, deliveries, returns, complaints,
  conversations, messages, notifications, order_supplier_groups) — les
  restaurer risquerait exactement la même corruption de données vivantes que
  pour orders/order_items — soit des journaux d'audit qui ne doivent par
  nature jamais être réécrits (event_logs, stock_movements, accounting_periods).
  Une extension prudente de la restauration au sous-ensemble réellement sûr
  (product_variants, product_images, product_suppliers, drivers, hero_slides,
  user_permission_overrides — données de catalogue/configuration, pas
  transactionnelles) est documentée comme suite possible plutôt que
  précipitée : ces backups sont désormais disponibles pour une restauration
  manuelle via le JSON téléchargeable en attendant.
*/

create or replace function public.create_backup_snapshot(p_reason text)
returns public.backups
language plpgsql security definer set search_path = public
as $$
declare
  created public.backups;
  snapshot_data jsonb;
  counts jsonb;
  included_tables text[] := array[
    'products','categories','suppliers','customers','orders','order_items','settings','roles','role_permissions',
    'payments','deliveries','delivery_failures','delivery_proofs','returns','complaints','complaint_messages',
    'conversations','messages','notifications','customer_notifications','drivers','product_variants',
    'product_images','product_suppliers','event_logs','stock_movements','user_permission_overrides',
    'hero_slides','accounting_periods','order_supplier_groups','employee_invitations','profiles','user_roles'
  ];
begin
  if not (public.has_permission('settings.manage') or public.has_permission('accounting.manage') or public.has_permission('maintenance.manage')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Le motif de la sauvegarde est obligatoire';
  end if;

  select jsonb_build_object(
    'products', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.products t),
    'categories', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.categories t),
    'suppliers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.suppliers t),
    'customers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customers t),
    'orders', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.orders t),
    'order_items', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.order_items t),
    'settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.settings t),
    'roles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.roles t),
    'role_permissions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.role_permissions t),
    'payments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.payments t),
    'deliveries', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.deliveries t),
    'delivery_failures', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.delivery_failures t),
    'delivery_proofs', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.delivery_proofs t),
    'returns', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.returns t),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.complaints t),
    'complaint_messages', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.complaint_messages t),
    'conversations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.conversations t),
    'messages', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.messages t),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.notifications t),
    'customer_notifications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customer_notifications t),
    'drivers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.drivers t),
    'product_variants', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.product_variants t),
    'product_images', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.product_images t),
    'product_suppliers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.product_suppliers t),
    'event_logs', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.event_logs t),
    'stock_movements', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.stock_movements t),
    'user_permission_overrides', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.user_permission_overrides t),
    'hero_slides', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.hero_slides t),
    'accounting_periods', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.accounting_periods t),
    'order_supplier_groups', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.order_supplier_groups t),
    'employee_invitations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.employee_invitations t),
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.profiles t),
    'user_roles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.user_roles t)
  ) into snapshot_data;

  select jsonb_object_agg(key, jsonb_array_length(value)) into counts from jsonb_each(snapshot_data);

  insert into public.backups (reason, tables_included, row_counts, snapshot, created_by)
  values (trim(p_reason), included_tables, counts, snapshot_data, auth.uid())
  returning * into created;

  perform public.log_audit_event('BACKUP_CREATED', 'backup', created.id, 'Sauvegarde manuelle : ' || trim(p_reason), null, counts);

  return created;
end;
$$;
