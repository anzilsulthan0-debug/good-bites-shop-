import React, {useMemo, useState} from 'react';
import {ArrowLeft, Plus, Printer, Search, Store} from 'lucide-react';
import {apiFetch, formatMoney} from '../lib/api';
import {
  PRODUCT_CATEGORIES,
  ProductCategory,
  Receipt,
  Shop,
  UserSession,
} from '../types';

interface ShopDetailViewProps {
  user: UserSession;
  shop: Shop;
  receipts: Receipt[];
  onBack: () => void;
  onRefreshSync: () => Promise<void>;
  onToast: (message: string, kind?: 'info' | 'error') => void;
}

function getPieceData(r: Receipt) {
  const total = Math.max(0, Number(r.quantity) || 0);
  const given = Math.max(0, Math.min(total, Number(r.givenQuantity) || 0));
  const pending = total - given;
  const percent = total > 0 ? Math.round((given / total) * 100) : 0;
  return {total, given, pending, percent};
}

function localDateString() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export const ShopDetailView: React.FC<ShopDetailViewProps> = ({
  user,
  shop,
  receipts,
  onBack,
  onRefreshSync,
  onToast,
}) => {
  const isAdmin = user.role === 'admin';

  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [productName, setProductName] = useState<ProductCategory>(shop.category || 'Quail Egg');
  const [receiptDate, setReceiptDate] = useState(localDateString());
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [savingReceipt, setSavingReceipt] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  // Given Pieces Modal
  const [givenTarget, setGivenTarget] = useState<Receipt | null>(null);
  const [givenInput, setGivenInput] = useState(0);
  const [updatingGiven, setUpdatingGiven] = useState(false);

  // Delete Modal
  const [deleteTarget, setDeleteTarget] = useState<Receipt | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState(false);

  // Print receipt
  const [printingReceipt, setPrintingReceipt] = useState<Receipt | null>(null);

  const summary = useMemo(() => {
    let sales = 0;
    let given = 0;
    let pending = 0;
    for (const r of receipts) {
      const p = getPieceData(r);
      sales += (Number(r.price) || 0) * p.total;
      given += p.given;
      pending += p.pending;
    }
    return {
      count: receipts.length,
      sales,
      given,
      pending,
    };
  }, [receipts]);

  const nextNumberPreview = useMemo(() => {
    let next = 1;
    for (const r of receipts) {
      const m = String(r.receiptNumber || '').match(/-(\d+)$/);
      if (m) next = Math.max(next, Number(m[1]) + 1);
    }
    const shortShop = String(shop.id).replace(/\D/g, '').slice(-2).padStart(2, '0');
    return `REC-${shortShop}-${String(next).padStart(4, '0')}`;
  }, [receipts, shop.id]);

  const filteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return receipts
      .slice()
      .reverse()
      .filter(r => {
        const p = getPieceData(r);
        if (filter === 'pending' && p.pending === 0) return false;
        if (filter === 'done' && p.pending > 0) return false;
        if (!q) return true;
        return [r.receiptNumber, r.customerName, r.productName, r.date].some(v =>
          String(v || '').toLowerCase().includes(q),
        );
      });
  }, [receipts, filter, searchQuery]);

  const formTotal = (Number(quantity) || 0) * (Number(price) || 0);

  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingReceipt(true);
    try {
      await apiFetch(`/api/shops/${encodeURIComponent(shop.id)}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          productName,
          date: receiptDate,
          quantity: Number(quantity),
          price: Number(price),
        }),
      });
      setCustomerName('');
      setPrice('');
      setQuantity('1');
      setShowForm(false);
      await onRefreshSync();
      onToast('Receipt saved');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save receipt.', 'error');
    } finally {
      setSavingReceipt(false);
    }
  };

  const handleUpdateGiven = async (receiptId: string, value: number) => {
    setUpdatingGiven(true);
    try {
      await apiFetch(
        `/api/shops/${encodeURIComponent(shop.id)}/receipts/${encodeURIComponent(receiptId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({givenQuantity: value}),
        },
      );
      setGivenTarget(null);
      await onRefreshSync();
      onToast('Given pieces updated');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update.', 'error');
    } finally {
      setUpdatingGiven(false);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!deleteTarget) return;
    setDeletingReceipt(true);
    try {
      await apiFetch(
        `/api/shops/${encodeURIComponent(shop.id)}/receipts/${encodeURIComponent(deleteTarget.id)}`,
        {method: 'DELETE'},
      );
      setDeleteTarget(null);
      await onRefreshSync();
      onToast('Receipt deleted');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete receipt.', 'error');
    } finally {
      setDeletingReceipt(false);
    }
  };

  const triggerPrint = (r: Receipt) => {
    setPrintingReceipt(r);
    setTimeout(() => {
      window.print();
    }, 60);
  };

  return (
    <>
      <main className="no-print mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3.5 text-xs font-bold text-[var(--gb-ink)] hover:border-[var(--gb-gold-2)] hover:bg-[var(--gb-surface-2)]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>All shops</span>
          </button>

          <span className="text-xs font-bold text-[var(--gb-gold-ink)]">
            {shop.category} · {shop.status === 'active' ? 'Active' : 'Closed'}
          </span>
        </div>

        {/* Shop Hero */}
        <section className="mb-5 grid overflow-hidden rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] shadow-[var(--gb-shadow)] md:grid-cols-[320px_1fr]">
          <div className="flex min-h-[200px] items-center justify-center bg-[var(--gb-gold-soft)] overflow-hidden">
            {shop.image ? (
              <img
                src={shop.image}
                alt={shop.name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <Store className="h-14 w-14 text-[var(--gb-gold)]" />
            )}
          </div>
          <div className="flex flex-col justify-center p-5 sm:p-7">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--gb-ink)] sm:text-4xl">
              {shop.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--gb-muted)]">
              {shop.description || 'Manage customer receipts, deliveries, and pending pieces.'}
            </p>
            {(shop.address || shop.phone) && (
              <p className="mt-3 text-xs font-semibold text-[var(--gb-muted)]">
                {[shop.address, shop.phone].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </section>

        {/* Shop-specific Stats */}
        <section
          aria-label="Shop summary"
          className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <div className="rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-4">
            <span className="block text-xs font-semibold text-[var(--gb-muted)]">
              Receipts
            </span>
            <strong className="tabular-nums text-2xl font-extrabold text-[var(--gb-ink)]">
              {summary.count}
            </strong>
          </div>
          <div className="rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-4">
            <span className="block text-xs font-semibold text-[var(--gb-muted)]">
              Total sales
            </span>
            <strong className="tabular-nums text-2xl font-extrabold text-[var(--gb-gold-ink)]">
              {formatMoney(summary.sales)}
            </strong>
          </div>
          <div className="rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-4">
            <span className="block text-xs font-semibold text-[var(--gb-muted)]">
              Pieces given
            </span>
            <strong className="tabular-nums text-2xl font-extrabold text-[var(--gb-green)]">
              {summary.given}
            </strong>
          </div>
          <div className="rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-4">
            <span className="block text-xs font-semibold text-[var(--gb-muted)]">
              Pieces pending
            </span>
            <strong className="tabular-nums text-2xl font-extrabold text-[var(--gb-red)]">
              {summary.pending}
            </strong>
          </div>
        </section>

        {/* Receipts Panel */}
        <section className="rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-4 shadow-[var(--gb-shadow)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-[var(--gb-ink)]">
                Receipts
              </h2>
              <p className="text-xs text-[var(--gb-muted)]">
                {filteredReceipts.length === receipts.length
                  ? `${receipts.length} ${receipts.length === 1 ? 'receipt' : 'receipts'}`
                  : `${filteredReceipts.length} of ${receipts.length} receipts`}
              </p>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setReceiptDate(localDateString());
                  setProductName(shop.category || 'Quail Egg');
                  setShowForm(!showForm);
                }}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white shadow-sm"
                style={{
                  background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                }}
              >
                <Plus className="h-4 w-4" />
                <span>{showForm ? 'Close form' : 'New receipt'}</span>
              </button>
            )}
          </div>

          {!isAdmin && (
            <div className="mb-4 rounded-xl bg-[var(--gb-gold-soft)] px-4 py-3 text-xs font-semibold text-[var(--gb-gold-ink)]">
              You can view and print receipts. Only an admin can create receipts, update given pieces, or delete receipts.
            </div>
          )}

          {isAdmin && showForm && (
            <form
              onSubmit={handleSaveReceipt}
              className="mb-5 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-4 sm:p-5"
            >
              <h3 className="text-base font-bold text-[var(--gb-ink)]">New receipt</h3>
              <p className="mb-4 text-xs text-[var(--gb-muted)]">
                Enter purchase and product details.
              </p>

              <div className="grid gap-3.5 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                    Receipt number
                  </label>
                  <input
                    readOnly
                    value={nextNumberPreview}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-gold-soft)] px-3 text-sm font-bold text-[var(--gb-gold-ink)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                    Shop
                  </label>
                  <input
                    readOnly
                    value={shop.name}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-gold-soft)] px-3 text-sm font-bold text-[var(--gb-gold-ink)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={e => setReceiptDate(e.target.value)}
                    required
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                    Purchase number
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Enter purchase number"
                    required
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                    Product
                  </label>
                  <select
                    value={productName}
                    onChange={e => setProductName(e.target.value as ProductCategory)}
                    required
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--gb-gold)]"
                  >
                    {PRODUCT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                    Price per piece (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    required
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                    Pieces
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    required
                    className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-sm outline-none focus:border-[var(--gb-gold)]"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--gb-gold-soft)] px-4 py-3 text-sm font-bold text-[var(--gb-gold-ink)]">
                <span>Total amount</span>
                <strong className="tabular-nums text-2xl font-extrabold">
                  {formatMoney(formTotal)}
                </strong>
              </div>

              <div className="mt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-4 text-xs font-bold text-[var(--gb-ink)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReceipt}
                  className="min-h-[42px] rounded-xl px-5 text-xs font-bold text-white disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                  }}
                >
                  {savingReceipt ? 'Saving…' : 'Save receipt'}
                </button>
              </div>
            </form>
          )}

          {/* Search + Status Filter */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gb-muted)]" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search receipt, purchase number or product"
                className="w-full min-h-[40px] rounded-full border border-[var(--gb-line)] bg-[var(--gb-surface-2)] pl-10 pr-4 text-sm outline-none focus:border-[var(--gb-gold)]"
              />
            </div>
            <div className="flex gap-1.5">
              {[
                {id: 'all' as const, label: 'All'},
                {id: 'pending' as const, label: 'Pending'},
                {id: 'done' as const, label: 'Completed'},
              ].map(tabItem => (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => setFilter(tabItem.id)}
                  className={`min-h-[38px] rounded-full border px-3.5 text-xs font-bold transition ${
                    filter === tabItem.id
                      ? 'border-[var(--gb-gold)] bg-[var(--gb-gold)] text-white'
                      : 'border-[var(--gb-line)] bg-[var(--gb-surface)] text-[var(--gb-muted)]'
                  }`}
                >
                  {tabItem.label}
                </button>
              ))}
            </div>
          </div>

          {/* Receipt Cards */}
          {!filteredReceipts.length ? (
            <div className="rounded-xl border border-dashed border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-10 text-center text-sm text-[var(--gb-muted)]">
              {receipts.length
                ? 'No receipts match your search or filter.'
                : isAdmin
                  ? 'No receipts yet. Tap New receipt to add the first one.'
                  : 'No receipts for this shop yet.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReceipts.map(r => {
                const p = getPieceData(r);
                const done = p.pending === 0;
                return (
                  <article
                    key={r.id}
                    className="grid items-center gap-4 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-4 transition hover:border-[var(--gb-gold-2)] lg:grid-cols-[1.15fr_1fr_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-[var(--gb-ink)]">
                          {r.receiptNumber}
                        </h3>
                        <span
                          className={`text-xs font-bold ${
                            done ? 'text-[var(--gb-green)]' : 'text-[var(--gb-amber)]'
                          }`}
                        >
                          · {done ? 'All pieces given' : 'Pieces pending'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--gb-muted)]">
                        <span className="font-bold text-[var(--gb-gold-ink)]">
                          {r.productName}
                        </span>
                        <span>Purchase {r.customerName}</span>
                        <span>{r.date}</span>
                        <span className="tabular-nums">{formatMoney(r.price)} / piece</span>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex justify-between text-xs font-bold tabular-nums">
                        <span className="text-[var(--gb-green)]">{p.given} given</span>
                        <span className="text-[var(--gb-red)]">{p.pending} pending</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--gb-line)]">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${p.percent}%`,
                            background: 'linear-gradient(90deg, var(--gb-green), #54bd7c)',
                          }}
                        />
                      </div>
                      <div className="mt-1.5 flex justify-between text-[11px] text-[var(--gb-muted)] tabular-nums">
                        <span>{p.percent}% complete</span>
                        <span>
                          {p.given} of {p.total}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 lg:flex-col lg:items-end">
                      <div className="tabular-nums text-xl font-extrabold text-[var(--gb-gold-ink)]">
                        {formatMoney(p.total * (Number(r.price) || 0))}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => triggerPrint(r)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 text-xs font-bold text-[var(--gb-ink)] hover:border-[var(--gb-gold-2)]"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>Print</span>
                        </button>

                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateGiven(r.id, done ? 0 : p.total)
                              }
                              className={`min-h-[36px] rounded-lg px-3 text-xs font-bold ${
                                done
                                  ? 'border border-[var(--gb-line)] bg-[var(--gb-surface)] text-[var(--gb-ink)]'
                                  : 'bg-[var(--gb-green-soft)] text-[var(--gb-green)]'
                              }`}
                            >
                              {done ? 'Mark pending' : 'Mark completed'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setGivenTarget(r);
                                setGivenInput(p.given);
                              }}
                              className="min-h-[36px] rounded-lg bg-[var(--gb-green-soft)] px-3 text-xs font-bold text-[var(--gb-green)]"
                            >
                              Update given
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(r)}
                              className="min-h-[36px] rounded-lg bg-[var(--gb-red-soft)] px-3 text-xs font-bold text-[var(--gb-red)]"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Update Given Pieces Dialog */}
      {givenTarget && (
        <div
          className="no-print fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) setGivenTarget(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-2xl">
            <h3 className="font-display text-xl font-bold text-[var(--gb-ink)]">
              Update given pieces
            </h3>
            <p className="mt-1 text-xs text-[var(--gb-muted)]">
              {givenTarget.receiptNumber} · {givenTarget.productName}
            </p>

            {(() => {
              const p = getPieceData(givenTarget);
              return (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-[var(--gb-surface-2)] p-2.5">
                      <span className="block text-[11px] font-semibold text-[var(--gb-muted)]">
                        Total
                      </span>
                      <strong className="tabular-nums text-lg">{p.total}</strong>
                    </div>
                    <div className="rounded-xl bg-[var(--gb-surface-2)] p-2.5">
                      <span className="block text-[11px] font-semibold text-[var(--gb-muted)]">
                        Given
                      </span>
                      <strong className="tabular-nums text-lg text-[var(--gb-green)]">
                        {givenInput}
                      </strong>
                    </div>
                    <div className="rounded-xl bg-[var(--gb-surface-2)] p-2.5">
                      <span className="block text-[11px] font-semibold text-[var(--gb-muted)]">
                        Pending
                      </span>
                      <strong className="tabular-nums text-lg text-[var(--gb-red)]">
                        {Math.max(0, p.total - givenInput)}
                      </strong>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-bold text-[var(--gb-muted)]">
                      Total pieces given so far
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={p.total}
                      value={givenInput}
                      onChange={e =>
                        setGivenInput(
                          Math.max(0, Math.min(p.total, Number(e.target.value) || 0)),
                        )
                      }
                      className="w-full min-h-[42px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3 text-sm font-bold outline-none focus:border-[var(--gb-gold)]"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGivenInput(Math.max(0, givenInput - 1))}
                      className="min-h-[36px] rounded-lg border border-[var(--gb-line)] px-3 text-xs font-bold"
                    >
                      −1
                    </button>
                    <button
                      type="button"
                      onClick={() => setGivenInput(Math.min(p.total, givenInput + 1))}
                      className="min-h-[36px] rounded-lg border border-[var(--gb-line)] px-3 text-xs font-bold"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => setGivenInput(Math.min(p.total, givenInput + 10))}
                      className="min-h-[36px] rounded-lg border border-[var(--gb-line)] px-3 text-xs font-bold"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => setGivenInput(p.total)}
                      className="min-h-[36px] rounded-lg bg-[var(--gb-green-soft)] px-3 text-xs font-bold text-[var(--gb-green)]"
                    >
                      All given
                    </button>
                    <button
                      type="button"
                      onClick={() => setGivenInput(0)}
                      className="min-h-[36px] rounded-lg border border-[var(--gb-line)] px-3 text-xs font-bold"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setGivenTarget(null)}
                      className="min-h-[40px] rounded-xl border border-[var(--gb-line)] px-4 text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={updatingGiven}
                      onClick={() => void handleUpdateGiven(givenTarget.id, givenInput)}
                      className="min-h-[40px] rounded-xl px-5 text-xs font-bold text-white disabled:opacity-60"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
                      }}
                    >
                      {updatingGiven ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Delete Receipt Dialog */}
      {deleteTarget && (
        <div
          className="no-print fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-2xl">
            <h3 className="font-display text-xl font-bold text-[var(--gb-ink)]">
              Delete receipt?
            </h3>
            <p className="mt-2 text-sm text-[var(--gb-muted)]">
              {deleteTarget.receiptNumber} will be removed for everyone. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[40px] rounded-xl border border-[var(--gb-line)] px-4 text-xs font-bold"
              >
                Keep receipt
              </button>
              <button
                type="button"
                disabled={deletingReceipt}
                onClick={() => void handleDeleteReceipt()}
                className="min-h-[40px] rounded-xl bg-[var(--gb-red)] px-4 text-xs font-bold text-white disabled:opacity-60"
              >
                {deletingReceipt ? 'Deleting…' : 'Delete receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Receipt Template */}
      {printingReceipt && (
        <div
          id="print-receipt-area"
          className="hidden p-6 text-black font-sans"
        >
          {(() => {
            const p = getPieceData(printingReceipt);
            const priceVal = Number(printingReceipt.price) || 0;
            return (
              <div className="mx-auto max-w-md">
                <div className="mb-6 text-center">
                  <h1 className="text-2xl font-bold">{printingReceipt.shopName}</h1>
                  <p className="text-sm">Good Bites — Customer Receipt</p>
                </div>
                <div className="my-3 border-t border-dashed border-neutral-500" />
                <div className="flex justify-between py-1.5 text-sm">
                  <span>Receipt number</span>
                  <strong>{printingReceipt.receiptNumber}</strong>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span>Date</span>
                  <strong>{printingReceipt.date}</strong>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span>Purchase number</span>
                  <strong>{printingReceipt.customerName}</strong>
                </div>
                <div className="my-3 border-t border-dashed border-neutral-500" />
                <div className="flex justify-between py-1.5 text-sm">
                  <span>Product</span>
                  <strong>{printingReceipt.productName}</strong>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span>Price per piece</span>
                  <strong>{formatMoney(priceVal)}</strong>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span>Total pieces</span>
                  <strong>{p.total} pieces</strong>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span>Given pieces</span>
                  <strong>{p.given} pieces</strong>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span>Pending pieces</span>
                  <strong>{p.pending} pieces</strong>
                </div>
                <div className="my-3 border-t border-dashed border-neutral-500" />
                <div className="flex justify-between py-2 text-base">
                  <span>Total amount</span>
                  <strong>{formatMoney(p.total * priceVal)}</strong>
                </div>
                <div className="my-3 border-t border-dashed border-neutral-500" />
                <div className="mt-6 text-center text-sm">Thank you!</div>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
};
