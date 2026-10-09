import { useState } from "react";
import { StoreProvider, useStore } from "./store";
import { ToastProvider, ConfirmProvider } from "./components/ui";
import Layout, { NavKey } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Stock from "./pages/Stock";
import Sales from "./pages/Sales";
import Purchases from "./pages/Purchases";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import UsersPage from "./pages/Users";
import Losses from "./pages/Losses";
import Inventory from "./pages/Inventory";
import Settings from "./pages/Settings";
import MySpace from "./pages/MySpace";

export type StockFilter = "all" | "low" | "expiring" | "out";
export type NavOptions = { salesTab?: "pos" | "history"; stockFilter?: StockFilter };

function AppRouter() {
  const { isLoggedIn } = useStore();
  const [active, setActive] = useState<NavKey>("dashboard");
  // Chaque fois que l'utilisateur se connecte, on revient au tableau de bord
  // (géré par useState default + reset dans useEffect si besoin)
  const [salesTab, setSalesTab] = useState<"pos" | "history">("pos");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");

  if (!isLoggedIn) return <Login />;

  const navigate = (key: NavKey, opts?: NavOptions) => {
    if (key === "sales") setSalesTab(opts?.salesTab ?? "pos");
    if (key === "stock") setStockFilter(opts?.stockFilter ?? "all");
    setActive(key);
  };

  const page = () => {
    switch (active) {
      case "dashboard": return <Dashboard navigate={navigate} />;
      case "products": return <Products />;
      case "stock": return <Stock initialFilter={stockFilter} />;
      case "sales": return <Sales initialTab={salesTab} />;
      case "purchases": return <Purchases />;
      case "customers": return <Customers />;
      case "suppliers": return <Suppliers />;
      case "users": return <UsersPage />;
      case "losses": return <Losses />;
      case "inventory": return <Inventory />;
      case "settings": return <Settings />;
      case "myspace": return <MySpace navigate={(key: string) => navigate(key as NavKey)} />;
      default: return <Dashboard navigate={navigate} />;
    }
  };

  return (
    <Layout active={active} setActive={setActive}>
      {page()}
    </Layout>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AppRouter />
        </ConfirmProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
