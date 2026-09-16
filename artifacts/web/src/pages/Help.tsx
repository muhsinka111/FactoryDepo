import { Link } from 'wouter';
import { View } from '../components';

/**
 * Help centre — plain-language, honest description of what the marketplace
 * actually does today. Nothing here should promise a capability that is not
 * built; keep it in step with the app.
 */
export default function Help() {
  return (
    <View title="How FactoryDepo works" sub="Ready stock, requests for quotation, and inspection-backed supply.">
      <div className="cols">
        <div className="card">
          <div className="hd"><h2>Buying</h2></div>
          <div className="bd" style={{ lineHeight: 1.7 }}>
            <p><b>1. Browse ready stock.</b> Every live lot shows its price, minimum order quantity, origin country and how much is actually available. Listings marked <span className="pill p-amber">Demo</span> are seed data — not real offers — and are labelled so you are never misled.</p>
            <p><b>2. Ask for a quotation.</b> Post a request describing what you need. Suppliers quote against it with a price, a lead time and their terms.</p>
            <p><b>3. Compare and commit.</b> Quotes are visible side by side on the request. Accepting one creates an order.</p>
            <p><b>4. Pay by bank transfer.</b> Industrial trade does not run on cards. You receive a proforma invoice, settle by TT/wire, and the order is marked paid once funds are confirmed.</p>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>Selling</h2></div>
          <div className="bd" style={{ lineHeight: 1.7 }}>
            <p><b>1. Create a supplier account.</b> Signing up as a supplier creates your company profile immediately.</p>
            <p><b>2. Post your stock.</b> Listing tools are being built now — until they ship, supplier listings are added by our team during onboarding.</p>
            <p><b>3. Quote incoming requests.</b> Open buyer requests appear in your dashboard with a live count of how many you have not answered.</p>
            <p><b>4. Get verified.</b> Verification tiers unlock visibility. Badges are granted only when documents are approved, so a badge on this site means something.</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd"><h2>What is not live yet</h2></div>
        <div className="bd" style={{ lineHeight: 1.7 }}>
          <p className="muted" style={{ marginBottom: 8 }}>
            We would rather say this plainly than have you discover it:
          </p>
          <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <li>Supplier self-service listing tools are in development.</li>
            <li>Buyer ↔ supplier messaging is not available yet — use the contact details on a supplier profile.</li>
            <li>Offers and counter-offers are handled manually at the moment.</li>
            <li>Shipment tracking and document handling are not built.</li>
          </ul>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <Link href="/explore" className="btn btn-primary">Explore stock</Link>
        <Link href="/rfqs" className="btn btn-grey">Requests for quotation</Link>
      </div>
    </View>
  );
}
