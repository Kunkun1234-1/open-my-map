import { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import WorkspaceFolio from './WorkspaceFolio.jsx';
import MapsTable from './MapsTable.jsx';
import ProjectsTable from './ProjectsTable.jsx';

function recentMatches(items, query) {
  return items.filter((item) => !query || `${item.name} ${item.description || ''} ${item.project_name || ''}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || Number(b.id) - Number(a.id))
    .slice(0, 5);
}

export default function HomeOverview({ maps, projects, user, query, loading, lang, t, onMap, onProject, onMoreMaps, onMoreProjects, onRefresh, onToast }) {
  const recentMaps = useMemo(() => recentMatches(maps, query), [maps, query]);
  const recentProjects = useMemo(() => recentMatches(projects, query), [projects, query]);
  const groups = [
    { kind: 'maps', items: recentMaps, Collection: MapsTable, onOpen: onMap, onMore: onMoreMaps, title: 'dashboard.yourMaps', empty: 'dashboard.homeEmptyMaps', more: 'dashboard.moreMaps', hint: 'dashboard.homeAllMaps' },
    { kind: 'projects', items: recentProjects, Collection: ProjectsTable, onOpen: onProject, onMore: onMoreProjects, title: 'dashboard.yourProjects', empty: 'dashboard.homeEmptyProjects', more: 'dashboard.moreProjects', hint: 'dashboard.homeAllProjects' },
  ];

  return (
    <div className="workspace-overview">
      {groups.map(({ kind, items, Collection, onOpen, onMore, title, empty, more, hint }) => {
        const headingId = `home-${kind}-heading`;
        return (
          <section key={kind} aria-labelledby={headingId} aria-busy={loading}>
            <div className="workspace-section-heading">
              <h2 id={headingId}>{t(title)}</h2>
            </div>
            {loading ? <p className="workspace-section-message" role="status">{t('common.loading')}</p> : (
              <>
                {!items.length ? <p className="workspace-section-message">{t(query ? 'library.noMatchTitle' : empty)}</p> : null}
                <Collection {...{ [kind]: items }} user={user} lang={lang} t={t} view="overview"
                  onOpen={onOpen} onRefresh={onRefresh} onToast={onToast}
                  renderOverview={({ onEdit, canEdit, disabled, onFavorite, onDelete, canDelete }) => (
                    <div className="workspace-folio-grid">
                      {items.map((entity, index) => (
                        <WorkspaceFolio key={entity.id} testId={`home-${kind}-${entity.id}`} entity={entity} kind={kind} index={index} lang={lang} t={t}
                          onOpen={onOpen} onEdit={() => onEdit(entity)} editable={canEdit(entity)} disabled={disabled}
                          onFavorite={onFavorite && (() => onFavorite(entity))}
                          onDelete={onDelete && (() => onDelete(entity))} deletable={canDelete?.(entity)} />
                      ))}
                      <button type="button" className="workspace-more-folio" onClick={onMore}>
                        <span className="workspace-folio-image workspace-more-art" aria-hidden="true">
                          <img src={lang === 'en' ? '/images/map-talk-logo-en.svg' : '/images/map-talk-logo-zh.svg'} alt="" width="1706" height="481" />
                        </span>
                        <span className="workspace-folio-title">
                          <span>{t(more)}</span>
                          <ArrowUpRight size={18} strokeWidth={1.4} aria-hidden="true" />
                        </span>
                        <span className="workspace-folio-note">{t(hint)}</span>
                      </button>
                    </div>
                  )}
                />
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
