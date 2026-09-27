/*
  Étape 40 du prompt d'amélioration — Carrousel principal (hero) de la
  boutique (§9). Jusqu'ici entièrement statique et codé en dur dans
  StoreFront.tsx ("Hero avec effet de particules") : aucune table, aucune
  gestion possible depuis le dashboard.

  Structure volontairement simple, comme demandé ("ne pas créer un
  système disproportionné si une structure simple suffit") : une seule
  table plate, pas de système de planification complexe.

  Gestion réservée à settings.manage — un carrousel de mise en avant est
  une configuration du site, pas une donnée commerciale (produit, client,
  commande) qui justifierait une permission dédiée comme le reste du
  catalogue de permissions.

  Lecture publique directe (pas de RPC) : aucune donnée sensible ici
  (juste une image, un titre, un texte, un lien) contrairement au stock —
  la boutique doit pouvoir lire les slides actifs sans être authentifiée.
*/

create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text not null,
  description text,
  button_text text,
  button_link text,
  position integer not null default 0,
  duration_seconds integer not null default 6 check (duration_seconds between 2 and 30),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hero_slides_position_idx on public.hero_slides(position);
alter table public.hero_slides enable row level security;

create policy "hero_slides_public_read" on public.hero_slides for select to anon, authenticated
  using (is_active);

create policy "hero_slides_manage_authorized" on public.hero_slides for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

-- Le staff (settings.manage) doit aussi voir les slides désactivés pour pouvoir les
-- réactiver — la policy publique ci-dessus ne couvre que is_active = true.
create policy "hero_slides_staff_read_all" on public.hero_slides for select to authenticated
  using (public.has_permission('settings.manage'));

drop trigger if exists trg_hero_slides_updated_at on public.hero_slides;
create trigger trg_hero_slides_updated_at before update on public.hero_slides
  for each row execute function public.set_updated_at();
