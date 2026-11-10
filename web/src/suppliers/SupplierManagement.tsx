import type { FormEvent } from "react";
import type { Supplier } from "../types";
import SupplierEntryForm from "./SupplierEntryForm";
import SupplierList from "./SupplierList";
import { useSupplierManagement } from "./useSupplierManagement";

type SupplierManagementProps = {
  suppliers: Supplier[];
  onSaveSupplier: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
};

function SupplierManagement({ suppliers, onSaveSupplier }: SupplierManagementProps) {
  const controller = useSupplierManagement(suppliers, onSaveSupplier);
  return (
    <section className="management">
      <SupplierEntryForm controller={controller} />
      <SupplierList controller={controller} />
    </section>
  );
}

export default SupplierManagement;
