import { useState, useEffect, useCallback } from 'react';
import { UserPlus, X, ShieldCheck, Power, KeyRound, Mail, AlertCircle, Clock, Search, Trash2 } from 'lucide-react';
import {
  listEmployees, listRoles, listPermissions, listPendingInvitations,
  inviteEmployee, revokeInvitation, setEmployeeRole, setEmployeeActive,
  setPermissionOverride, removePermissionOverride, resetEmployeePassword, deleteEmployeeAccount,
} from '@/lib/employees';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { usePermissions } from '@/lib/permissions';
import type { EmployeeWithRole, Role, Permission, EmployeeInvitation } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import ExportButtons from '@/components/ExportButtons';
import type { ExportColumn } from '@/lib/export';

function employeeExportColumns(roleName: (code: string | null) => string): ExportColumn<EmployeeWithRole>[] {
  return [
    { label: 'Nom', value: (e) => e.full_name ?? '—' },
    { label: 'E-mail', value: (e) => e.email },
    { label: 'Rôle', value: (e) => roleName(e.role_code) },
    { label: 'Statut', value: (e) => (e.is_active ? 'Actif' : 'Désactivé') },
    { label: 'Ajouté le', value: (e) => timeAgo(e.created_at) },
  ];
}

export default function EmployeesPage() {
  const { confirmAction } = useConfirm();
  const { has } = usePermissions();
  const canCreate = has('employees.create');
  const [employees, setEmployees] = useState<EmployeeWithRole[]>([]);
  const [invitations, setInvitations] = useState<EmployeeInvitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EmployeeWithRole | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [e, inv, r, p] = await Promise.all([listEmployees(), listPendingInvitations(), listRoles(), listPermissions()]);
      setEmployees(e);
      setInvitations(inv);
      setRoles(r);
      setPermissions(p);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (loadError) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="card p-5 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
        </div>
      </div>
    );
  }

  const roleName = (code: string | null) => roles.find((r) => r.code === code)?.name ?? code ?? '—';

  const filteredEmployees = employees.filter((emp) => {
    if (search) {
      const haystack = `${emp.full_name ?? ''} ${emp.email}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    if (filterRole && emp.role_code !== filterRole) return false;
    if (filterActive === 'active' && !emp.is_active) return false;
    if (filterActive === 'inactive' && emp.is_active) return false;
    return true;
  });

  const handleRevoke = (email: string) => {
    confirmAction({
      title: "Révoquer cette invitation ?",
      message: `L'invitation envoyée à ${email} ne pourra plus être utilisée pour créer un compte.`,
      danger: true,
      confirmLabel: 'Révoquer',
      successMessage: 'Invitation révoquée.',
      onConfirm: async () => {
        await revokeInvitation(email);
        await load();
      },
    });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">{employees.length} employés</h2>
          <p className="text-sm text-sand-500 dark:text-sand-400">Rôles, statuts et permissions individuelles</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons filename="employes-ratelafrica" title="Employés RATELAFRICA" columns={employeeExportColumns(roleName)} rows={filteredEmployees} />
          {canCreate && <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2"><UserPlus className="w-4 h-4" /> Inviter un employé</button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
          <input className="input pl-10" placeholder="Rechercher par nom ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[180px]" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="">Tous rôles</option>
          {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
        <select className="input max-w-[160px]" value={filterActive} onChange={(e) => setFilterActive(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="active">Actif</option>
          <option value="inactive">Désactivé</option>
        </select>
      </div>

      {invitations.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-sand-900 mb-3 text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-ocre-600" /> Invitations en attente ({invitations.length})</h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.email} className="flex items-center justify-between flex-wrap gap-2 p-2.5 rounded-lg bg-sand-50 dark:bg-sand-900 text-sm">
                <div className="min-w-0"><span className="font-medium text-sand-900 dark:text-sand-100 truncate">{inv.email}</span><span className="text-sand-400 dark:text-sand-500 ml-2">— {roleName(inv.role_code)}</span></div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-sand-400 dark:text-sand-500">Envoyée {timeAgo(inv.invited_at)}</span>
                  {canCreate && <button onClick={() => handleRevoke(inv.email)} className="text-xs px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100">Révoquer</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand-50 dark:bg-sand-900/50 border-b border-sand-200 dark:border-sand-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Employé</th>
                <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300 hidden md:table-cell">Rôle</th>
                <th className="text-center px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Statut</th>
                <th className="text-right px-4 py-3 font-medium text-sand-600 dark:text-sand-300"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100 dark:divide-sand-700">
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-sand-50 dark:hover:bg-sand-700 transition-colors cursor-pointer" onClick={() => setSelected(emp)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sand-900 dark:text-sand-100">{emp.full_name || emp.email}</div>
                    <div className="text-xs text-sand-400">{emp.email}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-sand-700">{emp.role_name ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${emp.is_active ? 'bg-green-100 text-green-700' : 'bg-sand-200 text-sand-600'}`}>{emp.is_active ? 'Actif' : 'Désactivé'}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-ocre-700 text-xs font-medium">Détails</td>
                </tr>
              ))}
              {filteredEmployees.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sand-400">Aucun employé ne correspond à ces critères.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && <InviteModal roles={roles} onClose={() => setShowInvite(false)} onInvited={() => { setShowInvite(false); void load(); }} />}
      {selected && (
        <EmployeeDetail
          employee={selected}
          roles={roles}
          permissions={permissions}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}

function InviteModal({ roles, onClose, onInvited }: { roles: Role[]; onClose: () => void; onInvited: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState(roles.find((r) => r.code !== 'ADMIN')?.code ?? roles[0]?.code ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await inviteEmployee(email, roleCode);
      toast.success(`Invitation envoyée à ${email}.`);
      onInvited();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible d'envoyer l'invitation.";
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700">
          <h2 className="font-display text-lg font-bold text-sand-900 flex items-center gap-2"><UserPlus className="w-5 h-5 text-ocre-600" /> Inviter un employé</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-sand-500 dark:text-sand-400">La personne devra créer son compte avec cette adresse e-mail depuis la page de connexion : le rôle lui sera attribué automatiquement.</p>
          <div><label className="label">Adresse e-mail</label><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employe@cmgs.ml" /></div>
          <div>
            <label className="label">Rôle</label>
            <select className="input" value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
              {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </div>
          {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
          <button disabled={sending || !email} onClick={submit} className="btn-primary w-full">{sending ? 'Envoi...' : "Envoyer l'invitation"}</button>
        </div>
      </div>
    </div>
  );
}

function EmployeeDetail({
  employee, roles, permissions, onClose, onChanged,
}: {
  employee: EmployeeWithRole; roles: Role[]; permissions: Permission[]; onClose: () => void; onChanged: () => void;
}) {
  const { confirmAction } = useConfirm();
  const toast = useToast();
  const { has } = usePermissions();
  const canManagePermissions = has('employees.permissions');
  const canDeleteAccount = has('employees.delete');
  const canDisable = has('employees.disable');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const overrideFor = (code: string) => employee.overrides.find((o) => o.permission_code === code);

  const changeRole = async (roleCode: string) => {
    setBusy('role');
    setError(null);
    try {
      await setEmployeeRole(employee.id, roleCode);
      onChanged();
      toast.success('Rôle mis à jour.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de modifier le rôle.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = () => {
    if (employee.is_active) {
      // Désactiver est une action sensible : passe par la confirmation, qui gère
      // elle-même l'état de chargement et la notification de succès/échec (§9).
      confirmAction({
        title: 'Désactiver ce compte ?',
        message: `${employee.full_name || employee.email} ne pourra plus se connecter au Dashboard tant que le compte n'est pas réactivé.`,
        danger: true,
        confirmLabel: 'Désactiver',
        successMessage: 'Compte désactivé.',
        onConfirm: async () => {
          await setEmployeeActive(employee.id, false);
          onChanged();
        },
      });
      return;
    }

    // Réactiver est une action à faible risque : pas de confirmation, mais toujours une notification.
    setBusy('active');
    setError(null);
    void (async () => {
      try {
        await setEmployeeActive(employee.id, true);
        onChanged();
        toast.success('Compte réactivé.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Impossible de modifier le statut.';
        setError(message);
        toast.error(message);
      } finally {
        setBusy(null);
      }
    })();
  };

  const sendReset = async () => {
    setBusy('reset');
    setError(null);
    setNotice(null);
    try {
      await resetEmployeePassword(employee.email);
      setNotice('Lien de réinitialisation envoyé.');
      toast.success('Lien de réinitialisation envoyé.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Envoi impossible.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAccount = () => {
    confirmAction({
      title: 'Supprimer définitivement ce compte ?',
      message: `Le compte de connexion de ${employee.full_name || employee.email} sera supprimé. Cette action est irréversible : contrairement à la désactivation, le compte ne pourra pas être restauré.`,
      danger: true,
      confirmLabel: 'Supprimer définitivement',
      successMessage: 'Compte supprimé définitivement.',
      onConfirm: async () => {
        await deleteEmployeeAccount(employee.id);
        onChanged();
        onClose();
      },
    });
  };

  const cyclePermission = (code: string, name: string) => {
    const current = overrideFor(code);

    if (current === undefined) {
      // Octroyer un accès au-delà du rôle est la modification la plus sensible : confirmation requise.
      confirmAction({
        title: 'Accorder cette permission ?',
        message: `${employee.full_name || employee.email} pourra désormais « ${name} », au-delà de ce que son rôle autorise normalement.`,
        confirmLabel: 'Accorder',
        successMessage: 'Permission mise à jour.',
        onConfirm: async () => {
          await setPermissionOverride(employee.id, code, true);
          onChanged();
        },
      });
      return;
    }

    setBusy(`perm-${code}`);
    setError(null);
    void (async () => {
      try {
        if (current.granted) await setPermissionOverride(employee.id, code, false);
        else await removePermissionOverride(employee.id, code);
        onChanged();
        toast.success('Permission mise à jour.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Impossible de modifier cette permission.';
        setError(message);
        toast.error(message);
      } finally {
        setBusy(null);
      }
    })();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700 sticky top-0 bg-white dark:bg-sand-800 z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold">{(employee.full_name || employee.email).charAt(0).toUpperCase()}</div>
            <div>
              <h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-50">{employee.full_name || employee.email}</h2>
              <div className="text-xs text-sand-400 flex items-center gap-1"><Mail className="w-3 h-3" /> {employee.email}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
          {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Rôle</label>
              <select className="input" value={employee.role_code ?? ''} disabled={busy === 'role' || !canManagePermissions} onChange={(e) => void changeRole(e.target.value)}>
                {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Statut du compte</label>
              <button onClick={() => toggleActive()} disabled={busy === 'active' || !canDisable} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border ${employee.is_active ? 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30' : 'border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30'}`}>
                <Power className="w-4 h-4" /> {employee.is_active ? 'Désactiver le compte' : 'Réactiver le compte'}
              </button>
            </div>
          </div>

          <button onClick={() => void sendReset()} disabled={busy === 'reset'} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border border-sand-200 text-sand-700 hover:bg-sand-50 dark:hover:bg-sand-700">
            <KeyRound className="w-4 h-4" /> Envoyer un lien de réinitialisation de mot de passe
          </button>

          {canDeleteAccount && (
            <button onClick={handleDeleteAccount} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
              <Trash2 className="w-4 h-4" /> Supprimer définitivement ce compte
            </button>
          )}

          <div>
            <h3 className="font-semibold text-sand-900 mb-2 text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Permissions individuelles</h3>
            <p className="text-xs text-sand-500 mb-3">
              Par défaut, l'employé hérite des permissions de son rôle ({employee.role_name ?? '—'}).
              {canManagePermissions ? ' Cliquez pour accorder ou retirer une permission spécifique.' : " Vous n'avez pas accès à la gestion des permissions."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {permissions.map((perm) => {
                const override = overrideFor(perm.code);
                const label = override === undefined ? 'Hérité du rôle' : override.granted ? 'Accordée' : 'Retirée';
                const color = override === undefined ? 'bg-sand-100 text-sand-500' : override.granted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600';
                return (
                  <button
                    key={perm.code}
                    onClick={() => cyclePermission(perm.code, perm.name)}
                    disabled={busy === `perm-${perm.code}` || !canManagePermissions}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-sand-200 hover:enabled:bg-sand-50 dark:hover:enabled:bg-sand-700 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className="text-xs text-sand-800 truncate">{perm.name}</span>
                    <span className={`badge shrink-0 ${color}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
