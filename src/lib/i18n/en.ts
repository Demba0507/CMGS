import type { TranslationKey } from '@/lib/i18n/fr';

const en: Record<TranslationKey, string> = {
  'nav.store': 'Store',
  'nav.account': 'My account',
  'nav.dashboard': 'Dashboard',
  'nav.deliveries': 'My deliveries',

  'store.search_placeholder': 'Search a product...',
  'store.cart': 'Cart',
  'store.cart_empty': 'Your cart is empty',
  'store.add_to_cart': 'Add to cart',
  'store.checkout': 'Checkout',
  'store.all_categories': 'All categories',

  'checkout.title': 'Complete your order',
  'checkout.name': 'Full name',
  'checkout.phone': 'Phone number',
  'checkout.neighborhood': 'Neighborhood',
  'checkout.address': 'Precise address (optional)',
  'checkout.share_location': 'Share my location',
  'checkout.location_shared': 'Location shared',
  'checkout.payment_method': 'Payment method',
  'checkout.cash_on_delivery': 'Cash on delivery',
  'checkout.orange_money_manual': 'Orange Money (manual)',
  'checkout.submit': 'Confirm order',
  'checkout.success': 'Order confirmed!',

  'account.orders': 'Orders',
  'account.payments': 'Payments',
  'account.deliveries': 'Deliveries',
  'account.conversations': 'Conversations',
  'account.returns': 'Returns',
  'account.notifications': 'Notifications',
  'account.logout': 'Log out',
  'account.edit_profile': 'Edit my profile',

  'chatbot.greeting': "Hello 😊 Welcome to RATELAFRICA! I can help you find a product, check a price, or place an order. What are you looking for?",
  'chatbot.placeholder': 'Type your message...',

  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.close': 'Close',
  'common.loading': 'Loading...',
};

export default en;
