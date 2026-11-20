import React, {useMemo, useState} from 'react';
import {
  Check,
  Copy,
  Egg,
  MoreVertical,
  Nut,
  Plus,
  Search,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import {apiFetch, compressImage} from '../lib/api';
import {
  CategoryCounts,
  PRODUCT_CATEGORIES,
  ProductCategory,
  Shop,
  UserSession,
} from '../types';

interface DashboardViewProps {
  user: UserSession;
  shops: Shop[];
  categoryCounts: CategoryCounts;
  onRefreshSync: () => Promise<void>;
  onOpenShop: (shopId: string) => void;
  onOpenAccounts: () => void;
  onToast: (message: string, kind?: 'info' | 'error') => void;
}

const CATEGORY_META: Record<
  ProductCategory,
  {subtitle: string; Icon: React.ComponentType<{className?: string}>}
> = {
  'Quail Egg': {
    subtitle: 'Fresh farm quail eggs & packs',
    Icon: Egg,
  },
  'Egg Pickle': {
    subtitle: 'Spiced signature egg pickles',
    Icon: Sparkles,
  },
  Nuts: {
    subtitle: 'Roasted & gourmet nut varieties',
    Icon: Nut,
  },
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  shops,
  categoryCounts,
  onRefreshSync,
  onOpenShop,
  onOpenAccounts,
  onToast,
}) => {
  const isAdmin = user.role === 'admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'ALL' | ProductCategory>('ALL');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'status-active' | 'newest'>(
    'name-asc',
  );
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Add / Edit Shop Dialog
  const [shopDialogOpen, setShopDialogOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<ProductCategory>('Quail Egg');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formDescription, setFormDescription] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formImage, setFormImage] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [savingShop, setSavingShop] = useState(false);

  // Credentials Dialog
  const [credsDialog, setCredsDialog] = useState<{
    shopName: string;
    username: string;
    password: string;
    viewing: boolean;
  } | null>(null);
  const [credsCopied, setCredsCopied] = useState(false);

  // Delete Dialog
  const [deleteTarget, setDeleteTarget] = useState<Shop | null>(null);
  const [deletingShop, setDeletingShop] = useState(false);

  const stats = useMemo(() => {
    const active = shops.filter(s => s.status === 'active').length;
    return {
      total: shops.length,
      active,
      closed: shops.length - active,
    };
  }, [shops]);

  const filteredShops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = shops.filter(s => {
      if (activeCategory !== 'ALL' && s.category !== activeCategory) return false;
      if (!q) return true;
      return [s.name, s.description, s.category].some(v =>
        String(v || '').toLowerCase().includes(q),
      );
    });

    return list.sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'status-active') {
        return (b.status === 'active' ? 1 : 0) - (a.status === 'active' ? 1 : 0);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [shops, activeCategory, searchQuery, sortBy]);

  const openAddEditDialog = (shop: Shop | null) => {
    setOpenMenuId(null);
    setEditingShop(shop);
    setFormName(shop ? shop.name : '');
    setFormCategory(shop ? shop.category : 'Quail Egg');
    setFormStatus(shop ? shop.status : 'active');
    setFormDescription(shop ? shop.description : '');
    setFormAddress(shop ? shop.address : '');
    setFormPhone(shop ? shop.phone : '');
    setFormImage(shop ? shop.image : '');
    setRemoveImage(false);
    setShopDialogOpen(true);
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      onToast('Choose a PNG, JPG, WEBP, or GIF image.', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onToast('Image must be under 5 MB.', 'error');
      e.target.value = '';
      return;
    }
    try {
      const compressed = await compressImage(file);
      setFormImage(compressed);
      setRemoveImage(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not process image.', 'error');
    }
  };

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      onToast('Enter a shop name.', 'error');
      return;
    }
    setSavingShop(true);
    try {
      if (editingShop) {
        await apiFetch(`/api/shops/${encodeURIComponent(editingShop.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formName.trim(),
            category: formCategory,
            status: formStatus,
            description: formDescription.trim(),
            address: formAddress.trim(),
            phone: formPhone.trim(),
            image: formImage,
            removeImage,
          }),
        });
        setShopDialogOpen(false);
        await onRefreshSync();
        onToast('Shop updated');
      } else {
        const res = await apiFetch<{
          ok: boolean;
          credentials: {shopName: string; username: string; password: string};
        }>('/api/shops', {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            category: formCategory,
            status: formStatus,
            description: formDescription.trim(),
            address: formAddress.trim(),
            phone: formPhone.trim(),
            image: formImage,
          }),
        });
        setShopDialogOpen(false);
        await onRefreshSync();
        setCredsCopied(false);
        setCredsDialog({
          shopName: res.credentials.shopName,
          username: res.credentials.username,
          password: res.credentials.password,
          viewing: false,
        });
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save the shop.', 'error');
    } finally {
      setSavingShop(false);
    }
  };

  const handleToggleStatus = async (shop: Shop) => {
    setOpenMenuId(null);
    try {
      await apiFetch(`/api/shops/${encodeURIComponent(shop.id)}/status`, {
        method: 'PATCH',
      });
      await onRefreshSync();
      onToast(
        `${shop.name} is now ${shop.status === 'active' ? 'closed' : 'active'}`,
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update shop status.', 'error');
    }
  };

  const handleDeleteShop = async () => {
    if (!deleteTarget) return;
    setDeletingShop(true);
    try {
      await apiFetch(`/api/shops/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const name = deleteTarget.name;
      setDeleteTarget(null);
      await onRefreshSync();
      onToast(`${name} deleted`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete shop.', 'error');
    } finally {
      setDeletingShop(false);
    }
  };

  const handleCopyCreds = async () => {
    if (!credsDialog) return;
    try {
      await navigator.clipboard.writeText(
        `Shop: ${credsDialog.shopName}\nUsername: ${credsDialog.username}\nPassword: ${credsDialog.password}`,
      );
      setCredsCopied(true);
      setTimeout(() => setCredsCopied(false), 1800);
    } catch {
      onToast('Copy failed', 'error');
    }
  };

  return (
    <main
      className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8"
      onClick={() => {
        if (openMenuId) setOpenMenuId(null);
      }}
    >
      {/* Intro & Clean Shop Summary (Receipts 0 and Total sales ₹0.00 removed) */}
      <section className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--gb-ink)] sm:text-4xl">
            Welcome, {user.displayRole}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-[var(--gb-muted)]">
            {isAdmin
              ? 'Manage your shops, categories, receipts, and team login accounts with live synchronization.'
              : 'Open a shop to view receipts and product counts. Updates appear here live.'}
          </p>
        </div>

        <div className="flex w-full gap-2.5 sm:w-auto">
          <div className="flex-1 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-4 py-3 sm:min-w-[110px]">
            <span className="block text-xs font-semibold text-[var(--gb-muted)]">
              Total shops
            </span>
            <strong className="tabular-nums text-2xl font-extrabold text-[var(--gb-ink)]">
              {stats.total}
            </strong>
          </div>
          <div className="flex-1 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-4 py-3 sm:min-w-[110px]">
            <span className="block text-xs font-semibold text-[var(--gb-muted)]">
              Active
            </span>
            <strong className="tabular-nums text-2xl font-extrabold text-[var(--gb-green)]">
              {stats.active}
            </strong>
          </div>
          <div className="flex-1 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-4 py-3 sm:min-w-[110px]">
            <span className="block text-xs font-semibold text-[var(--gb-muted)]">
              Closed
            </span>
            <strong className="tabular-nums text-2xl font-extrabold text-[var(--gb-amber)]">
              {stats.closed}
            </strong>
          </div>
        </div>
      </section>

      {/* 3 Category Cards ONLY: Quail Egg, Egg Pickle, Nuts */}
      <section aria-label="Product categories" className="mb-6 grid gap-3 sm:grid-cols-3">
        {PRODUCT_CATEGORIES.map(category => {
          const count = categoryCounts[category] ?? 0;
          const active = activeCategory === category;
          const {subtitle, Icon} = CATEGORY_META[category];

          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(active ? 'ALL' : category)}
              className={`group flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${
                active
                  ? 'border-[var(--gb-gold)] bg-[var(--gb-gold-soft)] shadow-sm'
                  : 'border-[var(--gb-line)] bg-[var(--gb-surface)] hover:border-[var(--gb-gold-2)]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                    active
                      ? 'bg-[var(--gb-gold)] text-white'
                      : 'bg-[var(--gb-surface-2)] text-[var(--gb-gold)] group-hover:bg-[var(--gb-gold-soft)]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-[var(--gb-ink)]">
                    {category}
                  </div>
                  <div className="truncate text-xs text-[var(--gb-muted)]">{subtitle}</div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tabular-nums text-2xl font-extrabold text-[var(--gb-gold-ink)]">
                  {count}
                </div>
                <div className="text-[11px] font-semibold text-[var(--gb-muted)]">
                  {count === 1 ? 'Shop' : 'Shops'}
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Search, Sort, Category Filter Bar & Admin Add Shop */}
      <section className="mb-6 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-3.5 shadow-[var(--gb-shadow)] sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gb-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by shop name, category or description"
              aria-label="Search shops"
              className="w-full min-h-[42px] rounded-full border border-[var(--gb-line)] bg-[var(--gb-surface-2)] pl-10 pr-9 text-sm text-[var(--gb-ink)] outline-none transition focus:border-[var(--gb-gold)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--gb-line)] text-xs text-[var(--gb-muted)]"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={e =>
              setSortBy(e.target.value as 'name-asc' | 'name-desc' | 'status-active' | 'newest')
            }
            aria-label="Sort shops"
            className="min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-xs font-bold text-[var(--gb-ink)] outline-none focus:border-[var(--gb-gold)]"
          >
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="status-active">Active first</option>
            <option value="newest">Newest first</option>
          </select>

          {isAdmin && (
            <button
              type="button"
              onClick={() => openAddEditDialog(null)}
              className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition hover:brightness-95 sm:w-auto whitespace-nowrap shrink-0"
              style={{background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))'}}
            >
              <Plus className="h-4 w-4" />
              <span>Add shop</span>
            </button>
          )}
        </div>

        {/* Category Filter Buttons (ONLY All shops + 3 categories) */}
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-0.5"
          role="group"
          aria-label="Filter by category"
        >
          <button
            type="button"
            onClick={() => setActiveCategory('ALL')}
            aria-pressed={activeCategory === 'ALL'}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold whitespace-nowrap shrink-0 transition ${
              activeCategory === 'ALL'
                ? 'border-[var(--gb-gold)] bg-[var(--gb-gold)] text-white'
                : 'border-[var(--gb-line)] bg-[var(--gb-surface)] text-[var(--gb-muted)] hover:border-[var(--gb-gold-2)] hover:text-[var(--gb-ink)]'
            }`}
          >
            <span>All shops</span>
            <span className="tabular-nums opacity-80">{shops.length}</span>
          </button>

          {PRODUCT_CATEGORIES.map(category => {
            const selected = activeCategory === category;
            const count = categoryCounts[category] ?? 0;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                aria-pressed={selected}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold whitespace-nowrap shrink-0 transition ${
                  selected
                    ? 'border-[var(--gb-gold)] bg-[var(--gb-gold)] text-white'
                    : 'border-[var(--gb-line)] bg-[var(--gb-surface)] text-[var(--gb-muted)] hover:border-[var(--gb-gold-2)] hover:text-[var(--gb-ink)]'
                }`}
              >
                <span>{category}</span>
                <span className="tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Shops Grid */}
      {!filteredShops.length ? (
        <div className="rounded-2xl border border-dashed border-[var(--gb-line)] bg-[var(--gb-surface)] px-6 py-12 text-center">
          <Store className="mx-auto mb-3 h-10 w-10 text-[var(--gb-gold)] opacity-70" />
          <h3 className="font-display text-xl font-bold text-[var(--gb-ink)]">
            {shops.length > 0 ? 'No shops match your search' : 'No shops yet'}
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--gb-muted)]">
            {shops.length > 0
              ? 'Try a different keyword or clear the category filter.'
              : isAdmin
                ? 'Select Add shop to register your first Quail Egg, Egg Pickle, or Nuts shop.'
                : 'An administrator has not added any shops yet.'}
          </p>
          {shops.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('ALL');
              }}
              className="mt-4 min-h-[40px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-4 text-xs font-bold text-[var(--gb-ink)]"
            >
              Clear filters
            </button>
          ) : isAdmin ? (
            <button
              type="button"
              onClick={() => openAddEditDialog(null)}
              className="mt-4 inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-white"
              style={{background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))'}}
            >
              <Plus className="h-4 w-4" />
              <span>Add first shop</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredShops.map(shop => {
            const isOpen = shop.status === 'active';
            const initial = (shop.name.trim()[0] || '?').toUpperCase();
            const contact = [shop.address, shop.phone].filter(Boolean).join(' · ');

            return (
              <article
                key={shop.id}
                className={`group flex flex-col overflow-hidden rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] transition hover:border-[var(--gb-gold-2)] hover:shadow-[var(--gb-shadow)] ${
                  !isOpen ? 'opacity-85' : ''
                }`}
              >
                <div className="relative h-44 bg-[var(--gb-gold-soft)] overflow-hidden">
                  {shop.image ? (
                    <img
                      src={shop.image}
                      alt={shop.name}
                      referrerPolicy="no-referrer"
                      className={`h-full w-full object-cover ${!isOpen ? 'grayscale' : ''}`}
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center font-display text-6xl font-bold text-[var(--gb-gold)]"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--gb-gold-soft), color-mix(in srgb, var(--gb-gold-2) 28%, var(--gb-gold-soft)))',
                      }}
                    >
                      {initial}
                    </div>
                  )}

                  {isAdmin && (
                    <div
                      className="absolute right-2.5 top-2.5 z-10"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenuId(openMenuId === shop.id ? null : shop.id)
                        }
                        aria-label={`Options for ${shop.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--gb-line)] bg-[var(--gb-surface)]/95 text-[var(--gb-ink)] backdrop-blur-md hover:border-[var(--gb-gold-2)]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {openMenuId === shop.id && (
                        <div className="absolute right-0 top-10 w-48 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-1.5 shadow-xl">
                          <button
                            type="button"
                            onClick={() => openAddEditDialog(shop)}
                            className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--gb-ink)] hover:bg-[var(--gb-surface-2)]"
                          >
                            Edit shop
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(shop)}
                            className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--gb-ink)] hover:bg-[var(--gb-surface-2)]"
                          >
                            {isOpen ? 'Mark as closed' : 'Mark as active'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              setCredsCopied(false);
                              setCredsDialog({
                                shopName: shop.name,
                                username: shop.username || '-',
                                password: shop.password || '-',
                                viewing: true,
                              });
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--gb-ink)] hover:bg-[var(--gb-surface-2)]"
                          >
                            Login details
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              setDeleteTarget(shop);
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--gb-red)] hover:bg-[var(--gb-red-soft)]"
                          >
                            Delete shop
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="text-[var(--gb-gold-ink)]">{shop.category}</span>
                    <span aria-hidden="true" className="text-[var(--gb-muted)]">
                      ·
                    </span>
                    <span
                      className={
                        isOpen ? 'text-[var(--gb-green)]' : 'text-[var(--gb-muted)]'
                      }
                    >
                      {isOpen ? 'Active' : 'Closed'}
                    </span>
                  </div>

                  <h3 className="mt-1 truncate text-lg font-extrabold text-[var(--gb-ink)]">
                    {shop.name}
                  </h3>

                  <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-[var(--gb-muted)]">
                    {shop.description || 'Manage receipts and product dispatches for this shop.'}
                  </p>

                  {contact && (
                    <p className="mt-2 truncate text-[11px] font-medium text-[var(--gb-muted)]">
                      {contact}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                    <span className="tabular-nums text-[11px] font-semibold text-[var(--gb-muted)]">
                      ID {shop.id.slice(-6).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenShop(shop.id)}
                      className="min-h-[38px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-4 text-xs font-bold text-[var(--gb-ink)] transition hover:border-[var(--gb-gold)] hover:bg-[var(--gb-gold)] hover:text-white"
                    >
                      Open shop
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Add / Edit Shop Dialog */}
      {shopDialogOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) setShopDialogOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] shadow-2xl">
            <div className="border-b border-[var(--gb-line)] px-5 py-4">
              <h2 className="font-display text-xl font-bold text-[var(--gb-ink)]">
                {editingShop ? 'Edit shop' : 'Add shop'}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--gb-muted)]">
                {editingShop
                  ? `Update details for ${editingShop.name}.`
                  : 'Enter shop details. Login credentials are created automatically.'}
              </p>
            </div>

            <form onSubmit={handleSaveShop} className="flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]">
                  Shop name
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="For example, City Quail Mart"
                  required
                  className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3.5 text-sm outline-none focus:border-[var(--gb-gold)]"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as ProductCategory)}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm font-semibold outline-none focus:border-[var(--gb-gold)]"
                  >
                    {PRODUCT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm font-semibold outline-none focus:border-[var(--gb-gold)]"
                  >
                    <option value="active">Active (open)</option>
                    <option value="inactive">Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]">
                  Description
                </label>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="What does this shop sell?"
                  className="w-full rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]">
                    Address
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]">
                    Phone
                  </label>
                  <input
                    type="tel"
                    maxLength={20}
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]">
                  Shop image
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImagePick}
                  className="w-full rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-2 text-xs"
                />
                {formImage && (
                  <div className="relative mt-2.5 h-32 overflow-hidden rounded-xl border border-[var(--gb-line)]">
                    <img
                      src={formImage}
                      alt="Shop preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFormImage('');
                        setRemoveImage(true);
                      }}
                      className="absolute right-2 top-2 rounded-lg bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShopDialogOpen(false)}
                  className="min-h-[42px] rounded-xl border border-[var(--gb-line)] px-4 text-xs font-bold text-[var(--gb-ink)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingShop}
                  className="min-h-[42px] rounded-xl px-5 text-xs font-bold text-white disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                  }}
                >
                  {savingShop
                    ? 'Saving…'
                    : editingShop
                      ? 'Save changes'
                      : 'Add shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shop Credentials Dialog */}
      {credsDialog && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) setCredsDialog(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-[var(--gb-ink)]">
              {credsDialog.viewing ? 'Shop login details' : 'Shop created'}
            </h2>
            <p className="mt-1 text-xs text-[var(--gb-muted)]">
              {credsDialog.viewing
                ? 'Use these details to sign in to this shop, or edit them in Accounts.'
                : 'Save these login details and share them with the shop.'}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                  Shop
                </label>
                <input
                  readOnly
                  value={credsDialog.shopName}
                  className="w-full min-h-[40px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-gold-soft)] px-3 text-sm font-bold text-[var(--gb-gold-ink)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                  Username
                </label>
                <input
                  readOnly
                  value={credsDialog.username}
                  className="w-full min-h-[40px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-gold-soft)] px-3 text-sm font-bold text-[var(--gb-gold-ink)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                  Password
                </label>
                <input
                  readOnly
                  value={credsDialog.password}
                  className="w-full min-h-[40px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-gold-soft)] px-3 text-sm font-bold text-[var(--gb-gold-ink)]"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setCredsDialog(null);
                  onOpenAccounts();
                }}
                className="min-h-[40px] rounded-xl border border-[var(--gb-line)] px-3.5 text-xs font-bold text-[var(--gb-ink)] hover:bg-[var(--gb-surface-2)]"
              >
                Edit username / password
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyCreds()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--gb-line)] px-3.5 text-xs font-bold text-[var(--gb-ink)]"
                >
                  {credsCopied ? (
                    <Check className="h-3.5 w-3.5 text-[var(--gb-green)]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{credsCopied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCredsDialog(null)}
                  className="min-h-[40px] rounded-xl px-4 text-xs font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Shop Confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-[var(--gb-ink)]">
              Delete shop?
            </h2>
            <p className="mt-2 text-sm text-[var(--gb-muted)]">
              {deleteTarget.name} and all of its receipts will be removed. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[40px] rounded-xl border border-[var(--gb-line)] px-4 text-xs font-bold text-[var(--gb-ink)]"
              >
                Keep shop
              </button>
              <button
                type="button"
                disabled={deletingShop}
                onClick={() => void handleDeleteShop()}
                className="min-h-[40px] rounded-xl bg-[var(--gb-red)] px-4 text-xs font-bold text-white disabled:opacity-60"
              >
                {deletingShop ? 'Deleting…' : 'Delete shop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
