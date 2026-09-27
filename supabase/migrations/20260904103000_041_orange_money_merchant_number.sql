/*
  Complément demandé par Demba pendant l'étape 23 (audit paiements, §28/§29) :
  quand le client choisit Orange Money manuel au checkout, il doit voir le
  numéro marchand CMGS pour savoir où envoyer le paiement — ce numéro
  n'existait nulle part dans les paramètres.

  Public (is_public = true) : ce n'est pas une donnée sensible, c'est
  l'équivalent d'un numéro affiché sur une vitrine de boutique — le client
  doit pouvoir le voir avant même d'avoir passé commande.
*/

insert into public.settings (key, value, category, description, is_public)
values ('payments.orange_money_merchant_number', '""'::jsonb, 'payments', 'Numéro Orange Money marchand affiché au client (paiement manuel)', true)
on conflict (key) do nothing;
