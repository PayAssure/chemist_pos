import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { PayassureDirectorySupplier, Supplier } from "../types";

export function useSupplierManagement(
  suppliers: Supplier[],
  onSaveSupplier: (event: FormEvent<HTMLFormElement>) => Promise<boolean>,
) {
  const [payassureEnrolled, setPayassureEnrolled] = useState(true);
  const [directorySuppliers, setDirectorySuppliers] = useState<PayassureDirectorySupplier[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryReload, setDirectoryReload] = useState(0);
  const [supplierName, setSupplierName] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<PayassureDirectorySupplier | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savingRef = useRef(false);

  useEffect(() => {
    if (!payassureEnrolled) {
      setDirectoryLoading(false);
      return;
    }
    let active = true;
    setDirectoryLoading(true);
    setDirectoryError("");
    api<{ suppliers: PayassureDirectorySupplier[] }>("/api/payassure/suppliers")
      .then(({ suppliers: queried }) => { if (active) setDirectorySuppliers(queried); })
      .catch((reason: unknown) => {
        if (active) setDirectoryError(reason instanceof Error
          ? reason.message : "Could not load PayAssure suppliers");
      })
      .finally(() => { if (active) setDirectoryLoading(false); });
    return () => { active = false; };
  }, [payassureEnrolled, directoryReload]);

  const matchingDirectorySuppliers = useMemo(() => {
    const query = supplierName.trim().toLocaleLowerCase();
    if (!query || selectedSupplier) return [];
    return directorySuppliers.filter((supplier) =>
      [supplier.name, supplier.merchantId].some((value) =>
        value.toLocaleLowerCase().includes(query))).slice(0, 8);
  }, [directorySuppliers, selectedSupplier, supplierName]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((supplier) => [
      supplier.name, supplier.payassureEnrolled ? "enrolled" : "not enrolled",
      supplier.merchantId ?? "", supplier.contactName, supplier.phone, supplier.email, supplier.address,
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [search, suppliers]);

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (payassureEnrolled && !selectedSupplier) {
      setSelectionError("Choose a supplier from the PayAssure search results.");
      return;
    }
    const name = (selectedSupplier?.name ?? supplierName).trim();
    if (suppliers.some((supplier) =>
      supplier.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setSaveError("A supplier with this name is already saved.");
      return;
    }
    setSelectionError("");
    setSaveError("");
    savingRef.current = true;
    setSaving(true);
    try {
      if (await onSaveSupplier(event)) {
        setSupplierName("");
        setSelectedSupplier(null);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function chooseSupplier(supplier: PayassureDirectorySupplier) {
    setSelectedSupplier(supplier);
    setSupplierName(supplier.name);
    setSelectionError("");
  }

  return {
    suppliers, filteredSuppliers, search, setSearch, payassureEnrolled, setPayassureEnrolled,
    directorySuppliers, directoryLoading, directoryError, setDirectoryReload, supplierName,
    setSupplierName, selectedSupplier, setSelectedSupplier, selectionError, setSelectionError,
    matchingDirectorySuppliers, submitSupplier, chooseSupplier, saving, saveError,
  };
}

export type SupplierController = ReturnType<typeof useSupplierManagement>;
