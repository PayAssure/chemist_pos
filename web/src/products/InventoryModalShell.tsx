import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
};

export function InventoryModalShell({ title, description, onClose, children }: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="panel form-panel inventory-modal" role="dialog" aria-modal="true"
        aria-labelledby="inventory-modal-title">
        <div className="modal-heading">
          <div className="panel-heading">
            <div><h2 id="inventory-modal-title">{title}</h2><p>{description}</p></div>
          </div>
          <button className="modal-close" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
