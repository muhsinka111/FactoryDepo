import { Link } from 'wouter';
import { useCategoryCounts } from '@workspace/api-client-react';
import { CATEGORIES } from '@workspace/api-spec';
import { View, CategoryTile, Spinner, DemoNotice } from '../components';
import { useI18n } from '../i18n';

/**
 * Every category on one page, each with its cover and its real listing count.
 *
 * Ordering is by live stock (deepest first), so the buyer sees where the supply
 * actually is. A category the API does not report a count for keeps its tile
 * and simply shows no number — a fabricated "0 listings" would be a claim we did
 * not measure.
 */
export default function Categories() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useCategoryCounts();
  const counts = new Map((data?.items ?? []).map((c) => [c.category, c.count]));

  // CATEGORIES is the shared list (lib/api-spec) used by the rail, Explore and
  // the listing form, so this page can never drift from them.
  const ordered = [...CATEGORIES].sort((a, b) => (counts.get(b) ?? -1) - (counts.get(a) ?? -1));
  const total = data?.total ?? 0;

  return (
    <View
      title={t('categories.title')}
      sub={isLoading ? t('categories.loading') : t('categories.sub', { n: total.toLocaleString(locale) })}
    >
      <DemoNotice />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="catgrid">
          {ordered.map((c) => <CategoryTile key={c} category={c} count={counts.get(c)} />)}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="bd row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="muted">{t('categories.sellPrompt')}</span>
          <Link href="/supplier/post" className="btn btn-sm btn-gold">{t('categories.listStock')}</Link>
        </div>
      </div>
    </View>
  );
}