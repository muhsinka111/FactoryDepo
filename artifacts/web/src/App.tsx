import { useEffect } from 'react';
import { Switch, Route, Redirect, useLocation } from 'wouter';
import { useMe, getToken } from '@workspace/api-client-react';
import {
  Topbar, CategoryRail, Sidebar, BottomNav, AuthGateModal,
  activeKeyFor, dashboardRole, navFor, homeFor,
} from './components';
import Explore from './pages/Explore';
import ProductDetail from './pages/ProductDetail';
import Suppliers from './pages/Suppliers';
import SupplierDetail from './pages/SupplierDetail';
import RfqExchange from './pages/RfqExchange';
import RfqDetail from './pages/RfqDetail';
import Orders from './pages/Orders';
import Feed from './pages/Feed';
import Help from './pages/Help';
import { SignIn, SignUp } from './pages/Auth';
import ComingSoon from './pages/ComingSoon';

/** Views that show the category rail, matching the reference template. */
const RAIL_VIEWS = ['/explore', '/feed', '/suppliers'];
const GUEST_ONLY = ['/sign-in', '/sign-up'];

/**
 * The static marketing landing links to the older paths (/products, /rfq/:id).
 * These keep those links working — including their query strings, so
 * /products?q=copper and /products?category=… still arrive pre-filtered.
 */
function LegacyProducts() {
  return <Redirect to={`/explore${window.location.search}`} />;
}

function LegacyRfqDetail() {
  const [loc] = useLocation();
  const id = loc.split('/')[2] ?? '';
  return <Redirect to={`/rfqs/${id}`} />;
}

function Shell() {
  const [location, navigate] = useLocation();
  const { data: user } = useMe();
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const nav = navFor(dash);
  const activeKey = activeKeyFor(nav, location);
  const showRail = RAIL_VIEWS.some((p) => location === p || location.startsWith(p + '/'));

  // A signed-in user landing on a guest-only path gets sent to their dashboard home.
  useEffect(() => {
    if (loggedIn && GUEST_ONLY.includes(location)) navigate(homeFor(dash));
  }, [loggedIn, location, dash, navigate]);

  return (
    <>
      <Topbar role={dash ?? undefined} />
      {showRail && <CategoryRail />}
      <AuthGateModal />
      <div className="shell">
        {loggedIn && dash && (
          <Sidebar
            items={nav}
            activeKey={activeKey}
            who={{
              name: user?.name ?? 'Account',
              meta: dash === 'supplier' ? 'Supplier account' : dash === 'admin' ? 'Full access' : 'Buyer account',
            }}
          />
        )}
        <main className="main">
          <Switch>
            {/* ---------- public marketplace ---------- */}
            <Route path="/explore" component={Explore} />
            <Route path="/products/:id" component={ProductDetail} />
            <Route path="/suppliers/:id" component={SupplierDetail} />
            <Route path="/suppliers" component={Suppliers} />
            <Route path="/help" component={Help} />
            <Route path="/sign-in" component={SignIn} />
            <Route path="/sign-up" component={SignUp} />

            {/* ---------- buyer ---------- */}
            <Route path="/feed" component={Feed} />
            <Route path="/rfqs" component={RfqExchange} />
            <Route path="/rfqs/:id" component={RfqDetail} />
            <Route path="/orders" component={Orders} />
            <Route path="/offers" component={() => <ComingSoon title="My offers" note="The offers and counter-offers table lands in the next build phase." />} />
            <Route path="/shipments" component={() => <ComingSoon title="Shipments" note="Shipment milestones and documents land in the next build phase." />} />
            <Route path="/messages" component={() => <ComingSoon title="Messages" note="Buyer ↔ supplier messaging lands in the next build phase." />} />
            <Route path="/saved" component={() => <ComingSoon title="Saved lots" note="Saved lots land in the next build phase." />} />
            <Route path="/notifications" component={() => <ComingSoon title="Notifications" note="The notification centre lands in the next build phase." />} />
            <Route path="/profile" component={() => <ComingSoon title="Profile" note="Profile editing lands in the next build phase." />} />

            {/* ---------- supplier ---------- */}
            <Route path="/supplier/listings" component={() => <ComingSoon title="My listings" note="Supplier product CRUD with ownership checks lands in the next build phase." />} />
            <Route path="/supplier/post" component={() => <ComingSoon title="Post stock" note="Listing create/edit with image upload lands in the next build phase." />} />
            <Route path="/supplier/offers" component={() => <ComingSoon title="Offers on your stock" note="Lands in the next build phase." />} />
            <Route path="/supplier/rfq-opportunities" component={RfqExchange} />
            <Route path="/supplier/verification" component={() => <ComingSoon title="Verification" note="Verification tiers and document submission land in the next build phase." />} />

            {/* ---------- admin ---------- */}
            <Route path="/admin" component={() => <ComingSoon title="Marketplace overview" note="The admin console lands in the next build phase." />} />
            <Route path="/admin/suppliers" component={() => <ComingSoon title="Suppliers" note="The admin console lands in the next build phase." />} />
            <Route path="/admin/verification" component={() => <ComingSoon title="Verification desk" note="The admin console lands in the next build phase." />} />
            <Route path="/admin/listings" component={() => <ComingSoon title="Listings" note="The admin console lands in the next build phase." />} />
            <Route path="/admin/rfqs" component={() => <ComingSoon title="RFQs" note="The admin console lands in the next build phase." />} />
            <Route path="/admin/sources" component={() => <ComingSoon title="Supply sources" note="Manual supplier intake lands in the next build phase." />} />
            <Route path="/admin/growth" component={() => <ComingSoon title="Banners and promos" note="The admin console lands in the next build phase." />} />
            <Route path="/admin/features" component={() => <ComingSoon title="Features" note="Feature flags land in the next build phase." />} />

            {/* ---------- legacy redirects (the marketing landing links here) ---------- */}
            <Route path="/products" component={LegacyProducts} />
            <Route path="/rfq" component={() => <Redirect to="/rfqs" />} />
            <Route path="/rfq/:id" component={LegacyRfqDetail} />
            <Route path="/dashboard" component={() => <Redirect to={homeFor(dash)} />} />
            <Route path="/" component={() => <Redirect to={loggedIn ? homeFor(dash) : '/explore'} />} />
            <Route component={() => <Redirect to="/explore" />} />
          </Switch>
        </main>
      </div>
      {loggedIn && dash && <BottomNav items={nav} activeKey={activeKey} />}
    </>
  );
}

export default function App() {
  return <Shell />;
}
