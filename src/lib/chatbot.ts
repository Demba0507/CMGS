import { supabase } from './supabase';
import { getPublicProducts } from './catalog';
import { getPublicSettings } from './settings';
import { createPublicCheckout } from './checkout';
import type { Product, Message } from './types';
import { formatFCFA } from './format';

export interface CheckoutDraft {
  paymentMethod?: 'CASH_ON_DELIVERY' | 'ORANGE_MONEY_MANUAL';
  name?: string;
  phone?: string;
  neighborhood?: string;
}

export interface BotContext {
  conversationId: string;
  customerId: string | null;
  lastProducts: Product[];
  lastIntent: string | null;
  cart: { productId: string; quantity: number }[];
  checkoutDraft: CheckoutDraft;
  fallbackStreak: number;
}

export interface BotResult {
  reply: string;
  intent: string;
  products?: Product[];
  contextUpdates?: Partial<BotContext>;
  action?: 'CREATE_ORDER' | 'ADD_TO_CART' | 'REQUEST_HUMAN';
}

const GREETING_WORDS = ['bonjour', 'salut', 'bonsoir', 'hello', 'coucou'];
const SEARCH_WORDS = ['chaussure', 'sandale', 'sac', 'telephone', 'phone', 'casque', 'chargeur', 'montre', 'robe', 'boubou', 'foulard', 'lampe', 'creme', 'ustensile', 'power', 'bank'];
const PRICE_WORDS = ['combien', 'prix', 'coute', 'cher', 'coute combien'];
const STOCK_WORDS = ['stock', 'reste', 'disponible', 'disponibilite', 'quantite', 'combien il reste'];
const ORDER_WORDS = ['commander', 'commande', 'je prends', 'acheter', 'je veux', 'prends', 'achete'];
const CHEAPER_WORDS = ['moins cher', 'cheaper', 'pas cher', 'abordable', 'budget'];
const HUMAN_WORDS = ['humain', 'conseiller', 'agent', 'parler a quelqu', 'un vrai', 'service client', 'assistance humaine'];
const CASH_WORDS = ['livraison', 'especes', 'cash', 'a la reception'];
const ORANGE_WORDS = ['orange money', 'orange', 'om'];
const CONFIRM_WORDS = ['oui', 'ok', 'je confirme', 'confirmer', "d'accord", 'daccord', 'valide', 'yes'];
const CANCEL_WORDS = ['non', 'annuler', 'annulation', 'stop', 'laisse tomber'];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extractQuantity(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  const wordNums: Record<string, number> = {
    'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  };
  for (const w of words) {
    if (wordNums[w] !== undefined) return wordNums[w];
  }
  return 1;
}

const ORDINAL_WORDS: Record<string, number> = {
  'premier': 1, 'première': 1, 'premiere': 1,
  'deuxieme': 2, 'deuxième': 2, 'second': 2, 'seconde': 2,
  'troisieme': 3, 'troisième': 3,
  'quatrieme': 4, 'quatrième': 4,
  'cinquieme': 5, 'cinquième': 5,
};

/** Résout "le deuxième", "la 2ème" vers un produit de la dernière liste affichée (§37).
 *  Volontairement limité aux mots ordinaux (pas aux chiffres bruts) pour ne jamais entrer
 *  en conflit avec une quantité du type "je prends 2". */
function extractOrdinalProduct(text: string, lastProducts: Product[]): Product | null {
  if (lastProducts.length === 0) return null;
  const normalized = normalize(text);
  for (const [word, idx] of Object.entries(ORDINAL_WORDS)) {
    if (normalized.includes(word) && lastProducts[idx - 1]) return lastProducts[idx - 1];
  }
  return null;
}

function extractSearchTerm(text: string): string | null {
  const normalized = normalize(text);
  for (const word of SEARCH_WORDS) {
    if (normalized.includes(word)) return word;
  }
  return null;
}

async function searchProducts(query: string): Promise<Product[]> {
  return (await getPublicProducts())
    .filter((product) => product.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 5);
}

async function getAllActiveProducts(): Promise<Product[]> {
  return (await getPublicProducts()).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5);
}

function formatProductList(products: Product[]): string {
  if (products.length === 0) return "Désolé, je n'ai trouvé aucun produit correspondant.";
  const lines = products.map((p, i) => {
    const stock = p.stock_verified > 0 ? 'Disponible' : 'Rupture de stock';
    return `${i + 1}. ${p.code} — ${p.name} (${formatFCFA(p.sale_price)}, ${stock})`;
  });
  return 'Voici les modèles disponibles :\n' + lines.join('\n');
}

/** Réponse standard quand le bot ne sait pas répondre : jamais d'invention, toujours une porte de sortie humaine (§35). */
async function buildUnknownReply(): Promise<string> {
  const settings = await getPublicSettings();
  const numbers = settings['service_client.phone_numbers'];
  const base = "Je ne dispose pas de cette information pour le moment.";
  if (numbers && numbers.length > 0) {
    return `${base} Vous pouvez contacter notre équipe au ${numbers.join(' ou au ')}, ou me demander de vous mettre en relation avec un conseiller.`;
  }
  return `${base} Je peux vous mettre en relation avec un conseiller CMGS si vous le souhaitez.`;
}

function buildRecap(product: Product, qty: number, draft: CheckoutDraft): string {
  const deliveryFee = 1000;
  const total = product.sale_price * qty + deliveryFee;
  const paymentLabel = draft.paymentMethod === 'ORANGE_MONEY_MANUAL' ? 'Orange Money (manuel)' : 'Paiement à la livraison';
  return [
    'Récapitulatif de votre commande :',
    `— ${qty} × ${product.name} = ${formatFCFA(product.sale_price * qty)}`,
    `— Livraison : ${formatFCFA(deliveryFee)}`,
    `— Total : ${formatFCFA(total)}`,
    `— Paiement : ${paymentLabel}`,
    `— Livraison chez : ${draft.name}, ${draft.phone}, ${draft.neighborhood}`,
    '',
    'Confirmez-vous cette commande ? Répondez "oui" pour confirmer ou "non" pour annuler.',
  ].join('\n');
}

export async function processMessage(text: string, ctx: BotContext): Promise<BotResult> {
  const normalized = normalize(text);
  const draft = ctx.checkoutDraft ?? {};

  // Demande explicite d'un humain — prioritaire sur tout le reste.
  if (HUMAN_WORDS.some((w) => normalized.includes(w))) {
    return {
      reply: "Je transmets votre demande à notre équipe, un conseiller CMGS va prendre le relais de cette conversation dans quelques instants.",
      intent: 'HUMAN_HANDOFF_REQUESTED',
      action: 'REQUEST_HUMAN',
      contextUpdates: { lastIntent: 'HUMAN_HANDOFF_REQUESTED', fallbackStreak: 0 },
    };
  }

  // Étape confirmation finale d'une commande en cours de préparation.
  if (ctx.lastIntent === 'CONFIRM_ORDER') {
    if (CONFIRM_WORDS.some((w) => normalized === w || normalized.startsWith(w))) {
      const cartLine = ctx.cart[0];
      const product = ctx.lastProducts.find((p) => p.id === cartLine?.productId);
      if (!cartLine || !product) {
        return { reply: "Votre panier semble vide, reprenons : que souhaitez-vous commander ?", intent: 'FALLBACK', contextUpdates: { lastIntent: 'FALLBACK' } };
      }
      return {
        reply: 'Merci ! Je crée votre commande...',
        intent: 'ORDER_CONFIRMED',
        action: 'CREATE_ORDER',
        contextUpdates: { lastIntent: 'ORDER_CONFIRMED' },
      };
    }
    if (CANCEL_WORDS.some((w) => normalized === w || normalized.startsWith(w))) {
      return {
        reply: "Commande annulée, aucun frais n'a été engagé. Puis-je vous aider avec autre chose ?",
        intent: 'ORDER_CANCELLED',
        contextUpdates: { lastIntent: null, cart: [], checkoutDraft: {} },
      };
    }
    return { reply: 'Merci de répondre "oui" pour confirmer la commande ou "non" pour annuler.', intent: 'CONFIRM_ORDER', contextUpdates: { lastIntent: 'CONFIRM_ORDER' } };
  }

  // Collecte séquentielle des informations client obligatoires (§17 : nom, téléphone, quartier).
  if (ctx.lastIntent === 'ASK_NAME') {
    const name = text.trim();
    if (!name) return { reply: 'Quel est votre nom complet ?', intent: 'ASK_NAME', contextUpdates: { lastIntent: 'ASK_NAME' } };
    return { reply: 'Merci. Quel est votre numéro de téléphone ?', intent: 'ASK_PHONE', contextUpdates: { lastIntent: 'ASK_PHONE', checkoutDraft: { ...draft, name } } };
  }
  if (ctx.lastIntent === 'ASK_PHONE') {
    const phone = text.trim();
    if (!phone) return { reply: 'Quel est votre numéro de téléphone ?', intent: 'ASK_PHONE', contextUpdates: { lastIntent: 'ASK_PHONE' } };
    return { reply: 'Et dans quel quartier habitez-vous ?', intent: 'ASK_NEIGHBORHOOD', contextUpdates: { lastIntent: 'ASK_NEIGHBORHOOD', checkoutDraft: { ...draft, phone } } };
  }
  if (ctx.lastIntent === 'ASK_NEIGHBORHOOD') {
    const neighborhood = text.trim();
    if (!neighborhood) return { reply: 'Dans quel quartier habitez-vous ?', intent: 'ASK_NEIGHBORHOOD', contextUpdates: { lastIntent: 'ASK_NEIGHBORHOOD' } };
    const finalDraft = { ...draft, neighborhood };
    const cartLine = ctx.cart[0];
    const product = ctx.lastProducts.find((p) => p.id === cartLine?.productId);
    if (!cartLine || !product) {
      return { reply: 'Que souhaitez-vous commander ?', intent: 'FALLBACK', contextUpdates: { lastIntent: 'FALLBACK', checkoutDraft: {} } };
    }
    return {
      reply: buildRecap(product, cartLine.quantity, finalDraft),
      intent: 'CONFIRM_ORDER',
      contextUpdates: { lastIntent: 'CONFIRM_ORDER', checkoutDraft: finalDraft },
    };
  }

  // Choix du mode de paiement -> démarre la collecte d'informations si nécessaire.
  if (ctx.cart.length > 0 && (CASH_WORDS.some((w) => normalized.includes(w)) || ORANGE_WORDS.some((w) => normalized.includes(w)))) {
    const paymentMethod: CheckoutDraft['paymentMethod'] = ORANGE_WORDS.some((w) => normalized.includes(w)) ? 'ORANGE_MONEY_MANUAL' : 'CASH_ON_DELIVERY';
    const nextDraft = { ...draft, paymentMethod };
    if (!nextDraft.name) {
      return { reply: 'Parfait. Pour la livraison, quel est votre nom complet ?', intent: 'ASK_NAME', contextUpdates: { lastIntent: 'ASK_NAME', checkoutDraft: nextDraft } };
    }
    if (!nextDraft.phone) {
      return { reply: 'Quel est votre numéro de téléphone ?', intent: 'ASK_PHONE', contextUpdates: { lastIntent: 'ASK_PHONE', checkoutDraft: nextDraft } };
    }
    if (!nextDraft.neighborhood) {
      return { reply: 'Dans quel quartier habitez-vous ?', intent: 'ASK_NEIGHBORHOOD', contextUpdates: { lastIntent: 'ASK_NEIGHBORHOOD', checkoutDraft: nextDraft } };
    }
    const cartLine = ctx.cart[0];
    const product = ctx.lastProducts.find((p) => p.id === cartLine?.productId);
    if (!cartLine || !product) {
      return { reply: 'Que souhaitez-vous commander ?', intent: 'FALLBACK', contextUpdates: { lastIntent: 'FALLBACK' } };
    }
    return { reply: buildRecap(product, cartLine.quantity, nextDraft), intent: 'CONFIRM_ORDER', contextUpdates: { lastIntent: 'CONFIRM_ORDER', checkoutDraft: nextDraft } };
  }

  // Greeting
  for (const w of GREETING_WORDS) {
    if (normalized === w || normalized.startsWith(w + ' ')) {
      return {
        reply: 'Bonjour 😊 Bienvenue chez CMGS ! Je peux vous aider à trouver un produit, passer une commande ou suivre une livraison. Que recherchez-vous ?',
        intent: 'GREETING',
        contextUpdates: { lastIntent: 'GREETING', fallbackStreak: 0 },
      };
    }
  }

  // Price question — "La deuxième coûte combien ?"
  if (PRICE_WORDS.some((w) => normalized.includes(w))) {
    const numMatch = text.match(/(\d+)/);
    if (numMatch && ctx.lastProducts.length > 0) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < ctx.lastProducts.length) {
        const p = ctx.lastProducts[idx];
        return {
          reply: `${p.name} (${p.code}) coûte ${formatFCFA(p.sale_price)}. ${p.stock_verified > 0 ? 'Il est disponible.' : 'Actuellement en rupture de stock.'}`,
          intent: 'PRICE_QUERY',
          contextUpdates: { lastIntent: 'PRICE_QUERY', fallbackStreak: 0 },
        };
      }
    }
    if (ctx.lastProducts.length > 0) {
      const p = ctx.lastProducts[0];
      return {
        reply: `${p.name} (${p.code}) coûte ${formatFCFA(p.sale_price)}.`,
        intent: 'PRICE_QUERY',
        contextUpdates: { lastIntent: 'PRICE_QUERY', fallbackStreak: 0 },
      };
    }
    return {
      reply: 'Quel produit vous intéresse ? Décrivez-moi ce que vous cherchez et je vous dirai le prix.',
      intent: 'PRICE_QUERY',
      contextUpdates: { lastIntent: 'PRICE_QUERY', fallbackStreak: 0 },
    };
  }

  // Stock question
  if (STOCK_WORDS.some((w) => normalized.includes(w))) {
    if (ctx.lastProducts.length > 0) {
      const p = ctx.lastProducts[0];
      if (p.stock_verified > 0) {
        return {
          reply: `${p.name} (${p.code}) est actuellement disponible.`,
          intent: 'STOCK_QUERY',
          contextUpdates: { lastIntent: 'STOCK_QUERY', fallbackStreak: 0 },
        };
      }
      return {
        reply: `${p.name} (${p.code}) est actuellement en rupture de stock.`,
        intent: 'STOCK_QUERY',
        contextUpdates: { lastIntent: 'STOCK_QUERY', fallbackStreak: 0 },
      };
    }
    return {
      reply: 'Quel produit souhaitez-vous vérifier ? Donnez-moi le nom ou le code.',
      intent: 'STOCK_QUERY',
      contextUpdates: { lastIntent: 'STOCK_QUERY', fallbackStreak: 0 },
    };
  }

  // Cheaper
  if (CHEAPER_WORDS.some((w) => normalized.includes(w))) {
    const products = (await getPublicProducts()).sort((a, b) => a.sale_price - b.sale_price).slice(0, 5);
    return {
      reply: formatProductList(products),
      intent: 'CHEAPER_SEARCH',
      products,
      contextUpdates: { lastProducts: products, lastIntent: 'CHEAPER_SEARCH', fallbackStreak: 0 },
    };
  }

  // Order intent — "Je prends deux"
  if (ORDER_WORDS.some((w) => normalized.includes(w))) {
    if (ctx.lastProducts.length === 0) {
      return {
        reply: "Quel produit souhaitez-vous commander ? Cherchez d'abord un produit et je vous aiderai à passer commande.",
        intent: 'ORDER',
        contextUpdates: { lastIntent: 'ORDER', fallbackStreak: 0 },
      };
    }
    const product = extractOrdinalProduct(text, ctx.lastProducts) ?? ctx.lastProducts[0];
    const qty = extractQuantity(text);
    if (qty > product.stock_verified) {
      return {
        reply: `Il ne reste actuellement que ${product.stock_verified} unité(s) disponible(s) pour ${product.name}. Voulez-vous en prendre ${product.stock_verified} ?`,
        intent: 'STOCK_INSUFFICIENT',
        contextUpdates: { lastIntent: 'STOCK_INSUFFICIENT', fallbackStreak: 0 },
      };
    }
    return {
      reply: `Très bon choix ! ${product.name} (${product.code}) ×${qty} = ${formatFCFA(product.sale_price * qty)}. Voulez-vous payer à la livraison ou par Orange Money ?`,
      intent: 'ORDER',
      products: [product],
      contextUpdates: { lastIntent: 'ORDER', cart: [{ productId: product.id, quantity: qty }], fallbackStreak: 0 },
      action: 'ADD_TO_CART',
    };
  }

  // Product search
  const searchTerm = extractSearchTerm(normalized);
  if (searchTerm) {
    let products = await searchProducts(searchTerm);
    if (products.length === 0) {
      products = await getAllActiveProducts();
      return {
        reply: `Je n'ai pas trouvé de "${searchTerm}" précisément, mais voici nos produits disponibles :\n` + formatProductList(products),
        intent: 'PRODUCT_SEARCH',
        products,
        contextUpdates: { lastProducts: products, lastIntent: 'PRODUCT_SEARCH', fallbackStreak: 0 },
      };
    }
    return {
      reply: formatProductList(products),
      intent: 'PRODUCT_SEARCH',
      products,
      contextUpdates: { lastProducts: products, lastIntent: 'PRODUCT_SEARCH', fallbackStreak: 0 },
    };
  }

  // Generic "show products"
  if (normalized.includes('produit') || normalized.includes('catalogue') || normalized.includes('voir') || normalized.includes('montrez') || normalized.includes('afficher')) {
    const products = await getAllActiveProducts();
    return {
      reply: formatProductList(products),
      intent: 'PRODUCT_SEARCH',
      products,
      contextUpdates: { lastProducts: products, lastIntent: 'PRODUCT_SEARCH', fallbackStreak: 0 },
    };
  }

  // Fallback — déterministe, n'invente jamais de donnée. Après 2 échecs consécutifs,
  // le bot propose activement le relais humain plutôt que de tourner en boucle (§35).
  const nextStreak = (ctx.fallbackStreak ?? 0) + 1;
  if (nextStreak >= 2) {
    return {
      reply: await buildUnknownReply(),
      intent: 'FALLBACK',
      contextUpdates: { lastIntent: 'FALLBACK', fallbackStreak: 0 },
    };
  }
  return {
    reply: 'Je peux vous aider à rechercher un produit, vérifier un prix ou un stock, et passer une commande. Que souhaitez-vous faire ?',
    intent: 'FALLBACK',
    contextUpdates: { lastIntent: 'FALLBACK', fallbackStreak: nextStreak },
  };
}

export async function saveMessage(
  conversationId: string,
  sender: 'CUSTOMER' | 'BOT' | 'SYSTEM',
  content: string,
  intent?: string,
  productId?: string
): Promise<Message | null> {
  const { data, error } = await supabase.rpc('append_public_message', {
    p_conversation_id: conversationId,
    p_sender: sender,
    p_content: content,
    p_intent: intent ?? null,
    p_product_id: productId ?? null,
  });
  if (error) return null;
  return data as Message;
}

export async function requestHumanHandoff(conversationId: string): Promise<void> {
  await supabase.rpc('request_human_handoff', { p_conversation_id: conversationId });
}

export async function submitChatOrder(
  cart: { productId: string; quantity: number }[],
  draft: CheckoutDraft
): Promise<{ orderCode: string } | { error: string }> {
  const line = cart[0];
  if (!line || !draft.name || !draft.phone || !draft.neighborhood || !draft.paymentMethod) {
    return { error: 'Informations incomplètes.' };
  }
  try {
    const result = await createPublicCheckout({
      name: draft.name,
      phone: draft.phone,
      neighborhood: draft.neighborhood,
      items: [{ product_id: line.productId, quantity: line.quantity }],
      paymentMethod: draft.paymentMethod,
    });
    return { orderCode: result.order_code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Commande impossible.' };
  }
}

export function getFallbackReply(): string {
  return 'Je rencontre actuellement un problème technique. Veuillez réessayer dans quelques instants.';
}
