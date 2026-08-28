/*
  Étape 12 du cahier des charges de corrections CMGS — Maintenance et sauvegardes.

  La page Maintenance permettait déjà de créer une sauvegarde et de consulter
  la liste des sauvegardes existantes (migration 020). Il manquait : la
  restauration et la suppression d'une sauvegarde — les deux ajoutées ici,
  toutes deux protégées par une vérification de permission côté serveur et
  toutes deux journalisées.

  CHOIX DE CONCEPTION IMPORTANT SUR LA RESTAURATION, à porter à la connaissance
  de l'équipe CMGS : une sauvegarde couvre 9 tables (products, categories,
  suppliers, customers, orders, order_items, settings, roles, role_permissions).
  Restaurer une sauvegarde en écrasant purement et simplement les tables
  vivantes serait dangereux sur un système en production : entre le moment de
  la sauvegarde et celui de la restauration, de nouvelles commandes réelles
  arrivent, des paiements et livraisons s'y rattachent (par clé étrangère). Un
  remplacement complet de `orders`/`order_items` pourrait donc supprimer des
  commandes bien réelles passées après la sauvegarde, ou casser des paiements/
  livraisons qui les référencent encore.

  Restaurer est donc implémenté comme une FUSION NON DESTRUCTIVE : chaque ligne
  présente dans la sauvegarde est réinjectée ou remise à son état sauvegardé
  (par identifiant), mais AUCUNE ligne existante n'est supprimée. Cela permet
  de récupérer une donnée supprimée ou modifiée par erreur, sans risquer un
  écrasement massif de données récentes.

  Par prudence, la restauration se limite aux données de référence et de
  catalogue (produits, catégories, fournisseurs, clients, paramètres, rôles et
  permissions de rôles) — `orders` et `order_items` sont volontairement exclus
  de la restauration automatique, car leur cohérence avec les paiements et
  livraisons déjà enregistrés est trop sensible pour un remplacement générique.
  Une sauvegarde de sécurité est de plus créée automatiquement juste avant
  toute restauration, afin que la restauration elle-même reste réversible.
*/

create or replace function public.restore_backup(p_backup_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  target public.backups;
  restored text[] := '{}';
  skipped text[] := array['orders', 'order_items'];
begin
  if not (public.has_permission('settings.manage') or public.has_permission('maintenance.manage')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  select * into target from public.backups where id = p_backup_id;
  if not found then
    raise exception using errcode = '22023', message = 'Sauvegarde introuvable';
  end if;

  -- Filet de sécurité : la restauration elle-même doit rester réversible.
  perform public.create_backup_snapshot('Sauvegarde automatique avant restauration de "' || target.reason || '"');

  if target.snapshot ? 'roles' then
    insert into public.roles
    select * from jsonb_populate_recordset(null::public.roles, target.snapshot->'roles')
    on conflict (id) do update set code = excluded.code, name = excluded.name, description = excluded.description;
    restored := array_append(restored, 'roles');
  end if;

  if target.snapshot ? 'settings' then
    insert into public.settings
    select * from jsonb_populate_recordset(null::public.settings, target.snapshot->'settings')
    on conflict (key) do update set value = excluded.value, category = excluded.category,
      description = excluded.description, is_public = excluded.is_public, updated_at = now(), updated_by = auth.uid();
    restored := array_append(restored, 'settings');
  end if;

  if target.snapshot ? 'categories' then
    insert into public.categories
    select * from jsonb_populate_recordset(null::public.categories, target.snapshot->'categories')
    on conflict (id) do update set name = excluded.name, slug = excluded.slug, parent_id = excluded.parent_id;
    restored := array_append(restored, 'categories');
  end if;

  if target.snapshot ? 'suppliers' then
    insert into public.suppliers
    select * from jsonb_populate_recordset(null::public.suppliers, target.snapshot->'suppliers')
    on conflict (id) do update set code = excluded.code, name = excluded.name, business_name = excluded.business_name,
      phone = excluded.phone, zone = excluded.zone, contact_info = excluded.contact_info, status = excluded.status,
      quality_rating = excluded.quality_rating, deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by;
    restored := array_append(restored, 'suppliers');
  end if;

  if target.snapshot ? 'customers' then
    insert into public.customers
    select * from jsonb_populate_recordset(null::public.customers, target.snapshot->'customers')
    on conflict (id) do update set name = excluded.name, phone = excluded.phone, neighborhood = excluded.neighborhood,
      address = excluded.address, channel = excluded.channel, status = excluded.status,
      last_interaction = excluded.last_interaction, user_id = excluded.user_id,
      deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by;
    restored := array_append(restored, 'customers');
  end if;

  if target.snapshot ? 'products' then
    insert into public.products
    select * from jsonb_populate_recordset(null::public.products, target.snapshot->'products')
    on conflict (id) do update set code = excluded.code, name = excluded.name, description = excluded.description,
      category_id = excluded.category_id, supplier_id = excluded.supplier_id, supplier_price = excluded.supplier_price,
      sale_price = excluded.sale_price, stock_declared = excluded.stock_declared, stock_verified = excluded.stock_verified,
      stock_last_checked = excluded.stock_last_checked, image_url = excluded.image_url, status = excluded.status,
      updated_at = now(), brand = excluded.brand, low_stock_threshold = coalesce(excluded.low_stock_threshold, 5),
      initial_supplier_price = coalesce(excluded.initial_supplier_price, 0), purchase_price = coalesce(excluded.purchase_price, 0);
    restored := array_append(restored, 'products');
  end if;

  if target.snapshot ? 'role_permissions' then
    insert into public.role_permissions
    select * from jsonb_populate_recordset(null::public.role_permissions, target.snapshot->'role_permissions')
    on conflict (role_id, permission_code) do nothing;
    restored := array_append(restored, 'role_permissions');
  end if;

  perform public.log_audit_event('BACKUP_RESTORED', 'backup', target.id,
    'Sauvegarde "' || target.reason || '" restaurée (fusion, sans suppression) — tables : ' || array_to_string(restored, ', '),
    null, jsonb_build_object('restored', restored, 'skipped', skipped));

  return jsonb_build_object('restored', restored, 'skipped', skipped);
end;
$$;
revoke all on function public.restore_backup(uuid) from public;
grant execute on function public.restore_backup(uuid) to authenticated;

create or replace function public.delete_backup(p_backup_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target public.backups;
begin
  if not (public.has_permission('settings.manage') or public.has_permission('maintenance.manage')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  select * into target from public.backups where id = p_backup_id;
  if not found then
    raise exception using errcode = '22023', message = 'Sauvegarde introuvable';
  end if;

  delete from public.backups where id = p_backup_id;

  perform public.log_audit_event('BACKUP_DELETED', 'backup', p_backup_id,
    'Sauvegarde supprimée : ' || target.reason, jsonb_build_object('reason', target.reason, 'created_at', target.created_at), null);
end;
$$;
revoke all on function public.delete_backup(uuid) from public;
grant execute on function public.delete_backup(uuid) to authenticated;
