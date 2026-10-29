"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Wraps body + footer in a form so Enter submits. */
  onSubmit?: (e: React.FormEvent) => void;
}

/** Accessible modal built on the native <dialog> element (focus trap, Esc to close, backdrop). */
export default function Modal({ open, onClose, title, description, children, footer, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const content = (
    <>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-head">
        <div>
          <h2 id="modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      {onSubmit ? (
        <form onSubmit={onSubmit} noValidate>
          {content}
        </form>
      ) : (
        content
      )}
    </dialog>
  );
}
