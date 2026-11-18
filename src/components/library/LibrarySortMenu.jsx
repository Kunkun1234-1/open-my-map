import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';

const SORT_OPTIONS = [
  ['modified', 'dashboard.sortByModified'],
  ['created', 'dashboard.sortByCreated'],
  ['name', 'dashboard.nameAZ'],
];

export default function LibrarySortMenu({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, SORT_OPTIONS.findIndex(([key]) => key === value.field));
  const ascending = value.direction === 'asc';
  const DirectionIcon = ascending ? ArrowUp : ArrowDown;
  const directionLabel = t(ascending ? 'dashboard.sortOldToNew' : 'dashboard.sortNewToOld');
  const selectedLabel = t(value.field === 'name' && !ascending ? 'dashboard.nameZA' : SORT_OPTIONS[selectedIndex][1]);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const menuId = useId();

  useEffect(() => {
    setActiveIndex(selectedIndex);
    if (open) requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    const dismiss = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', dismiss, true);
    };
  }, [open]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (index) => {
    const option = SORT_OPTIONS[index];
    if (!option) return;
    onChange(option[0]);
    close(true);
  };
  const openMenu = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };
  const focusOption = (index) => {
    setActiveIndex(index);
    requestAnimationFrame(() => optionRefs.current[index]?.focus());
  };
  const handleTriggerKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'End' ? SORT_OPTIONS.length - 1
      : event.key === 'Home' ? 0
        : event.key === 'ArrowUp' ? (selectedIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length
          : (selectedIndex + 1) % SORT_OPTIONS.length;
    setActiveIndex(index);
    setOpen(true);
  };
  const handleMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
      return;
    }
    let index;
    if (event.key === 'ArrowDown') index = (activeIndex + 1) % SORT_OPTIONS.length;
    else if (event.key === 'ArrowUp') index = (activeIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = SORT_OPTIONS.length - 1;
    else return;
    event.preventDefault();
    focusOption(index);
  };

  return (
    <div className="dashboard-sort" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={open ? 'dashboard-sort-trigger is-open' : 'dashboard-sort-trigger'}
        aria-label={`${t('library.sort')} · ${selectedLabel}${value.field === 'name' ? '' : ` · ${directionLabel}`}`}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => open ? close() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <DirectionIcon size={14} aria-hidden="true" />
        <span>{selectedLabel}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          className="dashboard-sort-menu"
          role="menu"
          aria-label={t('library.sort')}
          onKeyDown={handleMenuKeyDown}
        >
          {SORT_OPTIONS.map(([key, labelKey], index) => (
            <button
              key={key}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="menuitemradio"
              aria-checked={value.field === key}
              className={value.field === key ? 'is-selected' : ''}
              onClick={() => choose(index)}
            >
              <span>{value.field === key ? selectedLabel : t(labelKey)}</span>
              {value.field === key ? <DirectionIcon size={15} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
