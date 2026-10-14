import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function LibraryDialog({
  title,
  onClose,
  children,
  closeLabel,
}) {
  const dialogRef = useRef(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="dashboard-dialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dashboard-dialog-inner">
        <header>
          <h2 id={headingId}>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
