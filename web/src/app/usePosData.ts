import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type {
  Batch, DashboardData, DashboardPeriod, Product, Sale, Supplier, Tab,
} from "../types";

export function usePosData(
  email: string | null,
  tab: Tab,
  setError: (message: string) => void,
) {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>("today");
  const dashboardRequestId = useRef(0);

  const refreshData = useCallback(async () => {
    const [nextProducts, nextSuppliers, nextSales, nextBatches] = await Promise.all([
      api<Product[]>("/api/products"), api<Supplier[]>("/api/suppliers"),
      api<Sale[]>("/api/sales"), api<Batch[]>("/api/batches"),
    ]);
    setProducts(nextProducts);
    setSuppliers(nextSuppliers);
    setSales(nextSales);
    setBatches(nextBatches);
  }, []);

  const refreshDashboard = useCallback(async () => {
    const requestId = ++dashboardRequestId.current;
    const data = await api<DashboardData>(`/api/dashboard?period=${dashboardPeriod}`);
    if (requestId === dashboardRequestId.current) setDashboard(data);
  }, [dashboardPeriod]);

  useEffect(() => {
    if (!email) return;
    refreshData().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Could not load POS data"),
    );
  }, [email, refreshData, setError]);

  useEffect(() => {
    if (!email) return;
    refreshDashboard().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Could not load dashboard data"),
    );
  }, [email, refreshDashboard, setError]);

  useEffect(() => {
    if (!email || tab !== "dashboard") return;
    const timer = window.setInterval(() => {
      refreshDashboard().catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Could not refresh dashboard data"),
      );
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [email, refreshDashboard, setError, tab]);

  return {
    products, batches, suppliers, sales, dashboard, dashboardPeriod,
    setDashboardPeriod, refreshData, refreshDashboard,
  };
}
