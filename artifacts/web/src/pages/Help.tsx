import { Link } from 'wouter';
import { View } from '../components';
import { useI18n } from '../i18n';

/**
 * Help centre — plain-language, honest description of what the marketplace
 * actually does today. Nothing here should promise a capability that is not
 * built; keep it in step with the app.
 *
 * Each numbered step keeps its bold lead-in: the `.title` key carries the
 * emphasis ("1. Browse ready stock.") and the body key carries the sentence, so
 * the two halves are translated separately and the template's typography is
 * preserved in every language.
 */
export default function Help() {
  const { t } = useI18n();
  return (
    <View title={t('help.title')} sub={t('help.sub')}>
      <div className="cols">
        <div className="card">
          <div className="hd"><h2>{t('help.buying')}</h2></div>
          <div className="bd" style={{ lineHeight: 1.7 }}>
            <p><b>{t('help.buying1.title')}</b> {t('help.buying1')}</p>
            <p><b>{t('help.buying2.title')}</b> {t('help.buying2')}</p>
            <p><b>{t('help.buying3.title')}</b> {t('help.buying3')}</p>
            <p><b>{t('help.buying4.title')}</b> {t('help.buying4')}</p>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>{t('help.selling')}</h2></div>
          <div className="bd" style={{ lineHeight: 1.7 }}>
            <p><b>{t('help.selling1.title')}</b> {t('help.selling1')}</p>
            <p><b>{t('help.selling2.title')}</b> {t('help.selling2')}</p>
            <p><b>{t('help.selling3.title')}</b> {t('help.selling3')}</p>
            <p><b>{t('help.selling4.title')}</b> {t('help.selling4')}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd"><h2>{t('help.notLive')}</h2></div>
        <div className="bd" style={{ lineHeight: 1.7 }}>
          <p className="muted" style={{ marginBottom: 8 }}>
            {t('help.notLiveLead')}
          </p>
          <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <li>{t('help.notLive1')}</li>
            <li>{t('help.notLive2')}</li>
            <li>{t('help.notLive3')}</li>
            <li>{t('help.notLive4')}</li>
          </ul>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <Link href="/explore" className="btn btn-primary">{t('help.exploreCta')}</Link>
        <Link href="/rfqs" className="btn btn-grey">{t('help.rfqCta')}</Link>
      </div>
    </View>
  );
}
