import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Folder,
  MoreHorizontal,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react';
import { canManageMap, coverStyle, relativeDate } from './helpers.js';

export default function MapCard({
  map,
  index,
  user,
  lang,
  t,
  trashed,
  onOpen,
  onPreview,
  onFavorite,
  onTrash,
  onRestore,
  onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);
  const act = async (action) => {
    setBusy(true);
    setMenuOpen(false);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return (
    <article
      className={`dashboard-map-card${trashed ? ' is-trashed' : ''}`}
      data-testid={`map-card-${map.id}`}
    >
      <div className="dashboard-card-cover">
        <button
          className="dashboard-map-cover"
          style={coverStyle(map, index)}
          onClick={trashed ? () => act(onRestore) : onOpen}
          aria-label={
            trashed
              ? t('dashboard.restore')
              : t('library.openMap', { name: map.name })
          }
        />
        {!trashed ? (
          <button
            className={`dashboard-star${map.is_favorite ? ' is-favorite' : ''}`}
            onClick={() => act(onFavorite)}
            aria-label={t(
              map.is_favorite ? 'dashboard.unfavorite' : 'dashboard.favorite',
            )}
            aria-pressed={Boolean(map.is_favorite)}
            disabled={busy}
          >
            <Star size={16} fill={map.is_favorite ? 'currentColor' : 'none'} />
          </button>
        ) : null}
      </div>
      <div className="dashboard-card-details">
        <div className="dashboard-card-title-row">
          <button
            className="dashboard-map-title"
            onClick={trashed ? () => act(onRestore) : onOpen}
            title={map.name}
          >
            {map.name}
          </button>
          <div className="dashboard-card-menu-anchor" ref={menuRef}>
            <button
              className="dashboard-more"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label={t('library.mapActions')}
              aria-expanded={menuOpen}
              disabled={busy}
            >
              <MoreHorizontal size={17} />
            </button>
            {menuOpen ? (
              <div
                className="dashboard-card-menu"
                aria-label={t('library.mapActions')}
              >
                {trashed ? (
                  <>
                    <button onClick={() => act(onRestore)}>
                      <RotateCcw size={14} />
                      {t('dashboard.restore')}
                    </button>
                    <button className="danger" onClick={() => act(onDelete)}>
                      <Trash2 size={14} />
                      {t('dashboard.deleteForever')}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={onOpen}>
                      {t('library.openInEditor')}
                    </button>
                    <button onClick={onPreview}>
                      {t('library.previewMap')}
                    </button>
                    <button onClick={() => act(onFavorite)}>
                      {t(
                        map.is_favorite
                          ? 'dashboard.unfavorite'
                          : 'dashboard.favorite',
                      )}
                    </button>
                    {canManageMap(map, user) ? (
                      <button className="danger" onClick={() => act(onTrash)}>
                        {t('library.moveToTrash')}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <p className="dashboard-card-description" title={map.description || ''}>
          {map.description ||
            `${map.layer_count || 0} ${t('library.layers')} · ${map.feature_count || 0} ${t('library.features')}`}
        </p>
        <div className="dashboard-card-meta">
          <span className="dashboard-project-label" title={map.project_name}>
            <span className={`space-icon space-color-${index % 5}`}>
              <Folder size={11} />
            </span>
            {map.project_name || t('library.unassignedProject')}
          </span>
          <span title={map.updated_at}>
            <CalendarDays size={11} />
            {t('dashboard.modified', {
              date: relativeDate(map.updated_at, lang),
            })}
          </span>
        </div>
      </div>
    </article>
  );
}
