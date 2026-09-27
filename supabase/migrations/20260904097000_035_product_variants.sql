/*
  Étape 15 du prompt d'amélioration — Modèle de données pour les variantes
  produit (couleur/taille), §10.

  Décisions de conception :
  - Une variante n'a PAS de prix propre. Le prix reste uniquement sur
    products.sale_price. C'est la garantie la plus robuste contre "des prix
    différents entre variantes d'un même produit" (§10, règle explicite) :
    en ne donnant simplement aucune colonne prix aux variantes, l'erreur
    devient structurellement impossible plutôt que juste validée après
    coup. Ça couvre déjà par construction l'étape 16 du plan.
  - color / size sont tous deux nullable : un produit peut n'avoir que des
    couleurs, que des tailles, les deux, ou aucune variante du tout (dans
    ce dernier cas products.stock continue de faire foi comme avant —
    rien ne casse pour les produits déjà existants, sans variantes).
  - Stock et image sont propres à chaque variante (§10 : "chaque variante
    peut avoir son stock, son image"), jamais partagés.
  - Pas de nouvelle permission : gérer des variantes fait partie de la
    gestion du produit lui-même (products.edit), comme le formulaire
    produit principal.
  - Lecture publique (boutique) : jamais un accès direct à la table, qui
    exposerait le stock exact (§11). Une RPC dédiée (get_public_variants)
    suit exactement le même principe que get_public_products : elle ne
    renvoie qu'une disponibilité (in_stock) et une quantité plafonnée
    (max_orderable), jamais le nombre réel.
*/

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  color text,
  size text,
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_has_attribute check (color is not null or size is not null),
  unique (product_id, color, size)
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);
alter table public.product_variants enable row level security;

create policy "product_variants_select_authorized" on public.product_variants for select to authenticated
  using (public.has_permission('products.view'));
create policy "product_variants_manage_authorized" on public.product_variants for all to authenticated
  using (public.has_permission('products.edit')) with check (public.has_permission('products.edit'));

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_product_variants_updated_at on public.product_variants;
create trigger trg_product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Projection publique sûre : jamais le stock exact, même logique que get_public_products.
create or replace function public.get_public_variants(p_product_id uuid)
returns table (id uuid, color text, size text, image_url text, in_stock boolean, max_orderable integer)
language sql stable security definer set search_path = public as $$
  select v.id, v.color, v.size, v.image_url, (v.stock > 0) as in_stock, least(v.stock, 10) as max_orderable
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.product_id = p_product_id and p.status = 'ACTIVE'
  order by v.color, v.size;
$$;
grant execute on function public.get_public_variants(uuid) to anon, authenticated;
