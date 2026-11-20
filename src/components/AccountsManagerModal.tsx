import React, {useEffect, useState} from 'react';
import {
  Activity,
  Check,
  Copy,
  KeyRound,
  Plus,
  Shield,
  Store,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {apiFetch} from '../lib/api';
import {AdminAccountsPayload, UserSession} from '../types';

interface AccountsManagerModalProps {
  open: boolean;
  onClose: () => void;
  onToast: (message: string, kind?: 'info' | 'error') => void;
  onAdminSessionUpdated: (user: UserSession, token: string) => void;
}

export const AccountsManagerModal: React.FC<AccountsManagerModalProps> = ({
  open,
  onClose,
  onToast,
  onAdminSessionUpdated,
}) => {
  const [tab, setTab] = useState<'admin' | 'teams' | 'shops' | 'activity'>('teams');
  const [data, setData] = useState<AdminAccountsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  // Admin account form
  const [adminUser, setAdminUser] = useState('');
  const [adminDisplay, setAdminDisplay] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);

  // New team form
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamUser, setNewTeamUser] = useState('');
  const [newTeamPass, setNewTeamPass] = useState('');
  const [addingTeam, setAddingTeam] = useState(false);

  // Inline edits for teams & shops
  const [teamEdits, setTeamEdits] = useState<
    Record<string, {name: string; username: string; password: string; active: boolean}>
  >({});
  const [shopEdits, setShopEdits] = useState<
    Record<string, {username: string; password: string}>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<AdminAccountsPayload & {ok: boolean}>(
        '/api/admin/accounts',
      );
      setData(res);
      setAdminUser(res.admin.username);
      setAdminDisplay(res.admin.displayName);
      setAdminPass('');

      const tMap: typeof teamEdits = {};
      for (const t of res.teams) {
        tMap[t.id] = {
          name: t.name,
          username: t.username,
          password: t.password,
          active: t.active,
        };
      }
      setTeamEdits(tMap);

      const sMap: typeof shopEdits = {};
      for (const s of res.shops) {
        sMap[s.id] = {
          username: s.username,
          password: s.password,
        };
      }
      setShopEdits(sMap);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not load accounts.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchAccounts();
    }
  }, [open]);

  if (!open) return null;

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAdmin(true);
    try {
      const res = await apiFetch<{ok: boolean; user: UserSession; token: string}>(
        '/api/admin/accounts/admin',
        {
          method: 'PUT',
          body: JSON.stringify({
            username: adminUser.trim(),
            displayName: adminDisplay.trim(),
            password: adminPass,
          }),
        },
      );
      onAdminSessionUpdated(res.user, res.token);
      setAdminPass('');
      onToast('Admin username and password updated');
      await fetchAccounts();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Update failed.', 'error');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingTeam(true);
    try {
      await apiFetch('/api/admin/accounts/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: newTeamName.trim(),
          username: newTeamUser.trim(),
          password: newTeamPass,
        }),
      });
      setNewTeamName('');
      setNewTeamUser('');
      setNewTeamPass('');
      onToast('Team account created');
      await fetchAccounts();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not create team account.', 'error');
    } finally {
      setAddingTeam(false);
    }
  };

  const handleSaveTeam = async (teamId: string) => {
    const edit = teamEdits[teamId];
    if (!edit) return;
    setSavingId(teamId);
    try {
      await apiFetch(`/api/admin/accounts/teams/${encodeURIComponent(teamId)}`, {
        method: 'PUT',
        body: JSON.stringify(edit),
      });
      onToast('Team credentials updated');
      await fetchAccounts();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update team account.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteTeam = async (teamId: string, name: string) => {
    setSavingId(teamId);
    try {
      await apiFetch(`/api/admin/accounts/teams/${encodeURIComponent(teamId)}`, {
        method: 'DELETE',
      });
      onToast(`${name} removed`);
      await fetchAccounts();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not remove account.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveShopCreds = async (shopId: string) => {
    const edit = shopEdits[shopId];
    if (!edit) return;
    setSavingId(shopId);
    try {
      await apiFetch(`/api/admin/accounts/shops/${encodeURIComponent(shopId)}`, {
        method: 'PUT',
        body: JSON.stringify(edit),
      });
      onToast('Shop username and password updated');
      await fetchAccounts();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update shop login.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const copyCreds = async (id: string, label: string, u: string, p: string) => {
    try {
      await navigator.clipboard.writeText(`${label}\nUsername: ${u}\nPassword: ${p}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      onToast('Copy failed', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-3 sm:p-5 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--gb-line)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--gb-gold-soft)] text-[var(--gb-gold-ink)]">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--gb-ink)]">
                Accounts & Passwords
              </h2>
              <p className="text-xs text-[var(--gb-muted)]">
                Admin only — update usernames and passwords for everyone
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--gb-line)] text-[var(--gb-muted)] hover:bg-[var(--gb-surface-2)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-4 py-2">
          {[
            {id: 'teams' as const, label: 'Team Users', icon: Users},
            {id: 'shops' as const, label: 'Shop Logins', icon: Store},
            {id: 'admin' as const, label: 'Admin Login', icon: Shield},
            {id: 'activity' as const, label: 'Activity Log', icon: Activity},
          ].map(item => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition ${
                  active
                    ? 'bg-[var(--gb-gold)] text-white shadow-sm'
                    : 'text-[var(--gb-muted)] hover:bg-[var(--gb-surface)] hover:text-[var(--gb-ink)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && !data ? (
            <div className="py-12 text-center text-sm text-[var(--gb-muted)]">
              Loading accounts…
            </div>
          ) : tab === 'teams' ? (
            <div className="space-y-6">
              <form
                onSubmit={handleAddTeam}
                className="rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-4"
              >
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--gb-ink)]">
                  <Plus className="h-4 w-4 text-[var(--gb-gold)]" />
                  Add Team Account
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    placeholder="Full name (e.g., Haya)"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    required
                    className="min-h-[42px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                  <input
                    type="text"
                    placeholder="Username"
                    value={newTeamUser}
                    onChange={e => setNewTeamUser(e.target.value)}
                    required
                    className="min-h-[42px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                  <input
                    type="text"
                    placeholder="Password (min 4 chars)"
                    value={newTeamPass}
                    onChange={e => setNewTeamPass(e.target.value)}
                    required
                    className="min-h-[42px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={addingTeam}
                    className="min-h-[40px] rounded-lg px-4 text-xs font-bold text-white disabled:opacity-60"
                    style={{
                      background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                    }}
                  >
                    {addingTeam ? 'Adding…' : 'Create Team Account'}
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                {(data?.teams || []).map(team => {
                  const edit = teamEdits[team.id] || {
                    name: team.name,
                    username: team.username,
                    password: team.password,
                    active: team.active,
                  };
                  return (
                    <div
                      key={team.id}
                      className="rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-4"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[var(--gb-ink)]">
                          {team.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void copyCreds(
                                team.id,
                                `Team: ${edit.name}`,
                                edit.username,
                                edit.password,
                              )
                            }
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[var(--gb-line)] px-2.5 text-xs font-semibold text-[var(--gb-muted)] hover:text-[var(--gb-ink)]"
                          >
                            {copiedId === team.id ? (
                              <Check className="h-3.5 w-3.5 text-[var(--gb-green)]" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>{copiedId === team.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          {(data?.teams.length || 0) > 1 && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteTeam(team.id, team.name)}
                              disabled={savingId === team.id}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[var(--gb-red-soft)] px-2.5 text-xs font-bold text-[var(--gb-red)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--gb-muted)]">
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={edit.name}
                            onChange={e =>
                              setTeamEdits(prev => ({
                                ...prev,
                                [team.id]: {...edit, name: e.target.value},
                              }))
                            }
                            className="w-full min-h-[40px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--gb-muted)]">
                            Username
                          </label>
                          <input
                            type="text"
                            value={edit.username}
                            onChange={e =>
                              setTeamEdits(prev => ({
                                ...prev,
                                [team.id]: {...edit, username: e.target.value},
                              }))
                            }
                            className="w-full min-h-[40px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--gb-muted)]">
                            Password
                          </label>
                          <input
                            type="text"
                            value={edit.password}
                            onChange={e =>
                              setTeamEdits(prev => ({
                                ...prev,
                                [team.id]: {...edit, password: e.target.value},
                              }))
                            }
                            className="w-full min-h-[40px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--gb-muted)]">
                          <input
                            type="checkbox"
                            checked={edit.active}
                            onChange={e =>
                              setTeamEdits(prev => ({
                                ...prev,
                                [team.id]: {...edit, active: e.target.checked},
                              }))
                            }
                            className="h-4 w-4 accent-[var(--gb-gold)]"
                          />
                          <span>Account active</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => void handleSaveTeam(team.id)}
                          disabled={savingId === team.id}
                          className="min-h-[38px] rounded-lg px-4 text-xs font-bold text-white disabled:opacity-60"
                          style={{
                            background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                          }}
                        >
                          {savingId === team.id ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : tab === 'shops' ? (
            <div className="space-y-3">
              {!data?.shops.length ? (
                <div className="rounded-xl border border-dashed border-[var(--gb-line)] p-8 text-center text-sm text-[var(--gb-muted)]">
                  No shops registered yet. Create a shop first to manage its login details.
                </div>
              ) : (
                data.shops.map(shop => {
                  const edit = shopEdits[shop.id] || {
                    username: shop.username,
                    password: shop.password,
                  };
                  return (
                    <div
                      key={shop.id}
                      className="rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-4"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-bold text-[var(--gb-ink)]">
                            {shop.name}
                          </span>
                          <span className="ml-2 text-xs text-[var(--gb-muted)]">
                            · {shop.category} · {shop.status === 'active' ? 'Active' : 'Closed'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void copyCreds(
                              shop.id,
                              `Shop: ${shop.name}`,
                              edit.username,
                              edit.password,
                            )
                          }
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[var(--gb-line)] px-2.5 text-xs font-semibold text-[var(--gb-muted)] hover:text-[var(--gb-ink)]"
                        >
                          {copiedId === shop.id ? (
                            <Check className="h-3.5 w-3.5 text-[var(--gb-green)]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedId === shop.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--gb-muted)]">
                            Shop Username
                          </label>
                          <input
                            type="text"
                            value={edit.username}
                            onChange={e =>
                              setShopEdits(prev => ({
                                ...prev,
                                [shop.id]: {...edit, username: e.target.value},
                              }))
                            }
                            className="w-full min-h-[40px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--gb-muted)]">
                            Shop Password
                          </label>
                          <input
                            type="text"
                            value={edit.password}
                            onChange={e =>
                              setShopEdits(prev => ({
                                ...prev,
                                [shop.id]: {...edit, password: e.target.value},
                              }))
                            }
                            className="w-full min-h-[40px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void handleSaveShopCreds(shop.id)}
                          disabled={savingId === shop.id}
                          className="min-h-[38px] rounded-lg px-4 text-xs font-bold text-white disabled:opacity-60"
                          style={{
                            background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                          }}
                        >
                          {savingId === shop.id ? 'Saving…' : 'Update Shop Login'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : tab === 'admin' ? (
            <form
              onSubmit={handleSaveAdmin}
              className="mx-auto max-w-md space-y-4 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-5"
            >
              <div>
                <h3 className="text-sm font-bold text-[var(--gb-ink)]">
                  Administrator Account Credentials
                </h3>
                <p className="mt-1 text-xs text-[var(--gb-muted)]">
                  Update the administrator username and password used to sign in on the Admin Login tab.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                  Admin Display Name
                </label>
                <input
                  type="text"
                  value={adminDisplay}
                  onChange={e => setAdminDisplay(e.target.value)}
                  required
                  className="w-full min-h-[42px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                  Admin Username
                </label>
                <input
                  type="text"
                  value={adminUser}
                  onChange={e => setAdminUser(e.target.value)}
                  required
                  className="w-full min-h-[42px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                  New Admin Password (leave blank to keep current)
                </label>
                <input
                  type="text"
                  value={adminPass}
                  onChange={e => setAdminPass(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full min-h-[42px] rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                />
              </div>

              <button
                type="submit"
                disabled={savingAdmin}
                className="w-full min-h-[44px] rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                }}
              >
                {savingAdmin ? 'Updating…' : 'Save Admin Credentials'}
              </button>
            </form>
          ) : (
            <div className="space-y-2">
              {!data?.activityLog.length ? (
                <div className="py-10 text-center text-sm text-[var(--gb-muted)]">
                  No activity recorded yet.
                </div>
              ) : (
                data.activityLog.map(entry => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-4 py-2.5 text-xs"
                  >
                    <div>
                      <span className="font-bold text-[var(--gb-ink)]">{entry.action}</span>
                      {entry.detail && (
                        <span className="text-[var(--gb-muted)]"> · {entry.detail}</span>
                      )}
                    </div>
                    <div className="text-[var(--gb-muted)] tabular-nums">
                      {entry.user} · {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
