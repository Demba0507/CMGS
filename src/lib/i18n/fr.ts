const fr = {
  'nav.store': 'Boutique',
  'nav.account': 'Mon compte',
  'nav.dashboard': 'Dashboard',
  'nav.deliveries': 'Mes livraisons',

  'store.search_placeholder': 'Rechercher un produit...',
  'store.cart': 'Panier',
  'store.cart_empty': 'Votre panier est vide',
  'store.add_to_cart': 'Ajouter au panier',
  'store.checkout': 'Commander',
  'store.all_categories': 'Toutes les catégories',

  'checkout.title': 'Finaliser la commande',
  'checkout.name': 'Nom complet',
  'checkout.phone': 'Téléphone',
  'checkout.neighborhood': 'Quartier',
  'checkout.address': 'Adresse précise (facultatif)',
  'checkout.share_location': 'Partager ma position',
  'checkout.location_shared': 'Position partagée',
  'checkout.payment_method': 'Méthode de paiement',
  'checkout.cash_on_delivery': 'Paiement à la livraison',
  'checkout.orange_money_manual': 'Orange Money (manuel)',
  'checkout.submit': 'Confirmer la commande',
  'checkout.success': 'Commande confirmée !',

  'account.orders': 'Commandes',
  'account.payments': 'Paiements',
  'account.deliveries': 'Livraisons',
  'account.conversations': 'Conversations',
  'account.returns': 'Retours',
  'account.notifications': 'Notifications',
  'account.logout': 'Se déconnecter',
  'account.edit_profile': 'Modifier mon profil',

  'chatbot.greeting': 'Bonjour 😊 Bienvenue chez CMGS ! Je peux vous aider à trouver un produit, vérifier un prix ou passer une commande. Que recherchez-vous ?',
  'chatbot.placeholder': 'Écrivez votre message...',

  'common.cancel': 'Annuler',
  'common.save': 'Enregistrer',
  'common.close': 'Fermer',
  'common.loading': 'Chargement...',
} as const;

export default fr;
export type TranslationKey = keyof typeof fr;
