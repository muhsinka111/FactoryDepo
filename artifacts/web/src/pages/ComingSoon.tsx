import { View } from '../components';
import { useI18n, titleLabel, noteLabel, translate } from '../i18n';

/**
 * Honest placeholder for dashboard views whose tables and endpoints are built in
 * a later phase. It exists so the navigation structure is visible without
 * pretending the feature is finished.
 *
 * `title` and `note` arrive as English literals from the route table (App.tsx,
 * owned elsewhere). They are matched against the dictionary by that English
 * source text so the placeholders are translated without touching the routes;
 * anything unrecognised is shown exactly as passed in.
 */
export default function ComingSoon({ title, note }: { title: string; note?: string }) {
  const { lang } = useI18n();
  const fallbackNote = translate(lang, 'soon.body');
  return (
    <View title={titleLabel(lang, title)} sub={translate(lang, 'soon.sub')}>
      <div className="card">
        <div className="empty">
          <b>{translate(lang, 'soon.title')}</b>
          {note ? noteLabel(lang, note) : fallbackNote}
        </div>
      </div>
    </View>
  );
}
