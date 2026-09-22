import { Suspense, lazy, useEffect } from 'react';
import { Switch, Route, Redirect, useLocation } from 'wouter';
import { useMe, getToken } from '@workspace/api-client-react';
import { useI18n } from './i18n';
import {
  Topbar, CategoryRail, Sidebar, BottomNav, AuthGateModal, Spinner,
  activeKeyFor, dashboardRole, navFor, homeFor,
} from './components';
// Eager: everything an anonymous visitor needs for first paint.
import Explore from './pages/Explore';
import Categories from './pages/Categories';
import ProductDetail from './pages/ProductDetail';
import Suppliers from './pages/Suppliers';
import SupplierDetail from './pages/SupplierDetail';
import RfqExchange from './pages/RfqExchange';
import RfqDetail from './pages/RfqDetail';
import Orders from './pages/Orders';
import Feed from './pages/Feed';
import Help from './pages/Help';
import { SignIn, SignUp } from './pages/Auth';

/**
 * Lazy: the signed-in dashboards. An anonymous visitor browsing the marketplace
 * never downloads the admin console or the supplier tooling — that alone is
 * roughly half the JavaScript. Vite emits one chunk per page, fetched on the
 * first visit to that route.
 */
// buyer
const Offers = lazy(() => import('./pages/Offers'));
const Messages = lazy(() => import('./pages/Messages'));
const Shipments = lazy(() => import('./pages/Shipments'));
const Saved = lazy(() => import('./pages/Saved'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));
// supplier
const SupplierListings = lazy(() => import('./pages/SupplierListings'));
const SupplierPost = lazy(() => import('./pages/SupplierPost'));
const ShopProfile = lazy(() => import('./pages/ShopProfile'));
const SupplierOffers = lazy(() => import('./pages/SupplierOffers'));
const SupplierVerification = lazy(() => import('./pages/SupplierVerification'));
// admin
const AdminOverview = lazy(() => import('./pages/AdminOverview'));
const AdminSuppliers = lazy(() => import('./pages/AdminSuppliers'));
const AdminVerification = lazy(() => import('./pages/AdminVerification'));
const AdminListings = lazy(() => import('./pages/AdminListings'));
const AdminRfqs = lazy(() => import('./pages/AdminRfqs'));
const AdminPayments = lazy(() => import('./pages/AdminPayments'));
const AdminSources = lazy(() => import('./pages/AdminSources'));
const AdminGrowth = lazy(() => import('./pages/AdminGrowth'));
const AdminFeatures = lazy(() => import('./pages/AdminFeatures'));

/** Views that show the category rail, matching the reference template. */
const RAIL_VIEWS = ['/explore', '/feed', '/suppliers', '/categories'];
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
  const { t } = useI18n();
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
              // The sidebar is on every signed-in page, so nothing here may be a
              // hardcoded English literal — it would leak into every translated UI.
              name: user?.name ?? t('side.account'),
              meta: dash === 'supplier'
                ? t('side.supplierAccount')
                : dash === 'admin' ? t('side.fullAccess') : t('side.buyerAccount'),
            }}
          />
        )}
        <main className="main">
          {/* Lazy dashboard pages render a spinner while their chunk loads. */}
          <Suspense fallback={<Spinner />}>
            <Switch>
            {/* ---------- public marketplace ---------- */}
            <Route path="/explore" component={Explore} />
            <Route path="/categories" component={Categories} />
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
            <Route path="/offers" component={Offers} />
            <Route path="/shipments" component={Shipments} />
            <Route path="/messages" component={Messages} />
            <Route path="/saved" component={Saved} />
            <Route path="/notifications" component={Notifications} />
            <Route path="/profile" component={Profile} />

            {/* ---------- supplier ---------- */}
            <Route path="/supplier/listings" component={SupplierListings} />
            <Route path="/supplier/post" component={SupplierPost} />
            <Route path="/supplier/shop" component={ShopProfile} />
            <Route path="/supplier/offers" component={SupplierOffers} />
            <Route path="/supplier/rfq-opportunities" component={RfqExchange} />
            <Route path="/supplier/verification" component={SupplierVerification} />

            {/* ---------- admin ---------- */}
            <Route path="/admin" component={AdminOverview} />
            <Route path="/admin/suppliers" component={AdminSuppliers} />
            <Route path="/admin/verification" component={AdminVerification} />
            <Route path="/admin/listings" component={AdminListings} />
            <Route path="/admin/rfqs" component={AdminRfqs} />
            <Route path="/admin/payments" component={AdminPayments} />
            <Route path="/admin/sources" component={AdminSources} />
            <Route path="/admin/growth" component={AdminGrowth} />
            <Route path="/admin/features" component={AdminFeatures} />

            {/* ---------- legacy redirects (the marketing landing links here) ---------- */}
            <Route path="/products" component={LegacyProducts} />
            <Route path="/rfq" component={() => <Redirect to="/rfqs" />} />
            <Route path="/rfq/:id" component={LegacyRfqDetail} />
            <Route path="/dashboard" component={() => <Redirect to={homeFor(dash)} />} />
            <Route path="/" component={() => <Redirect to={loggedIn ? homeFor(dash) : '/explore'} />} />
            <Route component={() => <Redirect to="/explore" />} />
          </Switch>
          </Suspense>
        </main>
      </div>
      {loggedIn && dash && <BottomNav items={nav} activeKey={activeKey} />}
    </>
  );
}

export default function App() {
  return <Shell />;
}
