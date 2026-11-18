import { Pencil, RotateCcw, Star, Trash2 } from 'lucide-react';

export default function MapCardActions({
  map, t, trashed = false, editable, deletable, disabled, onFavorite, onEdit, onRestore, onDelete,
}) {
  return (
    <div className="dashboard-card-actions">
      {!trashed ? (
        <>
          <button type="button" disabled={disabled}
            title={t(map.is_favorite ? 'dashboard.unfavorite' : 'dashboard.favorite')}
            aria-label={t(map.is_favorite ? 'dashboard.unfavorite' : 'dashboard.favorite')}
            aria-pressed={Boolean(map.is_favorite)} onClick={onFavorite}>
            <Star size={14} fill={map.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button type="button" disabled={disabled || !editable}
            title={t(editable ? 'dashboard.editMap' : 'dashboard.mapEditPermission')}
            aria-label={t('dashboard.editMapNamed', { name: map.name })} onClick={onEdit}>
            <Pencil size={14} />
          </button>
        </>
      ) : (
        <button type="button" disabled={disabled || !deletable}
          title={t(deletable ? 'dashboard.restore' : 'dashboard.mapDeletePermission')}
          aria-label={t('dashboard.restore')} onClick={onRestore}>
          <RotateCcw size={14} />
        </button>
      )}
      <button type="button" className="danger" disabled={disabled || !deletable}
        title={t(!deletable ? 'dashboard.mapDeletePermission' : trashed ? 'dashboard.deleteForever' : 'common.delete')}
        aria-label={t('dashboard.deleteMapNamed', { name: map.name })} onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
