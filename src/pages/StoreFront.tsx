import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Search, Menu, X, MessageCircle, MapPin, Phone, Trash2, ChevronRight, CheckCircle, Package, Truck, Sparkles, Star, Clock, Shield, ArrowRight, Eye, Filter, CreditCard, Home, Grid } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getPublicProducts } from '@/lib/catalog';
import { getPublicVariants } from '@/lib/variants';
import { getPublicSettings } from '@/lib/settings';
import { listProductImages } from '@/lib/images';
import { createPublicCheckout } from '@/lib/checkout';
import { updateMyCustomerLocation } from '@/lib/myAccount';
import type { Product, Category, PublicVariant, ProductImage, HeroSlide } from '@/lib/types';
import { getPublicHeroSlides } from '@/lib/heroSlides';
import { formatFCFA } from '@/lib/format';
import { BAMAKO_NEIGHBORHOODS } from '@/lib/constants';
import Chatbot from '@/components/Chatbot';
import { useTranslation } from '@/lib/i18n';

type StorePage = 'home' | 'catalog' | 'product' | 'cart' | 'checkout' | 'order-confirmation';

interface CartItem {
  product: Product;
  variant: PublicVariant | null;
  quantity: number;
}

function cartLineKey(productId: string, variantId?: string | null) {
  return `${productId}::${variantId ?? ''}`;
}

export default function StoreFront() {
  const { t, language, setLanguage } = useTranslation();
  const [page, setPage] = useState<StorePage>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    (async () => {
      const [prods, { data: cats }] = await Promise.all([
        getPublicProducts(),
        supabase.from('categories').select('*').order('name'),
      ]);
      setProducts(prods.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setCategories((cats as Category[]) ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    if (selectedCategory) {
      result = result.filter((p) => p.category_id === selectedCategory);
    }
    return result;
  }, [products, searchQuery, selectedCategory]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.product.sale_price * item.quantity, 0);

  // Étape 2 (§4 du prompt maître) : la quantité saisie par le client n'est plus
  // plafonnée côté client sur le stock exact (ce qui exposait indirectement le
  // stock réel par tâtonnement, contraire au §8). Seule une borne de saisie
  // raisonnable (1..999) est appliquée pour éviter les valeurs absurdes ;
  // la disponibilité réelle est vérifiée côté serveur par create_public_checkout
  // (RPC), qui refuse la commande avec un message clair si le stock est insuffisant.
  const MAX_CART_LINE_QTY = 999;

  const addToCart = (product: Product, variant: PublicVariant | null = null, qty: number = 1) => {
    const safeQty = Math.min(Math.max(1, Math.trunc(qty) || 1), MAX_CART_LINE_QTY);
    const key = cartLineKey(product.id, variant?.id);
    setCart((prev) => {
      const existing = prev.find((i) => cartLineKey(i.product.id, i.variant?.id) === key);
      if (existing) {
        return prev.map((i) => (cartLineKey(i.product.id, i.variant?.id) === key ? { ...i, quantity: Math.min(i.quantity + safeQty, MAX_CART_LINE_QTY) } : i));
      }
      return [...prev, { product, variant, quantity: safeQty }];
    });
  };

  // Remplace directement la quantité d'une ligne du panier (saisie libre, pas de +/-).
  // Une quantité <= 0 retire la ligne du panier.
  const setCartQty = (productId: string, variantId: string | null | undefined, newQty: number) => {
    const key = cartLineKey(productId, variantId);
    setCart((prev) =>
      prev
        .map((i) => {
          if (cartLineKey(i.product.id, i.variant?.id) !== key) return i;
          if (!Number.isFinite(newQty) || newQty <= 0) return null;
          return { ...i, quantity: Math.min(Math.trunc(newQty), MAX_CART_LINE_QTY) };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string, variantId?: string | null) => {
    const key = cartLineKey(productId, variantId);
    setCart((prev) => prev.filter((i) => cartLineKey(i.product.id, i.variant?.id) !== key));
  };

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setPage('product');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateTo = (page: StorePage) => {
    setPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/70 dark:from-sand-900 dark:via-sand-900 dark:to-sand-900 flex flex-col">
      {/* Header avec glassmorphism */}
      <header className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled 
          ? 'bg-white/80 dark:bg-sand-800 backdrop-blur-xl border-b border-slate-200/50 dark:border-sand-700 shadow-sm' 
          : 'bg-transparent border-b border-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo avec animation */}
            <button 
              onClick={() => { navigateTo('home'); setSelectedCategory(null); }} 
              className="flex items-center gap-2 shrink-0 group"
            >
              <img src="/logo.png" alt="RATELAFRICA" className="w-10 h-10 rounded-2xl object-contain shrink-0 group-hover:scale-105 transition-transform duration-300" />
              <span className="font-display font-bold text-lg text-slate-800 dark:text-sand-100 hidden sm:block">
                RATELAFRICA
              </span>
            </button>

            {/* Barre de recherche */}
            <div className="flex-1 max-w-md hidden md:block">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-sand-500 group-focus-within:text-amber-500 transition-colors" />
                <input
                  type="text"
                  placeholder={t('store.search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage('catalog'); }}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl border border-slate-200 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-white dark:focus:bg-sand-700 transition-all duration-300"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setChatOpen(true)} 
                className="relative w-10 h-10 rounded-2xl flex items-center justify-center text-slate-600 dark:text-sand-300 hover:bg-amber-50 hover:text-amber-600 transition-all duration-300 hover:scale-105"
                title="Assistant RATELAFRICA"
              >
                <MessageCircle className="w-5 h-5" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
              </button>
              
              <button 
                onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')} 
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-bold text-slate-600 dark:text-sand-300 hover:bg-amber-50 hover:text-amber-600 transition-all duration-300"
              >
                {language.toUpperCase()}
              </button>
              
              <button 
                onClick={() => navigateTo('cart')} 
                className="relative w-10 h-10 rounded-2xl flex items-center justify-center text-slate-700 dark:text-sand-200 hover:bg-amber-50 hover:text-amber-600 transition-all duration-300 hover:scale-105"
                title={t('store.cart')}
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-amber-500/25 animate-bounce-in">
                    {cartCount}
                  </span>
                )}
              </button>
              
              <button 
                onClick={() => setMobileMenu(!mobileMenu)} 
                className="md:hidden w-10 h-10 rounded-2xl flex items-center justify-center text-slate-600 dark:text-sand-300 hover:bg-amber-50 hover:text-amber-600 transition-all duration-300"
              >
                {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenu && (
          <div className="md:hidden border-t border-slate-200/50 dark:border-sand-700 p-4 bg-white/95 dark:bg-sand-800 backdrop-blur-xl animate-slide-down">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-sand-500" />
              <input 
                type="text" 
                placeholder={t('store.search_placeholder')} 
                value={searchQuery} 
                onChange={(e) => { setSearchQuery(e.target.value); setPage('catalog'); setMobileMenu(false); }} 
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl border border-slate-200 dark:border-sand-700 bg-slate-50 dark:bg-sand-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40 transition-all"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => { setSelectedCategory(null); setPage('catalog'); setMobileMenu(false); }} 
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-amber-500/25 transition-all"
              >
                Tout
              </button>
              {categories.map((c) => (
                <button 
                  key={c.id} 
                  onClick={() => { setSelectedCategory(c.id); setPage('catalog'); setMobileMenu(false); }} 
                  className="px-4 py-2 rounded-2xl bg-slate-100 dark:bg-sand-700 text-slate-700 dark:text-sand-200 text-sm font-medium hover:bg-amber-100 hover:text-amber-700 transition-all"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {page === 'home' && (
          <HomePage 
            products={products} 
            categories={categories} 
            onOpenProduct={openProduct} 
            onSeeAll={() => navigateTo('catalog')} 
            onSelectCategory={(id) => { setSelectedCategory(id); navigateTo('catalog'); }} 
          />
        )}
        {page === 'catalog' && (
          <CatalogPage 
            products={filtered} 
            categories={categories} 
            selectedCategory={selectedCategory} 
            onSelectCategory={setSelectedCategory} 
            onOpenProduct={openProduct} 
          />
        )}
        {page === 'product' && selectedProduct && (
          <ProductPage 
            product={selectedProduct} 
            onAddToCart={addToCart} 
            onBack={() => navigateTo('catalog')} 
            relatedProducts={products.filter((p) => p.id !== selectedProduct.id && p.category_id === selectedProduct.category_id).slice(0, 40)} 
            onOpenProduct={openProduct} 
            onSeeAllRelated={() => { setSelectedCategory(selectedProduct.category_id); navigateTo('catalog'); }}
          />
        )}
        {page === 'cart' && (
          <CartPage 
            cart={cart} 
            total={cartTotal} 
            onUpdateQty={setCartQty} 
            onRemove={removeFromCart} 
            onCheckout={() => navigateTo('checkout')} 
            onContinue={() => navigateTo('catalog')} 
          />
        )}
        {page === 'checkout' && (
          <CheckoutPage 
            cart={cart} 
            total={cartTotal} 
            onBack={() => navigateTo('cart')} 
            onComplete={() => { setCart([]); navigateTo('order-confirmation'); }} 
          />
        )}
        {page === 'order-confirmation' && (
          <ConfirmationPage onContinue={() => navigateTo('home')} />
        )}
      </main>

      {/* Footer moderne */}
      <footer className="bg-gradient-to-b from-slate-900 to-slate-950 text-slate-300 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/logo.png" alt="RATELAFRICA" className="w-10 h-10 rounded-2xl object-contain shrink-0" />
                <span className="font-display font-bold text-lg text-white">RATELAFRICA</span>
              </div>
              <p className="text-sm text-slate-400 dark:text-sand-500 leading-relaxed">
                Votre marketplace de confiance à Bamako. Produits authentiques, livraison rapide, paiement à la livraison.
              </p>
              <div className="flex gap-3 mt-4">
                {['❤️', '⭐', '🏆'].map((emoji, i) => (
                  <span key={i} className="text-2xl opacity-50 hover:opacity-100 transition-opacity">{emoji}</span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Catégories</h4>
              <ul className="space-y-2 text-sm">
                {categories.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <button 
                      onClick={() => { setSelectedCategory(c.id); setPage('catalog'); }} 
                      className="hover:text-amber-400 transition-colors duration-200"
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Contact</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-3 hover:text-amber-400 transition-colors">
                  <Phone className="w-4 h-4 text-amber-400" /> +223 76 00 00 00
                </li>
                <li className="flex items-center gap-3 hover:text-amber-400 transition-colors">
                  <MapPin className="w-4 h-4 text-amber-400" /> Bamako, Mali
                </li>
                <li className="flex items-center gap-3 hover:text-amber-400 transition-colors">
                  <Clock className="w-4 h-4 text-amber-400" /> 7j/7 - 24h/24
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Paiement</h4>
              <p className="text-sm text-slate-400 dark:text-sand-500 leading-relaxed">
                Paiement à la livraison ou Orange Money. Livraison dans tous les quartiers de Bamako.
              </p>
              <div className="flex gap-2 mt-3">
                <span className="px-3 py-1.5 rounded-lg bg-white/10 dark:bg-sand-800 text-xs font-medium text-white">Paiement à la livraison</span>
                <span className="px-3 py-1.5 rounded-lg bg-white/10 dark:bg-sand-800 text-xs font-medium text-white">Orange Money</span>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-800/50 mt-8 pt-6 text-center text-sm text-slate-500 dark:text-sand-400">
            © 2025 RATELAFRICA AI — Bamako, Mali
          </div>
        </div>
      </footer>

      {chatOpen && <Chatbot onClose={() => setChatOpen(false)} onAddToCart={addToCart} />}
    </div>
  );
}

// ============ HOME ============
function HomePage({ products, categories, onOpenProduct, onSeeAll, onSelectCategory }: { 
  products: Product[]; 
  categories: Category[]; 
  onOpenProduct: (p: Product) => void; 
  onSeeAll: () => void; 
  onSelectCategory: (id: string) => void; 
}) {
  const featured = products.slice(0, 8);
  const newProducts = products.slice(0, 4);
  const [showCategories, setShowCategories] = useState(false);
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => { (async () => setSlides(await getPublicHeroSlides()))(); }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    const current = slides[slideIndex];
    const timer = setTimeout(() => setSlideIndex((i) => (i + 1) % slides.length), (current?.duration_seconds ?? 6) * 1000);
    return () => clearTimeout(timer);
  }, [slides, slideIndex]);

  return (
    <div className="animate-fade-in">
      {/* Hero — carrousel dynamique géré depuis Dashboard → Carrousel boutique (§9).
          Sans slide configuré, on retombe sur le hero par défaut plutôt qu'une section vide. */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 w-72 h-72 bg-amber-500 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-500 rounded-full blur-3xl animate-float-delayed" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-400 rounded-full blur-[120px] opacity-10" />
        </div>
        {slides.length > 0 && (
          <div className="absolute inset-0">
            {slides.map((s, i) => (
              <img key={s.id} src={s.image_url} alt="" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === slideIndex ? 'opacity-30' : 'opacity-0'}`} />
            ))}
          </div>
        )}

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 backdrop-blur-sm border border-amber-400/30 text-amber-300 text-sm font-medium mb-6 animate-slide-up">
              <MapPin className="w-4 h-4" /> Bamako, Mali
              <Sparkles className="w-3 h-3 ml-1" />
            </div>
            {slides.length > 0 ? (
              <div key={slides[slideIndex].id} className="animate-fade-in">
                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">{slides[slideIndex].title}</h1>
                {slides[slideIndex].description && <p className="text-lg text-slate-300 mb-8 max-w-xl leading-relaxed">{slides[slideIndex].description}</p>}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => (slides[slideIndex].button_link ? onSelectCategory(slides[slideIndex].button_link!) : onSeeAll())}
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 transition-all duration-300 font-medium text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105"
                  >
                    {slides[slideIndex].button_text || 'Voir le catalogue'} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {slides.length > 1 && (
                  <div className="flex gap-2 mt-8">
                    {slides.map((s, i) => (
                      <button key={s.id} onClick={() => setSlideIndex(i)} aria-label={`Slide ${i + 1}`} className={`h-1.5 rounded-full transition-all duration-300 ${i === slideIndex ? 'w-8 bg-amber-400' : 'w-1.5 bg-white/30 hover:bg-white/50'}`} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-slide-up-delayed">
                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                  Le commerce de Bamako,<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-300">simplifié.</span>
                </h1>
                <p className="text-lg text-slate-300 mb-8 max-w-xl leading-relaxed">
                  Découvrez des produits authentiques, commandez en quelques clics, 
                  payez à la livraison. Votre assistant IA vous accompagne à chaque étape.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={onSeeAll} 
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 transition-all duration-300 font-medium text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105"
                  >
                    Voir le catalogue <ChevronRight className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => onSelectCategory(categories[0]?.id ?? '')} 
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-white/10 dark:bg-sand-800 backdrop-blur-sm hover:bg-white/20 dark:hover:bg-sand-700 border border-white/20 transition-all duration-300 font-medium hover:scale-105"
                  >
                    Parcourir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Nouveautés — les produits apparaissent en premier (§8) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-sand-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" /> Nouveautés
          </h2>
          <button onClick={onSeeAll} className="text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1 group">
            Voir tout <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {newProducts.map((p) => <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p)} />)}
        </div>
      </section>

      {/* Catégories — repliées par défaut, ouvertes via un bouton plutôt qu'affichées
          d'emblée en grand avant les produits (§8) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-4">
        <button
          onClick={() => setShowCategories((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm hover:bg-white dark:hover:bg-sand-700 transition-all"
        >
          <span className="font-display text-lg font-bold text-slate-800 dark:text-sand-100 flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-500" /> Parcourir par catégorie
          </span>
          <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${showCategories ? 'rotate-90' : ''}`} />
        </button>
        {showCategories && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-4 animate-fade-in">
            {categories.map((c, i) => {
              const count = products.filter((p) => p.category_id === c.id).length;
              const colors = ['from-amber-100 to-amber-200', 'from-blue-100 to-blue-200', 'from-emerald-100 to-emerald-200', 'from-rose-100 to-rose-200', 'from-violet-100 to-violet-200', 'from-cyan-100 to-cyan-200'];
              return (
                <button 
                  key={c.id} 
                  onClick={() => { setShowCategories(false); onSelectCategory(c.id); }} 
                  className="card p-5 text-center hover:shadow-xl hover:border-amber-300 transition-all duration-300 group hover:-translate-y-1 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className={`w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br ${colors[i % colors.length]} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                    <Package className="w-6 h-6 text-slate-700 dark:text-sand-200" />
                  </div>
                  <div className="font-medium text-slate-800 dark:text-sand-100 text-sm">{c.name}</div>
                  <div className="text-xs text-slate-400 dark:text-sand-500 mt-1">{count} produit{count > 1 ? 's' : ''}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Produits populaires */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-sand-100 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" /> Produits populaires
          </h2>
          <button onClick={onSeeAll} className="text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1 group">
            Voir tout <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {featured.map((p) => <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p)} />)}
        </div>
      </section>

      {/* Bannière de confiance */}
      <section className="bg-gradient-to-r from-amber-50 via-white to-amber-50 border-y border-amber-200/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shrink-0 shadow-lg shadow-green-500/20 group-hover:scale-110 transition-transform">
                <CheckCircle className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="font-semibold text-slate-800 dark:text-sand-100">Paiement à la livraison</div>
                <div className="text-sm text-slate-500 dark:text-sand-400">Payez seulement à réception</div>
              </div>
            </div>
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                <Truck className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="font-semibold text-slate-800 dark:text-sand-100">Livraison Bamako</div>
                <div className="text-sm text-slate-500 dark:text-sand-400">Tous les quartiers couverts</div>
              </div>
            </div>
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="font-semibold text-slate-800 dark:text-sand-100">Produits authentiques</div>
                <div className="text-sm text-slate-500 dark:text-sand-400">100% vérifiés</div>
              </div>
            </div>
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-500 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20 group-hover:scale-110 transition-transform">
                <MessageCircle className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="font-semibold text-slate-800 dark:text-sand-100">Assistant IA</div>
                <div className="text-sm text-slate-500 dark:text-sand-400">Posez vos questions 24/7</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ============ PRODUCT CARD ============
function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const outOfStock = product.stock <= 0;
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      onClick={onClick} 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group card overflow-hidden cursor-pointer hover:shadow-2xl transition-all duration-500 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm hover:-translate-y-2"
    >
      <div className="relative aspect-square bg-gradient-to-br from-slate-100 to-slate-200/50 overflow-hidden">
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.name} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
            loading="lazy" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-12 h-12 text-slate-300" />
          </div>
        )}
        
        {outOfStock && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <span className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-500/25">
              Rupture
            </span>
          </div>
        )}
        
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-sand-800 backdrop-blur-sm text-slate-700 dark:text-sand-200 font-mono text-xs shadow-sm">
            {product.code}
          </span>
        </div>
        
        <div className={`absolute top-3 right-3 transition-all duration-300 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
          <button className="w-9 h-9 rounded-full bg-white dark:bg-sand-800 shadow-lg flex items-center justify-center hover:bg-amber-50 transition-colors">
            <Eye className="w-4 h-4 text-slate-600 dark:text-sand-300" />
          </button>
        </div>

        {!outOfStock && (
          <div className="absolute bottom-3 left-3">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-xs font-medium backdrop-blur-sm">
              Disponible
            </span>
          </div>
        )}
        
        {!outOfStock && isHovered && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent flex items-end justify-center pb-4">
            <button className="px-6 py-2.5 rounded-xl bg-white dark:bg-sand-800 text-slate-800 dark:text-sand-100 font-medium text-sm shadow-lg hover:bg-amber-50 transition-all transform scale-95 hover:scale-100">
              Voir le produit
            </button>
          </div>
        )}
      </div>
      
      <div className="p-4">
        <h3 className="font-medium text-slate-800 dark:text-sand-100 text-sm line-clamp-2 mb-1 group-hover:text-amber-600 transition-colors">
          {product.name}
        </h3>
        <div className="flex items-center justify-between mt-1">
          <span className="font-bold text-amber-600 text-lg">
            {formatFCFA(product.sale_price)}
          </span>
          {!outOfStock && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle className="w-3 h-3" /> En stock
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ CATALOG ============
function CatalogPage({ products, categories, selectedCategory, onSelectCategory, onOpenProduct }: { 
  products: Product[]; 
  categories: Category[]; 
  selectedCategory: string | null; 
  onSelectCategory: (id: string | null) => void; 
  onOpenProduct: (p: Product) => void;
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // §5 du prompt maître : les catégories doivent être fermées par défaut et se
  // refermer automatiquement après sélection, de façon identique sur ordinateur,
  // tablette et mobile. On unifie ce comportement avec celui déjà en place sur
  // la page d'accueil (plus de sidebar catégories en permanence ouverte).
  const [showCategories, setShowCategories] = useState(false);
  const activeCategory = categories.find((c) => c.id === selectedCategory) ?? null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-800 dark:text-sand-100">Catalogue</h1>
          <p className="text-slate-500 dark:text-sand-400 text-sm mt-1">
            {products.length} produit{products.length > 1 ? 's' : ''} disponible{products.length > 1 ? 's' : ''}
            {activeCategory && <span> — {activeCategory.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setViewMode('grid')} 
            className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 dark:bg-sand-700 text-slate-400 dark:text-sand-500 hover:bg-slate-200'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setViewMode('list')} 
            className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 dark:bg-sand-700 text-slate-400 dark:text-sand-500 hover:bg-slate-200'}`}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Catégories — fermées par défaut, s'ouvrent via ce bouton et se referment
          automatiquement dès qu'une catégorie est choisie (§5). */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setShowCategories((v) => !v)}
          className="flex-1 flex items-center justify-between px-5 py-3.5 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm hover:bg-white dark:hover:bg-sand-700 transition-all"
        >
          <span className="font-medium text-slate-800 dark:text-sand-100 flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-500" /> Catégories{activeCategory ? ` — ${activeCategory.name}` : ''}
          </span>
          <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${showCategories ? 'rotate-90' : ''}`} />
        </button>
        {selectedCategory && (
          <button
            onClick={() => { onSelectCategory(null); setShowCategories(false); }}
            className="px-5 py-3.5 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm hover:bg-white dark:hover:bg-sand-700 transition-all text-sm font-medium text-slate-600 dark:text-sand-300"
          >
            Tous les produits
          </button>
        )}
      </div>
      {showCategories && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8 animate-fade-in">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelectCategory(c.id); setShowCategories(false); }}
              className={`text-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                selectedCategory === c.id
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25'
                  : 'bg-white/50 dark:bg-sand-800 border border-slate-200/50 dark:border-sand-700 text-slate-600 dark:text-sand-300 hover:border-amber-300'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <div className="card p-16 text-center rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-sand-400 text-lg">Aucun produit trouvé.</p>
          <p className="text-slate-400 dark:text-sand-500 text-sm">Essayez une autre recherche ou catégorie.</p>
        </div>
      ) : (
        <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4' : 'grid-cols-1 gap-3'}`}>
          {products.map((p) => (
            viewMode === 'grid' 
              ? <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p)} />
              : <ProductCardList key={p.id} product={p} onClick={() => onOpenProduct(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

// Product Card List View
function ProductCardList({ product, onClick }: { product: Product; onClick: () => void }) {
  const outOfStock = product.stock <= 0;
  
  return (
    <div 
      onClick={onClick} 
      className="group card overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-300 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm hover:-translate-x-1 flex gap-4 p-4"
    >
      <div className="w-24 h-24 rounded-xl bg-slate-100 dark:bg-sand-700 overflow-hidden shrink-0">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-slate-300" /></div>
        )}
      </div>
      <div className="flex-1 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-slate-800 dark:text-sand-100 group-hover:text-amber-600 transition-colors">{product.name}</h3>
          <p className="text-sm text-slate-500 dark:text-sand-400">{product.code}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-bold text-amber-600">{formatFCFA(product.sale_price)}</span>
            {!outOfStock && <span className="text-xs text-emerald-600 font-medium">✓ Disponible</span>}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400 dark:text-sand-500 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
      </div>
    </div>
  );
}

// ============ PRODUCT DETAIL ============
function ProductPage({ product, onAddToCart, onBack, relatedProducts, onOpenProduct, onSeeAllRelated }: { 
  product: Product; 
  onAddToCart: (p: Product, variant: PublicVariant | null, qty: number) => void; 
  onBack: () => void; 
  relatedProducts: Product[]; 
  onOpenProduct: (p: Product) => void;
  onSeeAllRelated: () => void;
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [variants, setVariants] = useState<PublicVariant[]>([]);
  const [gallery, setGallery] = useState<ProductImage[]>([]);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  useEffect(() => {
    setVariants([]);
    setGallery([]);
    setSelectedColor(null);
    setSelectedSize(null);
    setQty(1);
    (async () => {
      const [v, g] = await Promise.all([getPublicVariants(product.id), listProductImages(product.id).catch(() => [])]);
      setVariants(v);
      setGallery(g);
    })();
  }, [product.id]);

  const colors = useMemo(() => [...new Set(variants.map((v) => v.color).filter((c): c is string => !!c))], [variants]);
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size).filter((s): s is string => !!s))], [variants]);
  const hasVariants = variants.length > 0;

  // §6 : la sélection de variante est FACULTATIVE — une variante par défaut
  // (celle affichée) doit être automatiquement sélectionnée dès le chargement,
  // sans que le client n'ait à cliquer sur quoi que ce soit avant d'ajouter au panier.
  useEffect(() => {
    if (variants.length === 0) return;
    const preferred = variants.find((v) => v.in_stock) ?? variants[0];
    setSelectedColor(preferred.color);
    setSelectedSize(preferred.size);
  }, [variants]);

  // Résout la variante correspondant à une combinaison couleur/taille. Si la
  // combinaison exacte n'existe pas (ex : cette couleur n'a pas cette taille),
  // retombe sur la première variante compatible plutôt que de ne rien sélectionner :
  // le client n'est jamais bloqué en attente d'un second choix.
  const pickVariant = (color: string | null, size: string | null): PublicVariant | null => {
    if (!hasVariants) return null;
    return (
      variants.find((v) => (colors.length === 0 || v.color === color) && (sizes.length === 0 || v.size === size)) ??
      (color ? variants.find((v) => v.color === color) : null) ??
      (size ? variants.find((v) => v.size === size) : null) ??
      variants[0]
    );
  };

  const selectedVariant = pickVariant(selectedColor, selectedSize);

  // Choisir une couleur met à jour l'image immédiatement (§6) ; si la taille
  // actuellement sélectionnée n'existe pas pour cette couleur, elle est
  // réajustée automatiquement sur une taille disponible pour cette couleur.
  const handleSelectColor = (color: string) => {
    const variant = pickVariant(color, selectedSize);
    setSelectedColor(color);
    setSelectedSize(variant?.size ?? null);
  };
  const handleSelectSize = (size: string) => {
    const variant = pickVariant(selectedColor, size);
    setSelectedSize(size);
    setSelectedColor(variant?.color ?? selectedColor);
  };

  const displayImage = selectedVariant?.image_url
    || (selectedColor ? gallery.find((g) => g.color === selectedColor)?.image_url : null)
    || product.image_url;
  const outOfStock = hasVariants ? (selectedVariant ? !selectedVariant.in_stock : false) : product.stock <= 0;

  const handleAdd = () => {
    onAddToCart(product, selectedVariant, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <button 
        onClick={onBack} 
        className="group text-sm text-slate-500 dark:text-sand-400 hover:text-slate-700 dark:hover:text-sand-100 mb-6 flex items-center gap-2 transition-all hover:-translate-x-1"
      >
        <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" /> Retour au catalogue
      </button>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Image avec animations */}
        <div className="relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200/50 card border border-slate-200/50 dark:border-sand-700">
          {displayImage ? (
            <img 
              src={displayImage} 
              alt={product.name} 
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-20 h-20 text-slate-300" />
            </div>
          )}
          <div className="absolute top-4 left-4">
            <span className="px-3 py-1.5 rounded-xl bg-white/90 dark:bg-sand-800 backdrop-blur-sm text-slate-700 dark:text-sand-200 font-mono text-xs shadow-lg">
              {product.code}
            </span>
          </div>
          {outOfStock && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <span className="px-6 py-3 rounded-full bg-red-500 text-white font-bold shadow-lg shadow-red-500/25">Rupture de stock</span>
            </div>
          )}
        </div>

        {/* Détails */}
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-800 dark:text-sand-100 mb-3">
              {product.name}
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-600">
                {formatFCFA(product.sale_price)}
              </span>
              {outOfStock ? (
                <span className="px-4 py-1.5 rounded-full bg-red-100 text-red-600 dark:text-red-400 text-sm font-medium">
                  Rupture
                </span>
              ) : (
                <span className="px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-600 text-sm font-medium flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Disponible
                </span>
              )}
            </div>
          </div>

          {product.description && (
            <p className="text-slate-600 dark:text-sand-300 leading-relaxed bg-slate-50 dark:bg-sand-800 p-4 rounded-2xl border border-slate-200/50 dark:border-sand-700">
              {product.description}
            </p>
          )}

          {/* Sélecteurs de variante */}
          {colors.length > 0 && (
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-sand-200 mb-2">Couleur{selectedColor && <span className="text-slate-400 dark:text-sand-500 font-normal"> — {selectedColor}</span>}</div>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelectColor(c)}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${selectedColor === c ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 dark:border-sand-700 text-slate-600 dark:text-sand-300 hover:border-slate-300'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sizes.length > 0 && (
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-sand-200 mb-2">Taille{selectedSize && <span className="text-slate-400 dark:text-sand-500 font-normal"> — {selectedSize}</span>}</div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSelectSize(s)}
                    className={`w-12 h-12 rounded-xl border text-sm font-medium transition-colors ${selectedSize === s ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 dark:border-sand-700 text-slate-600 dark:text-sand-300 hover:border-slate-300'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantité et ajout au panier — la variante par défaut étant déjà
              sélectionnée automatiquement (§6), aucun blocage n'attend un choix
              manuel de couleur/taille avant de pouvoir commander. */}
          {!outOfStock && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <label htmlFor="product-qty" className="text-sm font-medium text-slate-600 dark:text-sand-300">Quantité</label>
                <input
                  id="product-qty"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={qty}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setQty(Number.isFinite(parsed) && parsed >= 1 ? parsed : 1);
                  }}
                  className="w-20 h-12 text-center font-bold text-lg text-slate-800 dark:text-sand-100 bg-slate-100 dark:bg-sand-700 rounded-2xl border border-slate-200 dark:border-sand-700 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <button 
                onClick={handleAdd} 
                className={`flex-1 btn-primary py-3.5 rounded-2xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                  added 
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700' 
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
                } text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/50 hover:scale-105`}
              >
                {added ? (
                  <><CheckCircle className="w-5 h-5" /> {t('store.add_to_cart')} ✓</>
                ) : (
                  <><ShoppingCart className="w-5 h-5" /> {t('store.add_to_cart')}</>
                )}
              </button>
            </div>
          )}

          {/* Informations */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-100">
              <Truck className="w-5 h-5 text-indigo-600" />
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-sand-200">Livraison</div>
                <div className="text-xs text-slate-500 dark:text-sand-400">Bamako</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-sand-200">Paiement</div>
                <div className="text-xs text-slate-500 dark:text-sand-400">À la livraison</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-100">
              <MessageCircle className="w-5 h-5 text-amber-600" />
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-sand-200">Assistant</div>
                <div className="text-xs text-slate-500 dark:text-sand-400">IA disponible</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Produits similaires — jusqu'à 40, grille de 4 par ligne sur écrans larges,
          adaptée automatiquement sur mobile (§13) */}
      {relatedProducts.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-bold text-slate-800 dark:text-sand-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" /> Produits similaires
            </h2>
            <button onClick={onSeeAllRelated} className="text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1 group shrink-0">
              Voir tout <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {relatedProducts.map((p) => <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ CART ============
// Champ de quantité en saisie libre pour une ligne du panier (§4 : plus de +/-).
// L'état local en texte permet de vider le champ pendant la frappe sans que
// la ligne soit retirée du panier avant que l'utilisateur ait fini de taper.
function CartQtyInput({ quantity, onChange }: { quantity: number; onChange: (newQty: number) => void }) {
  const [text, setText] = useState(String(quantity));

  useEffect(() => {
    setText(String(quantity));
  }, [quantity]);

  const commit = () => {
    const parsed = parseInt(text, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setText(String(quantity));
      return;
    }
    if (parsed !== quantity) onChange(parsed);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min="1"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      aria-label="Quantité"
      className="w-16 h-9 text-center text-sm font-medium rounded-xl bg-slate-100 dark:bg-sand-700 border border-transparent focus:border-amber-500 focus:outline-none"
    />
  );
}

function CartPage({ cart, total, onUpdateQty, onRemove, onCheckout, onContinue }: { 
  cart: CartItem[]; 
  total: number; 
  onUpdateQty: (id: string, variantId: string | null | undefined, newQty: number) => void; 
  onRemove: (id: string, variantId?: string | null) => void; 
  onCheckout: () => void; 
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  
  if (cart.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center animate-fade-in">
        <div className="w-24 h-24 mx-auto rounded-full bg-slate-100 dark:bg-sand-700 flex items-center justify-center mb-6">
          <ShoppingCart className="w-12 h-12 text-slate-300" />
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-800 dark:text-sand-100 mb-3">{t('store.cart_empty')}</h1>
        <p className="text-slate-500 dark:text-sand-400 mb-8">Découvrez notre catalogue et ajoutez des produits.</p>
        <button onClick={onContinue} className="btn-primary px-8 py-3.5 rounded-2xl">
          Voir le catalogue <ArrowRight className="w-4 h-4 inline" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <h1 className="font-display text-3xl font-bold text-slate-800 dark:text-sand-100 mb-8">Mon panier</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item) => (
            <div key={cartLineKey(item.product.id, item.variant?.id)} className="card p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm hover:shadow-md transition-all">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-100 dark:bg-sand-700 overflow-hidden shrink-0">
                {(item.variant?.image_url || item.product.image_url) ? (
                  <img src={item.variant?.image_url || item.product.image_url || ''} alt={item.product.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Package className="w-full h-full text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-[140px]">
                <span className="font-mono text-xs text-slate-400 dark:text-sand-500">{item.product.code}</span>
                <h3 className="font-medium text-slate-800 dark:text-sand-100 truncate">{item.product.name}</h3>
                {item.variant && (item.variant.color || item.variant.size) && (
                  <span className="text-xs text-slate-500 dark:text-sand-400">{[item.variant.color, item.variant.size].filter(Boolean).join(' / ')}</span>
                )}
                <div><span className="text-amber-600 font-bold">{formatFCFA(item.product.sale_price)}</span></div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto order-3 sm:order-none">
                <CartQtyInput
                  quantity={item.quantity}
                  onChange={(newQty) => onUpdateQty(item.product.id, item.variant?.id, newQty)}
                />
                <div className="text-right shrink-0">
                  <div className="font-bold text-slate-800 dark:text-sand-100">{formatFCFA(item.product.sale_price * item.quantity)}</div>
                </div>
                <button onClick={() => onRemove(item.product.id, item.variant?.id)} className="w-9 h-9 rounded-xl flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="card p-6 h-fit sticky top-20 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm">
          <h3 className="font-semibold text-slate-800 dark:text-sand-100 mb-6 text-lg">Récapitulatif</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-slate-600 dark:text-sand-300">
              <span>Sous-total</span>
              <span className="font-medium">{formatFCFA(total)}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-sand-300">
              <span>Livraison</span>
              <span className="text-slate-400 dark:text-sand-500">Calculée à l'étape suivante</span>
            </div>
          </div>
          <div className="border-t border-slate-200/50 dark:border-sand-700 pt-4 mt-4">
            <div className="flex justify-between font-bold text-slate-800 dark:text-sand-100 text-lg">
              <span>Total</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-600">{formatFCFA(total)}</span>
            </div>
          </div>
          <button 
            onClick={onCheckout} 
            className="btn-primary w-full mt-6 py-3.5 rounded-2xl font-medium flex items-center justify-center gap-2"
          >
            {t('store.checkout')} <ArrowRight className="w-4 h-4" />
          </button>
          <button 
            onClick={onContinue} 
            className="btn-ghost w-full mt-2 py-3 rounded-xl text-sm text-slate-500 dark:text-sand-400 hover:text-slate-700 dark:hover:text-sand-100 transition-colors"
          >
            Continuer mes achats
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ CHECKOUT ============
function CheckoutPage({ cart, total, onBack, onComplete }: { 
  cart: CartItem[]; 
  total: number; 
  onBack: () => void; 
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [locationShared, setLocationShared] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH_ON_DELIVERY' | 'ORANGE_MONEY_MANUAL'>('CASH_ON_DELIVERY');
  const [merchantNumber, setMerchantNumber] = useState('');
  const [codEnabled, setCodEnabled] = useState(true);
  const [omEnabled, setOmEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await getPublicSettings();
      setMerchantNumber(settings['payments.orange_money_merchant_number']);
      setCodEnabled(settings['payments.cash_on_delivery_enabled']);
      setOmEnabled(settings['payments.orange_money_manual_enabled']);
      if (!settings['payments.cash_on_delivery_enabled'] && settings['payments.orange_money_manual_enabled']) {
        setPaymentMethod('ORANGE_MONEY_MANUAL');
      }
    })();
  }, []);

  const shareLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void updateMyCustomerLocation(position.coords.latitude, position.coords.longitude)
          .then(() => setLocationShared(true))
          .catch(() => setLocationError('Connectez-vous à votre compte pour enregistrer votre position.'));
      },
      () => setLocationError('Position non partagée.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const deliveryFee = 1000;
  const grandTotal = total + deliveryFee;

  const handleSubmit = async () => {
    if (!name || !phone || !neighborhood) {
      setError('Veuillez remplir le nom, le téléphone et le quartier.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await createPublicCheckout({ 
        name, 
        phone, 
        neighborhood, 
        address, 
        paymentMethod, 
        items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity, variant_id: item.variant?.id ?? null })) 
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <button onClick={onBack} className="group text-sm text-slate-500 dark:text-sand-400 hover:text-slate-700 dark:hover:text-sand-100 mb-6 flex items-center gap-2 transition-all hover:-translate-x-1">
        <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" /> Retour au panier
      </button>
      
      <h1 className="font-display text-3xl font-bold text-slate-800 dark:text-sand-100 mb-8">{t('checkout.title')}</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Informations de livraison */}
          <div className="card p-6 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm">
            <h3 className="font-semibold text-slate-800 dark:text-sand-100 mb-5 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" /> Informations de livraison
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-sm font-medium text-slate-600 dark:text-sand-300 mb-1.5 block">{t('checkout.name')} *</label>
                <input 
                  className="input w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-sand-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all bg-white/50 dark:bg-sand-800 backdrop-blur-sm" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Ex: Aïssata Traoré" 
                />
              </div>
              <div>
                <label className="label text-sm font-medium text-slate-600 dark:text-sand-300 mb-1.5 block">{t('checkout.phone')} *</label>
                <input 
                  className="input w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-sand-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all bg-white/50 dark:bg-sand-800 backdrop-blur-sm" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  placeholder="+223 76 00 00 00" 
                />
              </div>
              <div>
                <label className="label text-sm font-medium text-slate-600 dark:text-sand-300 mb-1.5 block">{t('checkout.neighborhood')} *</label>
                <select 
                  className="input w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-sand-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all bg-white/50 dark:bg-sand-800 backdrop-blur-sm appearance-none" 
                  value={neighborhood} 
                  onChange={(e) => setNeighborhood(e.target.value)}
                >
                  <option value="">Sélectionner...</option>
                  {BAMAKO_NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-sm font-medium text-slate-600 dark:text-sand-300 mb-1.5 block">{t('checkout.address')}</label>
                <input 
                  className="input w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-sand-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all bg-white/50 dark:bg-sand-800 backdrop-blur-sm" 
                  value={address} 
                  onChange={(e) => setAddress(e.target.value)} 
                  placeholder="Rue, porte, repère..." 
                />
              </div>
            </div>
            
            <div className="mt-5">
              <button 
                type="button" 
                onClick={shareLocation} 
                className={`text-sm flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                  locationShared 
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700' 
                    : 'border-slate-200 dark:border-sand-700 bg-white/50 dark:bg-sand-800 text-slate-600 dark:text-sand-300 hover:bg-slate-50 dark:hover:bg-sand-700'
                } border`}
              >
                <MapPin className="w-4 h-4" /> 
                {locationShared ? t('checkout.location_shared') : t('checkout.share_location')}
              </button>
              {locationError && <p className="text-xs text-slate-400 dark:text-sand-500 mt-1.5">{locationError}</p>}
            </div>
          </div>

          {/* Paiement */}
          <div className="card p-6 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm">
            <h3 className="font-semibold text-slate-800 dark:text-sand-100 mb-5 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-500" /> {t('checkout.payment_method')}
            </h3>
            <div className="space-y-3">
              {codEnabled && (
              <label className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                paymentMethod === 'CASH_ON_DELIVERY' 
                  ? 'border-amber-400 bg-amber-50/80 shadow-lg shadow-amber-500/10' 
                  : 'border-slate-200 dark:border-sand-700 bg-white/50 dark:bg-sand-800 hover:bg-slate-50 dark:hover:bg-sand-700'
              }`}>
                <input 
                  type="radio" 
                  name="payment" 
                  checked={paymentMethod === 'CASH_ON_DELIVERY'} 
                  onChange={() => setPaymentMethod('CASH_ON_DELIVERY')} 
                  className="accent-amber-500 w-4 h-4" 
                />
                <div>
                  <div className="font-medium text-slate-800 dark:text-sand-100 text-sm">{t('checkout.cash_on_delivery')}</div>
                  <div className="text-xs text-slate-500 dark:text-sand-400">Payez en espèces à réception du colis</div>
                </div>
              </label>
              )}
              {omEnabled && (
              <>
              <label className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                paymentMethod === 'ORANGE_MONEY_MANUAL' 
                  ? 'border-amber-400 bg-amber-50/80 shadow-lg shadow-amber-500/10' 
                  : 'border-slate-200 dark:border-sand-700 bg-white/50 dark:bg-sand-800 hover:bg-slate-50 dark:hover:bg-sand-700'
              }`}>
                <input 
                  type="radio" 
                  name="payment" 
                  checked={paymentMethod === 'ORANGE_MONEY_MANUAL'} 
                  onChange={() => setPaymentMethod('ORANGE_MONEY_MANUAL')} 
                  className="accent-amber-500 w-4 h-4" 
                />
                <div>
                  <div className="font-medium text-slate-800 dark:text-sand-100 text-sm">{t('checkout.orange_money_manual')}</div>
                  <div className="text-xs text-slate-500 dark:text-sand-400">Envoyez le montant, communiquez la référence</div>
                </div>
              </label>
              {paymentMethod === 'ORANGE_MONEY_MANUAL' && (
                <div className="ml-1 p-4 rounded-2xl bg-orange-50 border border-orange-200 text-sm text-slate-700 dark:text-sand-200">
                  {merchantNumber ? (
                    <>Envoyez <span className="font-bold">{formatFCFA(total)}</span> au numéro Orange Money marchand : <span className="font-bold text-orange-700">{merchantNumber}</span>, puis confirmez votre commande. Un conseiller vérifiera le paiement.</>
                  ) : (
                    <>Le numéro Orange Money marchand n'est pas encore configuré — contactez le service client pour finaliser ce paiement.</>
                  )}
                </div>
              )}
              </>
              )}
              {!codEnabled && !omEnabled && (
                <p className="text-sm text-red-600 dark:text-red-400">Aucun mode de paiement n'est actuellement disponible. Merci de contacter le service client.</p>
              )}
            </div>
          </div>
        </div>

        {/* Résumé */}
        <div className="card p-6 h-fit sticky top-20 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm">
          <h3 className="font-semibold text-slate-800 dark:text-sand-100 mb-5 text-lg">Récapitulatif</h3>
          <div className="space-y-2 max-h-48 overflow-auto mb-4">
            {cart.map((item) => (
              <div key={item.product.id} className="flex justify-between text-sm text-slate-600 dark:text-sand-300">
                <span className="truncate pr-2">{item.product.name} ×{item.quantity}</span>
                <span className="shrink-0 font-medium">{formatFCFA(item.product.sale_price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200/50 dark:border-sand-700 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600 dark:text-sand-300">
              <span>Sous-total</span>
              <span>{formatFCFA(total)}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-sand-300">
              <span>Livraison</span>
              <span className="text-amber-600 font-medium">{formatFCFA(deliveryFee)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-800 dark:text-sand-100 text-lg pt-3 border-t border-slate-200/50 dark:border-sand-700">
              <span>Total</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-600">{formatFCFA(grandTotal)}</span>
            </div>
          </div>
          
          {error && (
            <div className="mt-4 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          
          <button 
            onClick={handleSubmit} 
            disabled={loading} 
            className="btn-primary w-full mt-6 py-3.5 rounded-2xl font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105"
          >
            {loading ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('common.loading')}</>
            ) : (
              <><CheckCircle className="w-5 h-5" /> {t('checkout.submit')}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ CONFIRMATION ============
function ConfirmationPage({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center animate-fade-in">
      <div className="relative">
        <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-500/30 animate-bounce-in">
          <CheckCircle className="w-14 h-14 text-white" />
        </div>
        <div className="absolute -top-4 -right-4 w-12 h-12 rounded-full bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/25 animate-float">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
      </div>
      
      <h1 className="font-display text-4xl font-bold text-slate-800 dark:text-sand-100 mt-6 mb-3">
        Commande confirmée ! 🎉
      </h1>
      <p className="text-slate-600 dark:text-sand-300 text-lg mb-2">Merci pour votre confiance.</p>
      <p className="text-slate-500 dark:text-sand-400 text-sm max-w-md mx-auto">
        Votre commande a bien été enregistrée. L'équipe RATELAFRICA vous contactera prochainement pour confirmer la livraison.
      </p>
      
      <div className="card p-6 mt-8 rounded-2xl border border-slate-200/50 dark:border-sand-700 bg-white/50 dark:bg-sand-800 backdrop-blur-sm max-w-md mx-auto">
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-sand-300">
            <Package className="w-5 h-5 text-amber-500" /> Commandé
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <div className="flex items-center gap-2 text-slate-600 dark:text-sand-300">
            <Clock className="w-5 h-5 text-amber-500" /> En préparation
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <div className="flex items-center gap-2 text-slate-400 dark:text-sand-500">
            <Truck className="w-5 h-5" /> Livraison
          </div>
        </div>
      </div>
      
      <button 
        onClick={onContinue} 
        className="btn-primary mt-8 px-10 py-3.5 rounded-2xl font-medium inline-flex items-center gap-2 transition-all duration-300 hover:scale-105"
      >
        <Home className="w-5 h-5" /> Retour à l'accueil
      </button>
    </div>
  );
}