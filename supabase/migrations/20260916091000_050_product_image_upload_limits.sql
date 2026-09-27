/*
  Correction complète CMGS — Étape 5 (§11 du prompt maître) : formats et taille
  des images produits.

  PROBLÈME IDENTIFIÉ À L'AUDIT : le bucket de stockage 'product-images' (créé en
  027_product_images_storage.sql) n'avait ni allowed_mime_types ni
  file_size_limit — n'importe quel type de fichier (l'attribut HTML accept du
  sélecteur de fichiers React acceptait tous les types d'image sans distinction,
  et rien n'empêchait de contourner cette contrainte HTML en modifiant la requête)
  et n'importe quelle taille pouvaient être envoyés. La validation format/taille
  ne doit pas reposer uniquement sur l'attribut accept du champ de sélection de
  fichier côté React (facilement contournable) : elle doit aussi être appliquée
  côté serveur, ici directement par Supabase Storage.

  CORRECTION : le bucket n'accepte plus, au niveau du serveur de stockage
  lui-même, que JPEG/PNG/WebP, avec une taille maximale de 5 Mo par fichier —
  toute tentative d'upload en dehors de ces limites est rejetée par Supabase
  Storage indépendamment de ce que le frontend a pu ou non filtrer.
  La validation côté interface (src/lib/imageValidation.ts, étape 5) reste en
  complément pour donner un message clair avant même de tenter l'upload.
*/

update storage.buckets
set file_size_limit = 5242880, -- 5 Mo
    allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
where id = 'product-images';
