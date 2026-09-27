import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { HeroSlide } from '@/lib/types';

/** Boutique (public) : slides actifs uniquement, dans l'ordre. */
export async function getPublicHeroSlides(): Promise<HeroSlide[]> {
  const { data, error } = await supabase.from('hero_slides').select('*').eq('is_active', true).order('position');
  if (error) return [];
  return (data as HeroSlide[]) ?? [];
}

/** Dashboard : tous les slides, actifs ou non. */
export async function listHeroSlides(): Promise<HeroSlide[]> {
  const { data, error } = await supabase.from('hero_slides').select('*').order('position');
  if (error) throw new Error(friendlyError(error, 'Impossible de charger les slides.'));
  return (data as HeroSlide[]) ?? [];
}

export async function createHeroSlide(input: Omit<HeroSlide, 'id' | 'created_at' | 'updated_at'>): Promise<HeroSlide> {
  const { data, error } = await supabase.from('hero_slides').insert(input).select('*').single();
  if (error) throw new Error(friendlyError(error, 'Impossible de créer ce slide.'));
  return data as HeroSlide;
}

export async function updateHeroSlide(id: string, input: Partial<Omit<HeroSlide, 'id' | 'created_at' | 'updated_at'>>): Promise<HeroSlide> {
  const { data, error } = await supabase.from('hero_slides').update(input).eq('id', id).select('*').single();
  if (error) throw new Error(friendlyError(error, 'Impossible de modifier ce slide.'));
  return data as HeroSlide;
}

export async function deleteHeroSlide(id: string): Promise<void> {
  const { error } = await supabase.from('hero_slides').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer ce slide.'));
}

export async function reorderHeroSlides(updates: { id: string; position: number }[]): Promise<void> {
  for (const u of updates) {
    const { error } = await supabase.from('hero_slides').update({ position: u.position }).eq('id', u.id);
    if (error) throw new Error(friendlyError(error, 'Impossible de réorganiser les slides.'));
  }
}
