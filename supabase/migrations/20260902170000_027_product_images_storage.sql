-- Stockage des images produits depuis le sélecteur de fichiers du navigateur.
-- Le bucket est public afin que les images puissent être affichées sur la boutique.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Les utilisateurs authentifiés du dashboard peuvent ajouter des images.
drop policy if exists "Authenticated users can upload product images" on storage.objects;
create policy "Authenticated users can upload product images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'product-images');

-- Les utilisateurs authentifiés peuvent remplacer/supprimer leurs fichiers si nécessaire.
drop policy if exists "Authenticated users can update product images" on storage.objects;
create policy "Authenticated users can update product images"
on storage.objects
for update
to authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

drop policy if exists "Authenticated users can delete product images" on storage.objects;
create policy "Authenticated users can delete product images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'product-images');

-- La boutique publique doit pouvoir afficher les images.
drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects
for select
to public
using (bucket_id = 'product-images');
