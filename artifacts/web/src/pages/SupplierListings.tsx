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
import { useI18n } from '../i18n';

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
function qty(n: number | undefined, locale: string): string {
  return typeof n === 'number' ? n.toLocaleString(locale) : '—';
}

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
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
  const { t } = useI18n();
  const del = useDeleteProduct();
  const [err, setErr] = useState('');

  const confirm = async () => {
    setErr('');
    try {
      await del.mutateAsync({ id: product.id });
      onDeleted();
    } catch (e) {
      // The API refuses with 409 listing_in_use when the lot has orders or offers.
      setErr(errorText(e, t('listings.deleteErr')));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('listings.deleteTitle')}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p style={{ marginTop: 0, fontSize: 12.5 }}>
            <b>{t('listings.deleteLead', { name: product.name, id: product.id })}</b>
          </p>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {t('listings.deleteBody')}
          </p>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            {t('listings.deleteKeepBody')}
          </p>
          {err && <div className="errtext" style={{ marginTop: 8 }} role="alert">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={del.isPending}>{t('listings.keepListing')}</button>
          <button className="btn btn-red" onClick={confirm} disabled={del.isPending}>
            {del.isPending ? t('listings.deleting') : t('listings.deleteForever')}
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
  const { t } = useI18n();
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(720px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('listings.editTitle', { id: product.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <ListingForm product={product} onCancel={onClose} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}

export default function SupplierListings() {
  const { t, locale } = useI18n();
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
      <View title={t('listings.title')}>
        <Spinner />
      </View>
    );
  }

  if (!loggedIn || !user) {
    return (
      <View title={t('listings.title')} sub={t('listings.sub')}>
        <Empty title={t('listings.notSignedIn')}>
          {t('listings.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Flistings"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              {t('action.signIn')}
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Flistings" className="btn btn-sm btn-ghost">
              {t('listings.createSupplierAccount')}
            </Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (!isSupplier) {
    return (
      <View title={t('listings.title')} sub={t('listings.sub')}>
        <Empty title={t('listings.supplierOnly')}>
          {t('listings.supplierOnlyBody', { role: user.role })}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-ghost">{t('listings.browseStock')}</Link>
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
      title={t('listings.title')}
      sub={
        res.isLoading
          ? t('listings.subLoading')
          : t('listings.subCount', { n: total.toLocaleString(locale) })
      }
      actions={
        <div className="row">
          <button
            className="btn btn-sm btn-grey"
            onClick={() => res.refetch()}
            disabled={res.isFetching}
          >
            {res.isFetching ? t('action.refreshing') : t('action.refresh')}
          </button>
          <Link href="/supplier/post" className="btn btn-sm btn-gold">{t('listings.postStock')}</Link>
        </div>
      }
    >
      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      <div className="stripe">
        <span>
          <b>{res.isLoading ? '—' : total.toLocaleString(locale)}</b> {t('listings.lotsPublished')}
        </span>
        {/* Views are tracked (GET /api/products/:id writes product_views and the
            dashboard reports the real total), but the product contract exposes no
            per-listing count — so no per-row figure is shown rather than a fake one. */}
        <span>{t('listings.bankTransferNote')}</span>
      </div>

      {res.isLoading ? (
        <Spinner />
      ) : res.isError ? (
        <Empty title={t('listings.loadErrorTitle')}>
          {t('listings.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-grey" onClick={() => res.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('listings.emptyTitle')}>
          {t('listings.emptyBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/supplier/post" className="btn btn-sm btn-gold">{t('listings.postFirst')}</Link>
            <Link href="/supplier/verification" className="btn btn-sm btn-ghost">{t('listings.getVerified')}</Link>
          </div>
        </Empty>
      ) : (
        <>
          <div className="card">
            <div className="hd">
              <b>{t('listings.count', { n: total.toLocaleString(locale) })}</b>
              <span className="muted" style={{ marginLeft: 'auto' }}>{t('common.newestFirst')}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('listings.col.lot')}</th>
                    <th className="hidem">{t('listings.col.category')}</th>
                    <th style={{ textAlign: 'right' }}>{t('listings.col.unitPrice')}</th>
                    <th style={{ textAlign: 'right' }} className="hidem">{t('listings.col.moq')}</th>
                    <th style={{ textAlign: 'right' }}>{t('listings.col.available')}</th>
                    <th>{t('listings.col.status')}</th>
                    <th className="hidem">{t('listings.col.posted')}</th>
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
                              {t('listings.lotRef', { id: p.id })}{p.purityGrade ? ` · ${p.purityGrade}` : ''}
                              {p.originCountry ? ` · ${p.originCountry}` : ''}
                              {p.imageKey ? '' : ` · ${t('listings.noPhotoInline')}`}
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
                        {p.moq.toLocaleString(locale)} {p.unit}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {qty(p.quantityAvailable, locale)}
                        {p.quantityAvailable > 0 ? <div className="muted">{p.unit}</div> : null}
                      </td>
                      <td><StatusChip status={p.status} /></td>
                      <td className="hidem muted" title={new Date(p.createdAt).toLocaleString(locale)}>
                        {shortDate(p.createdAt, locale)}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => { setNotice(''); setEditing(p); }}
                        >
                          {t('action.edit')}
                        </button>{' '}
                        <button
                          className="btn btn-sm btn-red"
                          onClick={() => { setNotice(''); setDeleting(p); }}
                        >
                          {t('action.delete')}
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
                {t('explore.prev')}
              </button>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                {t('explore.page', {
                  page: (res.data?.page ?? page).toLocaleString(locale),
                  pages: pages.toLocaleString(locale),
                })}
              </span>
              <button
                className="btn btn-sm btn-grey"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                {t('explore.next')}
              </button>
            </div>
          )}

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              {t('listings.demoNoteLead')} <span className="pill p-amber">{t('cards.demo')}</span>{' '}
              {t('listings.demoNoteTail')}
            </span>
          </div>
        </>
      )}

      {editing && (
        <EditModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNotice(t('listings.updated')); }}
        />
      )}

      {deleting && (
        <DeleteModal
          product={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); setNotice(t('listings.deleted')); }}
        />
      )}
    </View>
  );
}
