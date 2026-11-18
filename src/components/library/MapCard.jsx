import { useState } from 'react';
import {
  CalendarDays,
  Folder,
  Eye,
} from 'lucide-react';
import CardCover from './CardCover.jsx';
import MapCardActions from './MapCardActions.jsx';
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
      <CardCover
        entity={map}
        kind="maps"
        t={t}
        disabled={controlsDisabled || (trashed && !deletable)}
        onOpen={trashed ? () => act(onRestore) : onOpen}
        openLabel={
          trashed
            ? t('dashboard.restore')
            : t('library.openMap', { name: map.name })
        }
      />
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
        <div className="dashboard-card-footer">
          <div className="dashboard-card-meta">
            <span className="dashboard-project-label" title={map.project_name}>
              <span className={`space-icon space-color-${index % 5}`}>
                <Folder size={11} />
              </span>
              <span className="dashboard-card-project-name">{map.project_name || t('library.unassignedProject')}</span>
            </span>
            <span title={map.updated_at}>
              <CalendarDays size={11} />
              {t('dashboard.modified', {
                date: relativeDate(map.updated_at, lang),
              })}
            </span>
          </div>
          <MapCardActions
            map={map}
            t={t}
            trashed={trashed}
            editable={editable}
            deletable={deletable}
            disabled={controlsDisabled}
            onFavorite={() => act(onFavorite)}
            onEdit={() => act(onEdit)}
            onRestore={() => act(onRestore)}
            onDelete={() => act(trashed ? onDelete : onTrash)}
          />
        </div>
      </div>
    </article>
  );
}
