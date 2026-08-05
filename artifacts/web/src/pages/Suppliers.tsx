import { useSuppliers } from '@workspace/api-client-react';
import { Page, SectionHead, SupplierCard, Spinner } from '../components';

export default function Suppliers() {
  const res = useSuppliers();
  return (
    <Page wide>
      <SectionHead
        eyebrow="Verified Directory"
        title={<>Verified <span style={{ color: 'var(--accent-ink)' }}>suppliers</span> worldwide.</>}
        sub="Every supplier profile is verified in-country. Trust Scores are earned through on-site audits, inspections, export history and buyer reviews — never bought."
      />
      {res.isLoading ? <Spinner /> : (
        <div className="grid-suppliers">
          {res.data?.items.map((s) => <SupplierCard key={s.id} s={s} />)}
        </div>
      )}
    </Page>
  );
}
