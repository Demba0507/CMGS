// Toute transition entre ces 5 statuts est autorisée (§26 : "ne pas
// imposer artificiellement un workflow irréversible") — la sécurité et
// la cohérence du stock sont garanties côté serveur par update_order_status
// / cancel_order, pas par cette liste, qui ne sert qu'à proposer les
// boutons pertinents dans l'interface.
export const ORDER_STATUS_FLOW: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'DELIVERED', 'CANCELLED', 'RETURNED'],
  CONFIRMED: ['PENDING', 'DELIVERED', 'CANCELLED', 'RETURNED'],
  DELIVERED: ['PENDING', 'CONFIRMED', 'CANCELLED', 'RETURNED'],
  CANCELLED: ['PENDING', 'CONFIRMED', 'DELIVERED', 'RETURNED'],
  RETURNED: ['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'],
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  RETURNED: 'Retournée',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-ocre-100 text-ocre-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  RETURNED: 'bg-orange-100 text-orange-700',
};

export const SUBORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  PREPARING: 'En préparation',
  READY: 'Prête',
  HANDED_TO_DELIVERY: 'Remise au livreur',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};

export const SUBORDER_STATUS_FLOW: Record<string, string[]> = {
  PENDING: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['HANDED_TO_DELIVERY'],
  HANDED_TO_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const SUBORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-ocre-100 text-ocre-700',
  PREPARING: 'bg-indigo-100 text-indigo-700',
  READY: 'bg-purple-100 text-purple-700',
  HANDED_TO_DELIVERY: 'bg-cyan-100 text-cyan-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export const RETURN_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Demandé',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  COMPLETED: 'Terminé',
};

export const RETURN_STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-ocre-100 text-ocre-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouverte',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolue',
  CLOSED: 'Fermée',
};

export const COMPLAINT_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-ocre-100 text-ocre-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-sand-200 text-sand-700',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  VERIFIED: 'Vérifié',
  REJECTED: 'Rejeté',
  REFUNDED: 'Remboursé',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-ocre-100 text-ocre-700',
  VERIFIED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-sand-200 text-sand-700',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH_ON_DELIVERY: 'Paiement à la livraison',
  ORANGE_MONEY_MANUAL: 'Orange Money (manuel)',
  // Terrain préparé (§19 du prompt de correction) : valeur acceptée en base et
  // libellé prêt à l'affichage, mais aucune commande ne peut encore utiliser
  // ce mode tant que payments.orange_money_auto_enabled reste désactivé — pas
  // d'intégration API Orange Money réelle configurée à ce jour.
  ORANGE_MONEY_AUTOMATIC: 'Orange Money (automatique)',
};

export const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  SUSPENDED: 'Suspendu',
};

export const SUPPLIER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-ocre-100 text-ocre-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  SUSPENDED: 'bg-orange-100 text-orange-700',
};

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  PROSPECT: 'Prospect',
  CUSTOMER: 'Client',
  INACTIVE: 'Inactif',
};

export const CUSTOMER_STATUS_COLORS: Record<string, string> = {
  PROSPECT: 'bg-ocre-100 text-ocre-700',
  CUSTOMER: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-sand-200 text-sand-700',
};

export const DRIVER_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  ASSIGNED: 'Assigné',
  PICKED_UP: 'Récupéré',
  IN_TRANSIT: 'En route',
  DELIVERED: 'Livré',
  FAILED: 'Échec',
  RETURNED: 'Retourné',
};

export const DRIVER_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  PICKED_UP: 'bg-indigo-100 text-indigo-700',
  IN_TRANSIT: 'bg-cyan-100 text-cyan-700',
  DELIVERED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  RETURNED: 'bg-orange-100 text-orange-700',
};

export const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  SITE: 'Site web',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  SIMULATOR: 'Simulateur',
};

export const BAMAKO_NEIGHBORHOODS = [
  'Hamdallaye',
  'ACI 2000',
  'Magnambougou',
  'Medina Coura',
  'Lafiabougou',
  'Badalabougou',
  'Faladié',
  'Sotuba',
  'Kalaban Coura',
  'Baco Djicoroni',
  'Sénou',
  'Korofina',
  'Sikoro',
  'Moribabougou',
  'Bankoni',
];
