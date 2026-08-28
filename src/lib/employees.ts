import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { EmployeeWithRole, EmployeeInvitation, Role, Permission, Profile, PermissionOverride } from '@/lib/types';

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from('roles').select('*').order('name');
  if (error) throw new Error('Impossible de charger les rôles.');
  return (data as Role[]) ?? [];
}

export async function listPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase.from('permissions').select('*').order('code');
  if (error) throw new Error('Impossible de charger les permissions.');
  return (data as Permission[]) ?? [];
}

export async function listEmployees(): Promise<EmployeeWithRole[]> {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('account_type', ['ADMIN', 'EMPLOYEE', 'DRIVER'])
    .order('created_at', { ascending: false });
  if (profilesError) throw new Error('Impossible de charger les employés. Vérifiez la permission « employees.view ».');
  const list = (profiles as Profile[]) ?? [];
  if (list.length === 0) return [];

  const ids = list.map((p) => p.id);

  const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id').in('user_id', ids);
  const { data: roles } = await supabase.from('roles').select('id, code, name');
  const { data: overrides } = await supabase.from('user_permission_overrides').select('user_id, permission_code, granted').in('user_id', ids);

  const roleById = new Map((roles as { id: string; code: string; name: string }[] ?? []).map((r) => [r.id, r]));
  const roleByUser = new Map<string, { code: string; name: string }>();
  for (const ur of (userRoles as { user_id: string; role_id: string }[]) ?? []) {
    const role = roleById.get(ur.role_id);
    if (role) roleByUser.set(ur.user_id, role);
  }
  const overridesByUser = new Map<string, PermissionOverride[]>();
  for (const o of (overrides as PermissionOverride[]) ?? []) {
    const arr = overridesByUser.get(o.user_id) ?? [];
    arr.push(o);
    overridesByUser.set(o.user_id, arr);
  }

  return list.map((profile) => ({
    ...profile,
    role_code: roleByUser.get(profile.id)?.code ?? null,
    role_name: roleByUser.get(profile.id)?.name ?? null,
    overrides: overridesByUser.get(profile.id) ?? [],
  }));
}

export async function listPendingInvitations(): Promise<EmployeeInvitation[]> {
  const { data, error } = await supabase.from('employee_invitations').select('*').eq('status', 'PENDING').order('invited_at', { ascending: false });
  if (error) throw new Error('Impossible de charger les invitations.');
  return (data as EmployeeInvitation[]) ?? [];
}

export async function inviteEmployee(email: string, roleCode: string): Promise<EmployeeInvitation> {
  const { data, error } = await supabase.rpc('invite_employee', { p_email: email, p_role_code: roleCode });
  if (error) throw new Error(friendlyError(error, "Impossible d'envoyer l'invitation."));
  return data as EmployeeInvitation;
}

export async function revokeInvitation(email: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_employee_invitation', { p_email: email });
  if (error) throw new Error(friendlyError(error, "Impossible de révoquer l'invitation."));
}

export async function setEmployeeRole(userId: string, roleCode: string): Promise<Profile> {
  const { data, error } = await supabase.rpc('set_employee_role', { p_user_id: userId, p_role_code: roleCode });
  if (error) throw new Error(friendlyError(error, 'Impossible de modifier le rôle.'));
  return data as Profile;
}

export async function setEmployeeActive(userId: string, isActive: boolean): Promise<Profile> {
  const { data, error } = await supabase.rpc('set_employee_active', { p_user_id: userId, p_is_active: isActive });
  if (error) throw new Error(friendlyError(error, 'Impossible de modifier le statut du compte.'));
  return data as Profile;
}

export async function setPermissionOverride(userId: string, permissionCode: string, granted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_employee_permission_override', { p_user_id: userId, p_permission_code: permissionCode, p_granted: granted });
  if (error) throw new Error(friendlyError(error, 'Impossible de modifier cette permission.'));
}

export async function removePermissionOverride(userId: string, permissionCode: string): Promise<void> {
  const { error } = await supabase.rpc('remove_employee_permission_override', { p_user_id: userId, p_permission_code: permissionCode });
  if (error) throw new Error(friendlyError(error, 'Impossible de réinitialiser cette permission.'));
}

/** Envoie un lien de réinitialisation de mot de passe à l'employé (flux standard Supabase Auth). */
export async function resetEmployeePassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/#auth` });
  if (error) throw new Error("Impossible d'envoyer le lien de réinitialisation.");
}
