import { Switch, Route, Redirect, useLocation } from 'wouter';
import { Nav, Footer, AuthGateModal } from './components';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Suppliers from './pages/Suppliers';
import SupplierDetail from './pages/SupplierDetail';
import RfqExchange from './pages/RfqExchange';
import RfqDetail from './pages/RfqDetail';
import { SignIn, SignUp } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Feed from './pages/Feed';

/** Mobil feed tam ekran deneyimi — Nav/Footer'ı gizler. */
function Shell() {
  const [location] = useLocation();
  const isFeed = location.startsWith('/feed');
  return (
    <>
      {!isFeed && <Nav />}
      <AuthGateModal />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/products" component={Products} />
        <Route path="/products/:id" component={ProductDetail} />
        <Route path="/suppliers" component={Suppliers} />
        <Route path="/suppliers/:id" component={SupplierDetail} />
        <Route path="/rfq" component={RfqExchange} />
        <Route path="/rfq/:id" component={RfqDetail} />
        <Route path="/sign-in" component={SignIn} />
        <Route path="/sign-up" component={SignUp} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/feed" component={Feed} />
        <Route path="/landing">
          <Redirect to="/" />
        </Route>
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
      {!isFeed && <Footer />}
    </>
  );
}

export default function App() {
  return <Shell />;
}
