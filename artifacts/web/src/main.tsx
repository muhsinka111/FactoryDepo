import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { LocaleProvider } from './i18n';
import './styles.css';
// Enterprise extension layer (product page + dashboard kit). Additive only —
// styles.css stays the design authority for tokens and shared chrome.
import './styles/enterprise.css';
// Seller shop tools (shop editor, photo galleries, pulled-listing marking).
import './styles/shop.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* LocaleProvider sets <html lang dir> and persists the choice in fd:lang. */}
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
