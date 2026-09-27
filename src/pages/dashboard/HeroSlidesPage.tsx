import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, X, ImagePlus, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { listHeroSlides, createHeroSlide, updateHeroSlide, deleteHeroSlide, reorderHeroSlides } from '@/lib/heroSlides';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { usePermissions } from '@/lib/permissions';
import type { HeroSlide } from '@/lib/types';

async function uploadSlideImage(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `hero/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('product-images').upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw new Error(friendlyError(error, "Échec de l'upload de l'image."));
  return supabase.storage.from('product-images').getPublicUrl(filePath).data.publicUrl;
}

export default function HeroSlidesPage() {
  const toast = useToast();
  const { confirmAction } = useConfirm();
  const { has } = usePermissions();
  const canManage = has('settings.manage');
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editSlide, setEditSlide] = useState<HeroSlide | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setSlides(await listHeroSlides());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleActive = async (slide: HeroSlide) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateHeroSlide(slide.id, { is_active: !slide.is_active });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de modifier ce slide.');
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (busy) return;
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const a = slides[index];
    const b = slides[target];
    setBusy(true);
    try {
      await reorderHeroSlides([{ id: a.id, position: b.position }, { id: b.id, position: a.position }]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de réorganiser les slides.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (slide: HeroSlide) => {
    confirmAction({
      title: 'Supprimer ce slide ?',
      message: `« ${slide.title} » sera définitivement retiré du carrousel.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Slide supprimé.',
      onConfirm: async () => {
        await deleteHeroSlide(slide.id);
        await load();
      },
    });
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">Carrousel principal (hero)</h2>
          <p className="text-sm text-sand-500 dark:text-sand-400">Les grandes images de présentation en haut de la boutique</p>
        </div>
        <button onClick={() => { setEditSlide(null); setShowForm(true); }} disabled={!canManage} className="btn-primary disabled:opacity-50"><Plus className="w-4 h-4" /> Ajouter un slide</button>
      </div>

      {loadError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-300"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {loadError}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : slides.length === 0 ? (
        <div className="card p-12 text-center"><ImageIcon className="w-12 h-12 text-sand-300 mx-auto mb-3" /><p className="text-sand-500 dark:text-sand-400">Aucun slide — la boutique affichera un hero par défaut.</p></div>
      ) : (
        <div className="space-y-2">
          {slides.map((s, index) => (
            <div key={s.id} className="card p-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
              <img src={s.image_url} alt="" className="w-16 h-12 sm:w-20 sm:h-14 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-[140px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sand-900 dark:text-sand-100 truncate">{s.title}</span>
                  <span className={`badge ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-sand-100 text-sand-500 dark:bg-sand-700 dark:text-sand-400'}`}>{s.is_active ? 'Actif' : 'Inactif'}</span>
                </div>
                <div className="text-xs text-sand-400 truncate">{s.description || 'Pas de description'} — {s.duration_seconds}s</div>
              </div>
              <div className="flex items-center flex-wrap gap-1 shrink-0 w-full sm:w-auto order-3 sm:order-none justify-end">
                <button onClick={() => void move(index, -1)} disabled={index === 0 || busy || !canManage} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center text-sand-500 dark:text-sand-300 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => void move(index, 1)} disabled={index === slides.length - 1 || busy || !canManage} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center text-sand-500 dark:text-sand-300 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                {canManage && <button onClick={() => void toggleActive(s)} disabled={busy} className="text-xs px-2.5 py-1.5 rounded-lg bg-sand-100 dark:bg-sand-700 text-sand-700 dark:text-sand-200 hover:bg-sand-200 disabled:opacity-50">{s.is_active ? 'Désactiver' : 'Activer'}</button>}
                {canManage && <button onClick={() => { setEditSlide(s); setShowForm(true); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-sand-100 dark:bg-sand-700 text-sand-700 dark:text-sand-200 hover:bg-sand-200">Modifier</button>}
                {canManage && <button onClick={() => remove(s)} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400"><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <SlideForm
          slide={editSlide}
          nextPosition={slides.length === 0 ? 0 : Math.max(...slides.map((s) => s.position)) + 1}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }}
        />
      )}
    </div>
  );
}

function SlideForm({ slide, nextPosition, onClose, onSaved }: { slide: HeroSlide | null; nextPosition: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(slide?.title ?? '');
  const [description, setDescription] = useState(slide?.description ?? '');
  const [buttonText, setButtonText] = useState(slide?.button_text ?? '');
  const [buttonLink, setButtonLink] = useState(slide?.button_link ?? '');
  const [duration, setDuration] = useState(String(slide?.duration_seconds ?? 6));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState(slide?.image_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!title.trim()) { setError('Le titre est requis.'); return; }
    if (!imageFile && !imagePreview) { setError('Une image est requise.'); return; }
    setSaving(true);
    setError(null);
    try {
      const imageUrl = imageFile ? await uploadSlideImage(imageFile) : imagePreview;
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        button_text: buttonText.trim() || null,
        button_link: buttonLink.trim() || null,
        duration_seconds: Math.min(30, Math.max(2, parseInt(duration, 10) || 6)),
        image_url: imageUrl,
        is_active: slide?.is_active ?? true,
        position: slide?.position ?? nextPosition,
      };
      if (slide) await updateHeroSlide(slide.id, payload);
      else await createHeroSlide(payload);
      toast.success('Slide enregistré.');
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enregistrement impossible.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700">
          <h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-100">{slide ? 'Modifier' : 'Nouveau'} slide</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Image</label>
            <div className="flex items-center gap-4">
              {imagePreview ? <img src={imagePreview} alt="" className="w-24 h-16 rounded-lg object-cover" /> : <div className="w-24 h-16 rounded-lg bg-sand-100 dark:bg-sand-700 flex items-center justify-center text-sand-300"><ImagePlus className="w-5 h-5" /></div>}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); } }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg border border-sand-200 dark:border-sand-600 text-sm text-sand-600 dark:text-sand-300 hover:bg-sand-50 dark:hover:bg-sand-700">Choisir une image</button>
            </div>
          </div>
          <div><label className="label">Titre</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Nouvelle collection" /></div>
          <div><label className="label">Description courte</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Découvrez nos derniers arrivages" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Texte du bouton</label><input className="input" value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder="Ex: Découvrir" /></div>
            <div><label className="label">Durée (secondes)</label><input type="number" min="2" max="30" className="input" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
          </div>
          <div><label className="label">Catégorie liée (optionnel)</label><input className="input" value={buttonLink ?? ''} onChange={(e) => setButtonLink(e.target.value)} placeholder="ID de catégorie à ouvrir au clic" /></div>
          {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-sand-200 dark:border-sand-700">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button>
        </div>
      </div>
    </div>
  );
}
