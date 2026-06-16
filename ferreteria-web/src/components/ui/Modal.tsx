import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  large?: boolean;
}

export function Modal({ open, title, onClose, children, footer, large }: ModalProps) {
  if (!open) return null;
  return createPortal(
    <div
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal${large ? ' modal-lg' : ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
