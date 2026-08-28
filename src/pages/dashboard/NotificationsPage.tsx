import { useState, useEffect } from 'react';
import { Bell, Check, Trash2, BellOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm';
import type { Notification } from '@/lib/types';
import { timeAgo } from '@/lib/format';

export default function NotificationsPage() {
  const { confirmAction } = useConfirm();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    setNotifications((data as Notification[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    load();
  };

  const deleteNotif = (n: Notification) => {
    confirmAction({
      title: 'Supprimer cette notification ?',
      message: 'Cette action est irréversible.',
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Notification supprimée.',
      onConfirm: async () => {
        const { error } = await supabase.from('notifications').delete().eq('id', n.id);
        if (error) throw new Error('Impossible de supprimer cette notification.');
        await load();
      },
    });
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('read', false);
    load();
  };

  const unread = notifications.filter((n) => !n.read).length;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-xl font-bold text-sand-900">Relances & Notifications</h2><p className="text-sm text-sand-500">{unread} non lue{unread > 1 ? 's' : ''} sur {notifications.length}</p></div>
        {unread > 0 && <button onClick={markAllRead} className="btn-secondary text-sm"><Check className="w-4 h-4" /> Tout marquer lu</button>}
      </div>

      {notifications.length === 0 ? (
        <div className="card p-12 text-center"><BellOff className="w-12 h-12 text-sand-300 mx-auto mb-3" /><p className="text-sand-500">Aucune notification</p></div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`card p-4 flex items-start gap-3 ${!n.read ? 'border-ocre-200 bg-ocre-50/30' : ''}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${!n.read ? 'bg-ocre-100 text-ocre-700' : 'bg-sand-100 text-sand-400'}`}>
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sand-900 text-sm">{n.title}</span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-ocre-500" />}
                </div>
                <p className="text-sm text-sand-600">{n.message}</p>
                <span className="text-xs text-sand-400">{timeAgo(n.created_at)}</span>
              </div>
              <div className="flex gap-1 shrink-0">
                {!n.read && <button onClick={() => markRead(n.id)} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center text-sand-600" title="Marquer lu"><Check className="w-4 h-4" /></button>}
                <button onClick={() => deleteNotif(n)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
