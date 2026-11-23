import type { ReactNode } from "react";
import { CloseIcon } from "./Icons";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}

export function Modal({ title, children, onClose, actions }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <CloseIcon />
          </button>
        </header>
        <div className="modal__content">{children}</div>
        {actions ? <footer className="modal__actions">{actions}</footer> : null}
      </section>
    </div>
  );
}
