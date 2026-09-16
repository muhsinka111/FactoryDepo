import { useState } from 'react';
import { Link } from 'wouter';
import {
  useProducts,
  useDeleteProduct,
  useMe,
  getToken,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import type { Product } from '@workspace/api-zod';
import {
  View,
  Empty,
  StatusChip,
  DemoTag,
  Spinner,
  requireAuthGate,
} from '../components';
import { ListingForm } from './SupplierPost';

/**
 * My listings — every lot that belongs to the signed-in supplier's own supplier
 * row. GET /api/products?mine=1 scopes the list server-side from the token, so
 * this page can never show another supplier's stock.
 *
 * Edit reuses the Post stock form in an `?id=`-free inline modal: the row being
 * edited is already in memory from this very list, so there is no second fetch
 * and no route change — the form itself (SupplierPost's ListingForm) is shared.
 *
 * Honesty rules applied here
 *  • `total` is the number the API reports for the filter, never the page length.
 *  • A lot with dataSource 'demo' is labelled <DemoTag />; supplier-posted lots
 *    are 'platform' and carry no tag.
 *  • Nothing shows trust score, views, ratings or fulfilment — nothing computes
 *    those for a listing, so they are not rendered at all.
 *  • Available stock is rendered as '—' when the API reports 0, because 0 there
 *    means "not stated" as often as it means "sold out".
 */

const PAGE_SIZE = 20;

function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Available stock is the number the API holds for the lot, so a real 0 is shown
 * as 0 rather than hidden. Only a missing column would be '—', and the contract
 * makes quantityAvailable a required number.
 */
function qty(n: number | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '—';
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function errorText(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError> | undefined;
  if (err?.message) return err.message;
  return fallback;
}

/** The confirming delete modal. The consequence is stated before it happens. */
function DeleteModal({
  product,
  onClose,
  onDeleted,
}: {
  product: Product;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const del = useDeleteProduct();
  const [err, setErr] = useState('');

  const confirm = async () => {
    setErr('');
    try {
      await del.mutateAsync({ id: product.id });
      onDeleted();
    } catch (e) {
      // The API refuses with 409 listing_in_use when the lot has orders or offers.
      setErr(errorText(e, 'Could not delete this listing.'));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>Delete this listing?</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p style={{ marginTop: 0, fontSize: 12.5 }}>
            <b>{product.name}</b> — lot #{product.id}
          </p>
          <p className="muted" style={{ fontSize: 12.5 }}>
            This listing is removed permanently. It disappears from Explore and from your listing
            table immediately, and buyers can no longer order or negotiate on it. This cannot be
            undone.
          </p>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            A lot that already has orders or offers against it cannot be deleted — the API keeps it
            for the record. Mark it sold out instead by setting available stock to 0.
          </p>
          {err && <div className="errtext" style={{ marginTop: 8 }} role="alert">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={del.isPending}>Keep listing</button>
          <button className="btn btn-red" onClick={confirm} disabled={del.isPending}>
            {del.isPending ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Edit modal — the shared Post stock form, prefilled with this row. */
function EditModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(720px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>Edit listing — lot #{product.id}</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <ListingForm product={product} onCancel={onClose} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}

export default function SupplierListings() {
  const { data: user, isLoading: meLoading } = useMe();
  const loggedIn = !!getToken();
  const isSupplier = user?.role === 'supplier';

  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [notice, setNotice] = useState('');

  const res = useProducts(
    { mine: 1, page, limit: PAGE_SIZE },
    { enabled: loggedIn && isSupplier },
  );

  if (meLoading) {
    return (
      <View title="My listings">
        <Spinner />
      </View>
    );
  }

  if (!loggedIn || !user) {
    return (
      <View title="My listings" sub="The stock you have published on the marketplace">
        <Empty title="You are not signed in">
          Your listings are private to your supplier account. Sign in to see and manage them.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Flistings"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              Sign in
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Flistings" className="btn btn-sm btn-ghost">
              Create a supplier account
            </Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (!isSupplier) {
    return (
      <View title="My listings" sub="The stock you have published on the marketplace">
        <Empty title="Supplier accounts only">
          Your account is a {user.role} account. Listings are managed by the supplier that owns
          them, so there is nothing to show or edit here.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-ghost">Browse ready stock</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = res.data?.items ?? [];
  const total = res.data?.total ?? 0;
  const pages = res.data?.pages ?? 0;

  return (
    <View
      title="My listings"
      sub={
        res.isLoading
          ? 'Loading your stock…'
          : `${total.toLocaleString()} listing${total === 1 ? '' : 's'} published under your supplier profile`
      }
      actions={
        <div className="row">
          <button
            className="btn btn-sm btn-grey"
            onClick={() => res.refetch()}
            disabled={res.isFetching}
          >
            {res.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link href="/supplier/post" className="btn btn-sm btn-gold">+ Post stock</Link>
        </div>
      }
    >
      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="stripe">
        <span>
          <b>{res.isLoading ? '—' : total.toLocaleString()}</b> lots published
        </span>
        <span>
          <b>—</b> views · not tracked yet
        </span>
        <span>Buyers pay by bank transfer once an offer is accepted.</span>
      </div>

      {res.isLoading ? (
        <Spinner />
      ) : res.isError ? (
        <Empty title="Your listings could not be loaded">
          Could not load your listings — try again. If it keeps failing, sign in again.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-grey" onClick={() => res.refetch()}>Try again</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No listings yet">
          Post your first lot — a photo, a unit price and how much you can ship today. It goes live
          in Explore for every buyer on the marketplace.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/supplier/post" className="btn btn-sm btn-gold">+ Post your first lot</Link>
            <Link href="/supplier/verification" className="btn btn-sm btn-ghost">Get verified</Link>
          </div>
        </Empty>
      ) : (
        <>
          <div className="card">
            <div className="hd">
              <b>{total.toLocaleString()} listing{total === 1 ? '' : 's'}</b>
              <span className="muted" style={{ marginLeft: 'auto' }}>Newest first</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th className="hidem">Category</th>
                    <th style={{ textAlign: 'right' }}>Unit price</th>
                    <th style={{ textAlign: 'right' }} className="hidem">MOQ</th>
                    <th style={{ textAlign: 'right' }}>Available</th>
                    <th>Status</th>
                    <th className="hidem">Posted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="row" style={{ alignItems: 'flex-start', gap: 9 }}>
                          <span className="thumb">
                            {p.imageKey
                              ? <img src={p.imageKey} alt={p.name} loading="lazy" />
                              : null}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              <Link href={`/products/${p.id}`} className="strong">{p.name}</Link>
                              {p.dataSource === 'demo' && <DemoTag />}
                            </div>
                            <div className="muted">
                              lot #{p.id}{p.purityGrade ? ` · ${p.purityGrade}` : ''}
                              {p.originCountry ? ` · ${p.originCountry}` : ''}
                              {p.imageKey ? '' : ' · no photo'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidem muted">{p.category}</td>
                      <td style={{ textAlign: 'right' }} className="strong">
                        {money(p.currency, p.price)}
                        <div className="muted">/ {p.unit}</div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="hidem">
                        {p.moq.toLocaleString('en-US')} {p.unit}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {qty(p.quantityAvailable)}
                        {p.quantityAvailable > 0 ? <div className="muted">{p.unit}</div> : null}
                      </td>
                      <td><StatusChip status={p.status} /></td>
                      <td className="hidem muted" title={new Date(p.createdAt).toLocaleString()}>
                        {shortDate(p.createdAt)}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => { setNotice(''); setEditing(p); }}
                        >
                          Edit
                        </button>{' '}
                        <button
                          className="btn btn-sm btn-red"
                          onClick={() => { setNotice(''); setDeleting(p); }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pages > 1 && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 6 }}>
              <button
                className="btn btn-sm btn-grey"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ← Prev
              </button>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                Page {res.data?.page ?? page} of {pages}
              </span>
              <button
                className="btn btn-sm btn-grey"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          )}

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              A lot marked <span className="pill p-amber">Demo</span> is seed data supplied by the
              marketplace, not stock posted by you. Deleting it removes it for everyone.
            </span>
          </div>
        </>
      )}

      {editing && (
        <EditModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNotice('Listing updated.'); }}
        />
      )}

      {deleting && (
        <DeleteModal
          product={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); setNotice('Listing deleted. It is no longer on the marketplace.'); }}
        />
      )}
    </View>
  );
}
