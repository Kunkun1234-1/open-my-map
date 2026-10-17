import { useState } from 'react';
import {
  CalendarDays,
  Folder,
  Eye,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react';
import CardCover from './CardCover.jsx';
import { relativeDate } from './helpers.js';

export default function MapCard({
  map,
  index,
  lang,
  t,
  trashed,
  editable,
  deletable,
  disabled,
  onOpen,
  onPreview,
  onFavorite,
  onTrash,
  onRestore,
  onDelete,
  onEdit,
  onRefresh,
  onToast,
}) {
  const [busy, setBusy] = useState(false);
  const controlsDisabled = disabled || busy;
  const act = async (action) => {
    if (controlsDisabled || !action) return;
    setBusy(true);
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
        <CardCover
          entity={map}
          kind="maps"
          index={index}
          t={t}
          editable={false}
          disabled={controlsDisabled || (trashed && !deletable)}
          onOpen={trashed ? () => act(onRestore) : onOpen}
          openLabel={
            trashed
              ? t('dashboard.restore')
              : t('library.openMap', { name: map.name })
          }
          onRefresh={onRefresh}
          onToast={onToast}
        />
      </div>
      <div className="dashboard-card-details">
        <div className="dashboard-card-title-row">
          <button
            className="dashboard-map-title"
            onClick={trashed ? () => act(onRestore) : onOpen}
            title={map.name}
            disabled={controlsDisabled || (trashed && !deletable)}
          >
            {map.name}
          </button>
          {!trashed ? (
            <button
              type="button"
              className="dashboard-more"
              disabled={controlsDisabled}
              onClick={onPreview}
              title={t('library.previewMap')}
              aria-label={t('library.previewMap')}
            >
              <Eye size={16} />
            </button>
          ) : null}
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
        <div className="dashboard-project-row-actions">
          {!trashed ? (
            <>
              <button type="button" className="dashboard-action-icon" disabled={controlsDisabled}
                title={t(map.is_favorite ? 'dashboard.unfavorite' : 'dashboard.favorite')}
                aria-label={t(map.is_favorite ? 'dashboard.unfavorite' : 'dashboard.favorite')}
                aria-pressed={Boolean(map.is_favorite)} onClick={() => act(onFavorite)}>
                <Star size={14} fill={map.is_favorite ? 'currentColor' : 'none'} />
              </button>
              <button type="button" className="dashboard-action-icon" disabled={controlsDisabled || !editable}
                title={t(editable ? 'dashboard.editMap' : 'dashboard.mapEditPermission')}
                aria-label={t('dashboard.editMapNamed', { name: map.name })} onClick={() => act(onEdit)}>
                <Pencil size={14} />
              </button>
            </>
          ) : (
            <button type="button" className="dashboard-action-icon" disabled={controlsDisabled || !deletable}
              title={t(deletable ? 'dashboard.restore' : 'dashboard.mapDeletePermission')}
              aria-label={t('dashboard.restore')} onClick={() => act(onRestore)}>
              <RotateCcw size={14} />
            </button>
          )}
          <button type="button" className="dashboard-action-icon danger" disabled={controlsDisabled || !deletable}
            title={t(!deletable ? 'dashboard.mapDeletePermission' : trashed ? 'dashboard.deleteForever' : 'common.delete')}
            aria-label={t('dashboard.deleteMapNamed', { name: map.name })} onClick={() => act(trashed ? onDelete : onTrash)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
