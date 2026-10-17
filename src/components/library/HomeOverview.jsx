import { useMemo } from 'react';
import { ArrowUpRight, Folder, Pencil } from 'lucide-react';
import CardCover from './CardCover.jsx';
import MapsTable from './MapsTable.jsx';
import ProjectsTable from './ProjectsTable.jsx';
import { relativeDate } from './helpers.js';
import './home-overview.css';

function recentMatches(items, query) {
  return items.filter((item) => !query || `${item.name} ${item.description || ''} ${item.project_name || ''}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || Number(b.id) - Number(a.id));
}

function PreviewCard({ entity, kind, index, onOpen, onEdit, editable, disabled, lang, t }) {
  const project = kind === 'projects';
  const label = t(project ? 'dashboard.openHomeProject' : 'dashboard.openHomeMap', { name: entity.name });
  const editLabel = t(project ? 'dashboard.editProject' : 'dashboard.editMap');
  const permissionLabel = t(project ? 'dashboard.projectOwnerOnly' : 'dashboard.mapEditPermission');
  return (
    <article className="dashboard-map-card dashboard-home-card" data-testid={`home-${kind}-${entity.id}`}>
      <div className="dashboard-card-cover">
        <CardCover entity={entity} kind={kind} index={index} t={t} editable={false} onOpen={() => onOpen(entity.id)} openLabel={label} />
      </div>
      <div className="dashboard-card-details">
        <button type="button" className="dashboard-map-title" onClick={() => onOpen(entity.id)} title={entity.name}>
          <span style={project ? { viewTransitionName: `project-${entity.id}` } : undefined}>{entity.name}</span>
        </button>
        <p className="dashboard-card-description" title={entity.description || entity.project_name || ''}>{entity.description || entity.project_name || '—'}</p>
        <div className="dashboard-card-meta">
          <span><Folder size={11} />{project ? t('dashboard.mapCount', { n: entity.map_count || 0 }) : entity.project_name || '—'}</span>
          <span title={entity.updated_at}>{t('dashboard.modified', { date: relativeDate(entity.updated_at, lang) })}</span>
        </div>
        <div className="dashboard-project-row-actions">
          <button type="button" className="dashboard-action-icon" disabled={!editable || disabled}
            aria-label={t(project ? 'dashboard.editProjectNamed' : 'dashboard.editMapNamed', { name: entity.name })}
            title={editable ? editLabel : permissionLabel}
            onClick={onEdit}>
            <Pencil size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function HomeOverview({ maps, projects, user, query, loading, lang, t, onMap, onProject, onMoreMaps, onMoreProjects, onRefresh, onToast }) {
  const recentMaps = useMemo(() => recentMatches(maps, query), [maps, query]);
  const recentProjects = useMemo(() => recentMatches(projects, query), [projects, query]);
  const groups = [
    { kind: 'maps', items: recentMaps, title: 'dashboard.yourMaps', more: 'dashboard.moreMaps', hint: 'dashboard.homeAllMaps', empty: 'dashboard.homeEmptyMaps', onOpen: onMap, onMore: onMoreMaps },
    { kind: 'projects', items: recentProjects, title: 'dashboard.projects', more: 'dashboard.moreProjects', hint: 'dashboard.homeAllProjects', empty: 'dashboard.homeEmptyProjects', onOpen: onProject, onMore: onMoreProjects },
  ];
  return (
    <div className="dashboard-home-overview">
      {groups.map((group) => {
        const Collection = group.kind === 'maps' ? MapsTable : ProjectsTable;
        const items = group.items.slice(0, 5);
        const collectionProps = group.kind === 'maps' ? { maps: items } : { projects: items };
        return (
        <section key={group.kind} className="dashboard-home-section" aria-labelledby={`home-${group.kind}-heading`} aria-busy={loading}>
          <h2 id={`home-${group.kind}-heading`}>{t(group.title)}</h2>
          {loading ? <div className="dashboard-table-loading" aria-label={t('common.loading')}>{[0, 1, 2].map((n) => <div key={n} />)}</div> : <>
            {group.items.length === 0 ? <p className="dashboard-home-empty">{t(group.empty)}</p> : null}
            <Collection {...collectionProps} user={user} lang={lang} t={t} view="overview" onOpen={group.onOpen} onRefresh={onRefresh} onToast={onToast}
              renderOverview={({ onEdit, canEdit, disabled }) => <div className="dashboard-home-grid">
              {items.map((entity, index) => <PreviewCard key={entity.id} entity={entity} kind={group.kind} index={index} lang={lang} t={t} onOpen={group.onOpen} onEdit={() => onEdit(entity)} editable={canEdit(entity)} disabled={disabled} />)}
              <button type="button" className="dashboard-home-more" onClick={group.onMore}>
                <span className="dashboard-home-more-icon"><ArrowUpRight size={25} strokeWidth={1.4} /></span>
                <strong>{t(group.more)}</strong>
                <small>{t(group.hint)}</small>
              </button>
            </div>} />
          </>}
        </section>
        );
      })}
    </div>
  );
}
