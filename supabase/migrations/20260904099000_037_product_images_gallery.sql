/*
  Étape 18 du prompt d'amélioration — Galerie multi-images par produit (§22).

  products.image_url reste la source de vérité pour "l'image affichée
  partout" (boutique, dashboard, panier...) — des dizaines d'endroits du
  code la lisent déjà directement. Plutôt que de réécrire tout ça, cette
  migration ajoute une table `product_images` (la galerie complète,
  réordonnable, avec association couleur optionnelle) et la synchronise
  automatiquement vers products.image_url quand l'image principale change
  — aucune régression sur l'existant, la nouveauté vient s'ajouter par
  dessus (§56 : réutiliser l'existant, ne pas réécrire ce qui marche).

  Utilise la permission products.images, présente dans le catalogue depuis
  le tout début (migration 002) mais jamais câblée à quoi que ce soit —
  exactement l'usage pour lequel elle a été prévue.

  Association couleur (§22 : "association d'une image à une couleur") :
  product_images.color est un simple texte libre, volontairement
  indépendant de product_variants.color (pas de FK) — une image de galerie
  peut illustrer une couleur avant même qu'une variante correspondante
  n'existe. La boutique (étape suivante d'utilisation, déjà câblée dans
  StoreFront via product_variants.image_url pour le changement immédiat
  au clic) peut aussi retomber sur une image de cette galerie filtrée par
  couleur si la variante elle-même n'a pas d'image propre.
*/

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  position integer not null default 0,
  is_primary boolean not null default false,
  color text,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images(product_id, position);
alter table public.product_images enable row level security;

create policy "product_images_select_authorized" on public.product_images for select to authenticated
  using (public.has_permission('products.view'));
create policy "product_images_manage_authorized" on public.product_images for all to authenticated
  using (public.has_permission('products.images') or public.has_permission('products.edit'))
  with check (public.has_permission('products.images') or public.has_permission('products.edit'));

-- Lecture publique (boutique) — pas de restriction de permission nécessaire,
-- une image n'expose aucune donnée commerciale sensible (contrairement au stock).
create policy "product_images_public_read" on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'ACTIVE'));

-- Une seule image principale par produit : en désigner une nouvelle
-- désélectionne automatiquement les autres et resynchronise
-- products.image_url — l'admin n'a jamais à gérer ça manuellement.
create or replace function public.sync_primary_product_image()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.is_primary then
    update public.product_images set is_primary = false where product_id = new.product_id and id <> new.id and is_primary;
    update public.products set image_url = new.image_url, updated_at = now() where id = new.product_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sync_primary_product_image on public.product_images;
create trigger trg_sync_primary_product_image after insert or update of is_primary, image_url on public.product_images
  for each row when (new.is_primary) execute function public.sync_primary_product_image();

-- Si l'image principale est supprimée, en désigner une autre automatiquement
-- (la plus ancienne restante) plutôt que de laisser products.image_url pointer
-- vers une image qui n'existe plus.
create or replace function public.reassign_primary_product_image()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  next_image public.product_images;
begin
  if old.is_primary then
    select * into next_image from public.product_images
    where product_id = old.product_id and id <> old.id
    order by position, created_at limit 1;
    if found then
      update public.product_images set is_primary = true where id = next_image.id;
      update public.products set image_url = next_image.image_url, updated_at = now() where id = old.product_id;
    else
      update public.products set image_url = null, updated_at = now() where id = old.product_id;
    end if;
  end if;
  return old;
end;
$$;
drop trigger if exists trg_reassign_primary_product_image on public.product_images;
create trigger trg_reassign_primary_product_image after delete on public.product_images
  for each row execute function public.reassign_primary_product_image();

-- Reprise des images déjà existantes dans products.image_url comme premières
-- entrées de la galerie (principales), pour ne perdre aucune image en place.
insert into public.product_images (product_id, image_url, position, is_primary)
select id, image_url, 0, true from public.products where image_url is not null and image_url <> ''
on conflict do nothing;
