import { ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import CardCover from './CardCover.jsx';
import MapCardActions from './MapCardActions.jsx';
import { relativeDate } from './helpers.js';

export default function WorkspaceFolio({
  entity, kind, index, lang, t, testId, onOpen, onEdit, onEditDescription, onDelete, editable, disabled,
  onFavorite, deletable,
}) {
  const isProject = kind === 'projects';
  const open = () => onOpen(entity.id);
  const name = { name: entity.name };
  const projectPermissionHint = !editable ? t('dashboard.projectOwnerOnly') : undefined;
  const description = entity.description || (isProject ? '—' : `${entity.layer_count || 0} ${t('library.layers')} · ${entity.feature_count || 0} ${t('library.features')}`);

  return (
    <article className="workspace-folio" data-testid={testId}>
      <CardCover
        entity={entity}
        kind={kind}
        t={t}
        onOpen={open}
        openLabel={t(isProject ? 'dashboard.openHomeProject' : 'dashboard.openHomeMap', name)}
        className="workspace-folio-image"
        loading={index < 3 ? 'eager' : 'lazy'}
        disabled={disabled}
      />
      <button type="button" className="workspace-folio-link" disabled={disabled} onClick={open}>
        <span className="workspace-folio-title">
          <span title={entity.name} style={isProject ? { viewTransitionName: `project-${entity.id}` } : undefined}>{entity.name}</span>
          <ArrowUpRight size={18} strokeWidth={1.4} aria-hidden="true" />
        </span>
      </button>
      <p className="workspace-folio-note"
        title={onEditDescription && editable ? t('dashboard.doubleClickEdit') : entity.description || undefined}
        onDoubleClick={editable && !disabled ? onEditDescription : undefined}>
        {description}
      </p>
      <div className="workspace-folio-meta">
        <span title={isProject ? undefined : entity.project_name}>
          {isProject ? t('dashboard.mapCount', { n: entity.map_count || 0 }) : entity.project_name || t('library.unassignedProject')}
        </span>
        <time dateTime={entity.updated_at} title={entity.updated_at}>
          {t('dashboard.modified', { date: relativeDate(entity.updated_at, lang) })}
        </time>
        {isProject ? (
          <div className="dashboard-card-actions">
            <button type="button" disabled={!editable || disabled}
              aria-label={t('dashboard.editProjectNamed', name)} title={projectPermissionHint || t('dashboard.editProject')} onClick={onEdit}>
              <Pencil size={14} aria-hidden="true" />
            </button>
            {onDelete ? (
              <button type="button" className="danger" disabled={!editable || disabled}
                aria-label={t('dashboard.deleteProjectNamed', name)}
                title={projectPermissionHint || t('dashboard.deleteProject')} onClick={onDelete}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : (
          <MapCardActions map={entity} t={t} editable={editable} deletable={deletable} disabled={disabled}
            onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete} />
        )}
      </div>
    </article>
  );
}
