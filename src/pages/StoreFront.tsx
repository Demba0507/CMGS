import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Search, Menu, X, MessageCircle, MapPin, Phone, Trash2, Plus, Minus, ChevronRight, CheckCircle, Package, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getPublicProducts } from '@/lib/catalog';
import { createPublicCheckout } from '@/lib/checkout';
import { updateMyCustomerLocation } from '@/lib/myAccount';
import type { Product, Category } from '@/lib/types';
import { formatFCFA } from '@/lib/format';
import { BAMAKO_NEIGHBORHOODS } from '@/lib/constants';
import Chatbot from '@/components/Chatbot';
import { useTranslation } from '@/lib/i18n';

type StorePage = 'home' | 'catalog' | 'product' | 'cart' | 'checkout' | 'order-confirmation';

interface CartItem {
  product: Product;
  quantity: number;
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

  const addToCart = (product: Product, qty: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) => (i.product.id === product.id ? { ...i, quantity: Math.min(i.quantity + qty, product.stock_verified) } : i));
      }
      return [...prev, { product, quantity: Math.min(qty, product.stock_verified) }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product.id !== productId) return i;
          const newQty = i.quantity + delta;
          if (newQty <= 0) return null;
          return { ...i, quantity: Math.min(newQty, i.product.stock_verified) };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setPage('product');
  };

  return (
    <div className="min-h-screen bg-sand-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-sand-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <button onClick={() => { setPage('home'); setSelectedCategory(null); }} className="flex items-center gap-2 shrink-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-ocre-500 to-ocre-700 flex items-center justify-center text-white font-bold text-sm font-display">C</div>
              <span className="font-display font-bold text-lg text-sand-900 hidden sm:block">CMGS<span className="text-ocre-600"> Commerce</span></span>
            </button>

            <div className="flex-1 max-w-md hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
                <input
                  type="text"
                  placeholder={t('store.search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage('catalog'); }}
                  className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-sand-300 bg-sand-50 focus:outline-none focus:ring-2 focus:ring-ocre-400/40 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setChatOpen(true)} className="relative w-10 h-10 rounded-lg flex items-center justify-center text-sand-600 hover:bg-sand-100 transition-colors" title="Assistant CMGS">
                <MessageCircle className="w-5 h-5" />
              </button>
              <button onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')} className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-sand-600 hover:bg-sand-100 transition-colors" title="FR / EN">
                {language.toUpperCase()}
              </button>
              <button onClick={() => setPage('cart')} className="relative w-10 h-10 rounded-lg flex items-center justify-center text-sand-700 hover:bg-sand-100 transition-colors" title={t('store.cart')}>
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-ocre-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{cartCount}</span>
                )}
              </button>
              <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center text-sand-600 hover:bg-sand-100">
                {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenu && (
          <div className="md:hidden border-t border-sand-200 p-4 bg-white animate-slide-up">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
              <input type="text" placeholder={t('store.search_placeholder')} value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage('catalog'); setMobileMenu(false); }} className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-sand-300 bg-sand-50" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setSelectedCategory(null); setPage('catalog'); setMobileMenu(false); }} className="px-3 py-1.5 rounded-lg bg-sand-100 text-sm text-sand-700">Tout</button>
              {categories.map((c) => (
                <button key={c.id} onClick={() => { setSelectedCategory(c.id); setPage('catalog'); setMobileMenu(false); }} className="px-3 py-1.5 rounded-lg bg-sand-100 text-sm text-sand-700">{c.name}</button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {page === 'home' && <HomePage products={products} categories={categories} onOpenProduct={openProduct} onSeeAll={() => setPage('catalog')} onSelectCategory={(id) => { setSelectedCategory(id); setPage('catalog'); }} />}
        {page === 'catalog' && <CatalogPage products={filtered} categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} onOpenProduct={openProduct} />}
        {page === 'product' && selectedProduct && <ProductPage product={selectedProduct} onAddToCart={addToCart} onBack={() => setPage('catalog')} relatedProducts={products.filter((p) => p.id !== selectedProduct.id && p.category_id === selectedProduct.category_id).slice(0, 4)} onOpenProduct={openProduct} />}
        {page === 'cart' && <CartPage cart={cart} total={cartTotal} onUpdateQty={updateQty} onRemove={removeFromCart} onCheckout={() => setPage('checkout')} onContinue={() => setPage('catalog')} />}
        {page === 'checkout' && <CheckoutPage cart={cart} total={cartTotal} onBack={() => setPage('cart')} onComplete={() => { setCart([]); setPage('order-confirmation'); }} />}
        {page === 'order-confirmation' && <ConfirmationPage onContinue={() => setPage('home')} />}
      </main>

      {/* Footer */}
      <footer className="bg-sand-900 text-sand-300 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-ocre-600 flex items-center justify-center text-white font-bold text-sm font-display">C</div>
                <span className="font-display font-bold text-lg text-white">CMGS Commerce</span>
              </div>
              <p className="text-sm text-sand-400">Votre marketplace de confiance à Bamako. Produits authentiques, livraison rapide, paiement à la livraison.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Catégories</h4>
              <ul className="space-y-2 text-sm">
                {categories.slice(0, 5).map((c) => (
                  <li key={c.id}><button onClick={() => { setSelectedCategory(c.id); setPage('catalog'); }} className="hover:text-ocre-400 transition-colors">{c.name}</button></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Contact</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-ocre-400" /> +223 76 00 00 00</li>
                <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-ocre-400" /> Bamako, Mali</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Paiement</h4>
              <p className="text-sm text-sand-400">Paiement à la livraison ou Orange Money. Livraison dans tous les quartiers de Bamako.</p>
            </div>
          </div>
          <div className="border-t border-sand-800 mt-8 pt-6 text-center text-sm text-sand-500">
            © 2025 CMGS Commerce AI — Bamako, Mali
          </div>
        </div>
      </footer>

      {chatOpen && <Chatbot onClose={() => setChatOpen(false)} onAddToCart={addToCart} />}
    </div>
  );
}

// ============ HOME ============
function HomePage({ products, categories, onOpenProduct, onSeeAll, onSelectCategory }: { products: Product[]; categories: Category[]; onOpenProduct: (p: Product) => void; onSeeAll: () => void; onSelectCategory: (id: string) => void; }) {
  const featured = products.slice(0, 8);
  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sand-900 via-sand-800 to-indigo-950 text-white">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(217,142,31,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(99,102,241,0.3) 0%, transparent 50%)' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ocre-500/20 border border-ocre-400/30 text-ocre-300 text-sm font-medium mb-6">
              <MapPin className="w-4 h-4" /> Bamako, Mali
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Le commerce de Bamako,<br /><span className="text-ocre-400">simplifié.</span>
            </h1>
            <p className="text-lg text-sand-300 mb-8 max-w-xl">Découvrez des produits authentiques, commandez en quelques clics, payez à la livraison. Votre assistant IA vous accompagne à chaque étape.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={onSeeAll} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-ocre-600 hover:bg-ocre-700 transition-colors font-medium text-white">
                Voir le catalogue <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => onSelectCategory(categories[0]?.id ?? '')} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition-colors font-medium">
                Parcourir
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-bold text-sand-900">Catégories</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {categories.map((c) => {
            const count = products.filter((p) => p.category_id === c.id).length;
            return (
              <button key={c.id} onClick={() => onSelectCategory(c.id)} className="card p-5 text-center hover:shadow-card-hover hover:border-ocre-300 transition-all group">
                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-ocre-100 to-ocre-200 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Package className="w-6 h-6 text-ocre-700" />
                </div>
                <div className="font-medium text-sand-900 text-sm">{c.name}</div>
                <div className="text-xs text-sand-500 mt-1">{count} produit{count > 1 ? 's' : ''}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-bold text-sand-900">Produits populaires</h2>
          <button onClick={onSeeAll} className="text-sm font-medium text-ocre-600 hover:text-ocre-700 flex items-center gap-1">Voir tout <ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {featured.map((p) => <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p)} />)}
        </div>
      </section>

      {/* Features strip */}
      <section className="bg-white border-y border-sand-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0"><CheckCircle className="w-6 h-6 text-green-600" /></div>
              <div><div className="font-semibold text-sand-900">Paiement à la livraison</div><div className="text-sm text-sand-500">Payez seulement à réception</div></div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0"><Truck className="w-6 h-6 text-indigo-600" /></div>
              <div><div className="font-semibold text-sand-900">Livraison Bamako</div><div className="text-sm text-sand-500">Tous les quartiers couverts</div></div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-ocre-100 flex items-center justify-center shrink-0"><MessageCircle className="w-6 h-6 text-ocre-600" /></div>
              <div><div className="font-semibold text-sand-900">Assistant IA</div><div className="text-sm text-sand-500">Posez vos questions 24/7</div></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const outOfStock = product.stock_verified <= 0;
  return (
    <div onClick={onClick} className="card overflow-hidden cursor-pointer hover:shadow-card-hover transition-all group">
      <div className="relative aspect-square bg-sand-100 overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className="w-12 h-12 text-sand-300" /></div>
        )}
        {outOfStock && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="badge bg-red-500 text-white">Rupture</span></div>}
        <div className="absolute top-2 left-2"><span className="badge bg-white/90 text-sand-700 font-mono">{product.code}</span></div>
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sand-900 text-sm line-clamp-2 mb-1">{product.name}</h3>
        <div className="flex items-center justify-between">
          <span className="font-bold text-ocre-700 text-sm">{formatFCFA(product.sale_price)}</span>
          {!outOfStock && <span className="text-xs text-green-600 font-medium">Disponible</span>}
        </div>
      </div>
    </div>
  );
}

// ============ CATALOG ============
function CatalogPage({ products, categories, selectedCategory, onSelectCategory, onOpenProduct }: { products: Product[]; categories: Category[]; selectedCategory: string | null; onSelectCategory: (id: string | null) => void; onOpenProduct: (p: Product) => void }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-sand-900 mb-2">Catalogue</h1>
      <p className="text-sand-500 text-sm mb-6">{products.length} produit{products.length > 1 ? 's' : ''} disponible{products.length > 1 ? 's' : ''}</p>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-56 shrink-0">
          <div className="card p-4 lg:sticky lg:top-20">
            <h3 className="font-semibold text-sand-900 text-sm mb-3">Catégories</h3>
            <div className="flex flex-wrap lg:flex-col gap-1.5">
              <button onClick={() => onSelectCategory(null)} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors w-full ${!selectedCategory ? 'bg-ocre-100 text-ocre-700 font-medium' : 'text-sand-600 hover:bg-sand-100'}`}>Toutes</button>
              {categories.map((c) => (
                <button key={c.id} onClick={() => onSelectCategory(c.id)} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors w-full ${selectedCategory === c.id ? 'bg-ocre-100 text-ocre-700 font-medium' : 'text-sand-600 hover:bg-sand-100'}`}>{c.name}</button>
              ))}
            </div>
          </div>
        </aside>
        <div className="flex-1">
          {products.length === 0 ? (
            <div className="card p-12 text-center">
              <Package className="w-12 h-12 text-sand-300 mx-auto mb-3" />
              <p className="text-sand-500">Aucun produit trouvé. Essayez une autre recherche.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((p) => <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PRODUCT DETAIL ============
function ProductPage({ product, onAddToCart, onBack, relatedProducts, onOpenProduct }: { product: Product; onAddToCart: (p: Product, qty: number) => void; onBack: () => void; relatedProducts: Product[]; onOpenProduct: (p: Product) => void }) {
  const { t } = useTranslation();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const outOfStock = product.stock_verified <= 0;

  const handleAdd = () => {
    onAddToCart(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <button onClick={onBack} className="text-sm text-sand-500 hover:text-sand-700 mb-4 flex items-center gap-1">← Retour au catalogue</button>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="relative aspect-square rounded-xl overflow-hidden bg-sand-100 card">
          {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-16 h-16 text-sand-300" /></div>}
          <div className="absolute top-3 left-3"><span className="badge bg-white/90 text-sand-700 font-mono">{product.code}</span></div>
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-sand-900 mb-3">{product.name}</h1>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold text-ocre-700">{formatFCFA(product.sale_price)}</span>
            {outOfStock ? <span className="badge bg-red-100 text-red-700">Rupture de stock</span> : <span className="badge bg-green-100 text-green-700">Disponible</span>}
          </div>
          {product.description && <p className="text-sand-600 leading-relaxed mb-6">{product.description}</p>}

          {!outOfStock && (
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center border border-sand-300 rounded-lg">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-10 h-10 flex items-center justify-center text-sand-600 hover:bg-sand-100 rounded-l-lg"><Minus className="w-4 h-4" /></button>
                <span className="w-12 text-center font-medium">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(product.stock_verified, q + 1))} className="w-10 h-10 flex items-center justify-center text-sand-600 hover:bg-sand-100 rounded-r-lg"><Plus className="w-4 h-4" /></button>
              </div>
              <button onClick={handleAdd} className={`btn-primary flex-1 ${added ? 'bg-green-600 hover:bg-green-600' : ''}`}>
                {added ? (<><CheckCircle className="w-4 h-4" /> {t('store.add_to_cart')} ✓</>) : (<><ShoppingCart className="w-4 h-4" /> {t('store.add_to_cart')}</>)}
              </button>
            </div>
          )}

          <div className="card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-sand-600"><Truck className="w-4 h-4 text-indigo-600" /> Livraison dans tout Bamako</div>
            <div className="flex items-center gap-2 text-sm text-sand-600"><CheckCircle className="w-4 h-4 text-green-600" /> Paiement à la livraison disponible</div>
            <div className="flex items-center gap-2 text-sm text-sand-600"><MessageCircle className="w-4 h-4 text-ocre-600" /> Posez vos questions à notre assistant IA</div>
          </div>
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-xl font-bold text-sand-900 mb-4">Produits similaires</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {relatedProducts.map((p) => <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ CART ============
function CartPage({ cart, total, onUpdateQty, onRemove, onCheckout, onContinue }: { cart: CartItem[]; total: number; onUpdateQty: (id: string, delta: number) => void; onRemove: (id: string) => void; onCheckout: () => void; onContinue: () => void }) {
  const { t } = useTranslation();
  if (cart.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center animate-fade-in">
        <ShoppingCart className="w-16 h-16 text-sand-300 mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold text-sand-900 mb-2">{t('store.cart_empty')}</h1>
        <p className="text-sand-500 mb-6">Découvrez notre catalogue et ajoutez des produits.</p>
        <button onClick={onContinue} className="btn-primary">Voir le catalogue</button>
      </div>
    );
  }
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-sand-900 mb-6">Mon panier</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {cart.map((item) => (
            <div key={item.product.id} className="card p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-sand-100 overflow-hidden shrink-0">
                {item.product.image_url ? <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" /> : <Package className="w-full h-full text-sand-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1"><span className="font-mono text-xs text-sand-400">{item.product.code}</span></div>
                <h3 className="font-medium text-sand-900 text-sm truncate">{item.product.name}</h3>
                <span className="text-ocre-700 font-bold text-sm">{formatFCFA(item.product.sale_price)}</span>
              </div>
              <div className="flex items-center border border-sand-300 rounded-lg">
                <button onClick={() => onUpdateQty(item.product.id, -1)} className="w-8 h-8 flex items-center justify-center text-sand-600 hover:bg-sand-100 rounded-l-lg"><Minus className="w-3 h-3" /></button>
                <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                <button onClick={() => onUpdateQty(item.product.id, 1)} className="w-8 h-8 flex items-center justify-center text-sand-600 hover:bg-sand-100 rounded-r-lg"><Plus className="w-3 h-3" /></button>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-sand-900 text-sm">{formatFCFA(item.product.sale_price * item.quantity)}</div>
                <button onClick={() => onRemove(item.product.id)} className="text-red-500 hover:text-red-700 mt-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="card p-5 h-fit sticky top-20">
          <h3 className="font-semibold text-sand-900 mb-4">Récapitulatif</h3>
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between text-sand-600"><span>Sous-total</span><span>{formatFCFA(total)}</span></div>
            <div className="flex justify-between text-sand-600"><span>Livraison</span><span>Calculée à l'étape suivante</span></div>
          </div>
          <div className="border-t border-sand-200 pt-3 mb-4">
            <div className="flex justify-between font-bold text-sand-900"><span>Total</span><span>{formatFCFA(total)}</span></div>
          </div>
          <button onClick={onCheckout} className="btn-primary w-full mb-2">{t('store.checkout')}</button>
          <button onClick={onContinue} className="btn-ghost w-full">Continuer mes achats</button>
        </div>
      </div>
    </div>
  );
}

// ============ CHECKOUT ============
function CheckoutPage({ cart, total, onBack, onComplete }: { cart: CartItem[]; total: number; onBack: () => void; onComplete: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [locationShared, setLocationShared] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH_ON_DELIVERY' | 'ORANGE_MONEY_MANUAL'>('CASH_ON_DELIVERY');
  const [loading, setLoading] = useState(false);

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
  const [error, setError] = useState<string | null>(null);

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
      await createPublicCheckout({ name, phone, neighborhood, address, paymentMethod, items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })) });

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <button onClick={onBack} className="text-sm text-sand-500 hover:text-sand-700 mb-4 flex items-center gap-1">← Retour au panier</button>
      <h1 className="font-display text-2xl font-bold text-sand-900 mb-6">{t('checkout.title')}</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <h3 className="font-semibold text-sand-900 mb-4">Informations de livraison</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">{t('checkout.name')} *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Aïssata Traoré" /></div>
              <div><label className="label">{t('checkout.phone')} *</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+223 ..." /></div>
              <div>
                <label className="label">{t('checkout.neighborhood')} *</label>
                <select className="input" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}>
                  <option value="">Sélectionner...</option>
                  {BAMAKO_NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('checkout.address')}</label>
                <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue, porte, repère..." />
              </div>
            </div>
            <div className="mt-4">
              <button type="button" onClick={shareLocation} className={`text-sm flex items-center gap-2 px-3 py-2 rounded-lg border ${locationShared ? 'border-green-300 bg-green-50 text-green-700' : 'border-sand-300 text-sand-600 hover:bg-sand-50'}`}>
                <MapPin className="w-4 h-4" /> {locationShared ? t('checkout.location_shared') : t('checkout.share_location')}
              </button>
              {locationError && <p className="text-xs text-sand-400 mt-1">{locationError}</p>}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-sand-900 mb-4">{t('checkout.payment_method')}</h3>
            <div className="space-y-3">
              <label className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${paymentMethod === 'CASH_ON_DELIVERY' ? 'border-ocre-400 bg-ocre-50' : 'border-sand-300 hover:bg-sand-50'}`}>
                <input type="radio" name="payment" checked={paymentMethod === 'CASH_ON_DELIVERY'} onChange={() => setPaymentMethod('CASH_ON_DELIVERY')} className="accent-ocre-600" />
                <div><div className="font-medium text-sand-900 text-sm">{t('checkout.cash_on_delivery')}</div><div className="text-xs text-sand-500">Payez en espèces à réception du colis</div></div>
              </label>
              <label className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${paymentMethod === 'ORANGE_MONEY_MANUAL' ? 'border-ocre-400 bg-ocre-50' : 'border-sand-300 hover:bg-sand-50'}`}>
                <input type="radio" name="payment" checked={paymentMethod === 'ORANGE_MONEY_MANUAL'} onChange={() => setPaymentMethod('ORANGE_MONEY_MANUAL')} className="accent-ocre-600" />
                <div><div className="font-medium text-sand-900 text-sm">{t('checkout.orange_money_manual')}</div><div className="text-xs text-sand-500">Envoyez le montant, communiquez la référence</div></div>
              </label>
            </div>
          </div>
        </div>

        <div className="card p-5 h-fit sticky top-20">
          <h3 className="font-semibold text-sand-900 mb-4">Récapitulatif</h3>
          <div className="space-y-2 mb-4">
            {cart.map((item) => (
              <div key={item.product.id} className="flex justify-between text-sm text-sand-600">
                <span className="truncate pr-2">{item.product.name} ×{item.quantity}</span>
                <span className="shrink-0">{formatFCFA(item.product.sale_price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-sand-200 pt-3 space-y-2 text-sm">
            <div className="flex justify-between text-sand-600"><span>Sous-total</span><span>{formatFCFA(total)}</span></div>
            <div className="flex justify-between text-sand-600"><span>Livraison</span><span>{formatFCFA(deliveryFee)}</span></div>
            <div className="flex justify-between font-bold text-sand-900 text-base pt-2 border-t border-sand-200"><span>Total</span><span>{formatFCFA(grandTotal)}</span></div>
          </div>
          {error && <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
          <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full mt-4">{loading ? t('common.loading') : t('checkout.submit')}</button>
        </div>
      </div>
    </div>
  );
}

// ============ CONFIRMATION ============
function ConfirmationPage({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center animate-fade-in">
      <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-6">
        <CheckCircle className="w-12 h-12 text-green-600" />
      </div>
      <h1 className="font-display text-3xl font-bold text-sand-900 mb-3">Commande confirmée !</h1>
      <p className="text-sand-600 mb-2">Merci pour votre confiance. Votre commande a bien été enregistrée.</p>
      <p className="text-sand-500 text-sm mb-8">L'équipe CMGS vous contactera prochainement pour confirmer la livraison. Vous pouvez suivre le statut de votre commande dans le tableau de bord.</p>
      <button onClick={onContinue} className="btn-primary">Retour à l'accueil</button>
    </div>
  );
}
