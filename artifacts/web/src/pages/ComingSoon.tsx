import { View } from '../components';

/**
 * Honest placeholder for dashboard views whose tables and endpoints are built in
 * a later phase. It exists so the navigation structure is visible without
 * pretending the feature is finished.
 */
export default function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <View title={title} sub="Not built yet">
      <div className="card">
        <div className="empty">
          <b>This view is part of the next build phase</b>
          {note ?? 'The screen exists in the navigation, but its data tables and API endpoints have not been built yet.'}
        </div>
      </div>
    </View>
  );
}
