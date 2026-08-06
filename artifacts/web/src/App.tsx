import { Switch, Route, Redirect } from 'wouter';
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

export default function App() {
  return (
    <>
      <Nav />
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
        <Route path="/landing">
          <Redirect to="/" />
        </Route>
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
      <Footer />
    </>
  );
}
