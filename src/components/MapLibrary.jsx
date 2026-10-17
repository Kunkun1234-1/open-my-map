import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowDownUp,
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  Folder,
  Grid2X2,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
  Table2,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import LibrarySidebar from './library/LibrarySidebar.jsx';
import LibraryHero from './library/LibraryHero.jsx';
import HomeOverview from './library/HomeOverview.jsx';
import LibraryDialog from './library/LibraryDialog.jsx';
import MapsTable from './library/MapsTable.jsx';
import ProjectMembers from './library/ProjectMembers.jsx';
import ProjectsTable from './library/ProjectsTable.jsx';
import { relativeDate } from './library/helpers.js';
import './library/dashboard.css';

export default function MapLibrary() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [maps, setMaps] = useState([]);
  const [projects, setProjects] = useState([]);
  const [trashedMaps, setTrashedMaps] = useState([]);
  const [section, setSection] = useState('home');
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [projectSwitching, setProjectSwitching] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('modified');
  const [basemapFilter, setBasemapFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [mapView, setMapView] = useState('grid');
  const [projectView, setProjectView] = useState('grid');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [slide, setSlide] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [mapForm, setMapForm] = useState({ name: '', projectId: '' });
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'editor' });
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersRefreshKey, setMembersRefreshKey] = useState(0);
  const searchRef = useRef(null);
  const activityRef = useRef(null);
  const projectTransitionRef = useRef(null);
  const projectTransitionSequence = useRef(0);

  useEffect(() => () => {
    projectTransitionSequence.current += 1;
    projectTransitionRef.current?.skipTransition();
    projectTransitionRef.current = null;
  }, []);

  const loadLibrary = useCallback(async () => {
    const [nextMaps, nextProjects, nextTrashed] = await Promise.all([
      api.maps(),
      api.projects(),
      api.trashedMaps(),
    ]);
    setMaps(nextMaps);
    setProjects(nextProjects);
    setTrashedMaps(nextTrashed);
    setSelectedProjectId((current) =>
      current === 'all' ||
      nextProjects.some((project) => project.id === current)
        ? current
        : 'all',
    );
  }, []);

  useEffect(() => {
    loadLibrary()
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [loadLibrary]);
  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setActivityOpen(false);
      }
    };
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!activityOpen) return;
    const dismiss = (event) => {
      if (!activityRef.current?.contains(event.target)) setActivityOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [activityOpen]);

  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const editableProjects = projects.filter(
    (project) =>
      user?.role === 'admin' ||
      project.my_role === 'owner' ||
      project.my_role === 'editor',
  );
  const canManageProject =
    selectedProject &&
    (user?.role === 'admin' ||
      selectedProject.my_role === 'owner');
  const canCreateInProject = !selectedProject || editableProjects.some((project) => project.id === selectedProject.id);
  const isTrash = section === 'trash';
  const isProjects = section === 'projects';
  const filterTab =
    section === 'favorites'
      ? 'favorites'
      : section === 'shared'
        ? 'shared'
        : activeTab;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => {
    const source = isTrash ? trashedMaps : maps;
    const result = source.filter((map) => {
      if (
        selectedProjectId !== 'all' &&
        map.project_id !== Number(selectedProjectId)
      )
        return false;
      if (basemapFilter !== 'all' && map.base_map !== basemapFilter)
        return false;
      if (
        normalizedQuery &&
        !`${map.name} ${map.description || ''} ${map.project_name || ''}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
        return false;
      if (!isTrash && filterTab === 'favorites' && !map.is_favorite)
        return false;
      const owned =
        map.is_owner || map.my_role === 'owner' || map.my_role === 'admin';
      if (!isTrash && filterTab === 'owned' && !owned) return false;
      if (!isTrash && filterTab === 'shared' && owned) return false;
      return true;
    });
    return result.sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, lang)
        : sort === 'oldest'
          ? String(a.updated_at).localeCompare(String(b.updated_at))
          : String(b.updated_at).localeCompare(String(a.updated_at)),
    );
  }, [
    maps,
    trashedMaps,
    isTrash,
    selectedProjectId,
    basemapFilter,
    normalizedQuery,
    filterTab,
    sort,
    lang,
  ]);
  const visibleProjects = [...projects]
    .filter(
      (project) =>
        !normalizedQuery ||
        `${project.name} ${project.description || ''}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
    )
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const tabs = [
    ['all', t('library.tabAll')],
    ['owned', t('dashboard.owned')],
    ['shared', t('library.tabShared')],
    ['favorites', t('dashboard.favorites')],
  ];

  const transitionProject = (update, switching = false) => {
    const sequence = ++projectTransitionSequence.current;
    projectTransitionRef.current?.skipTransition();
    projectTransitionRef.current = null;
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      flushSync(() => {
        setProjectSwitching(false);
        update();
      });
      return;
    }
    // Prepare the old selection before the browser captures its outgoing frame.
    flushSync(() => setProjectSwitching(switching));
    const transition = document.startViewTransition(() => {
      if (sequence === projectTransitionSequence.current) flushSync(update);
    });
    projectTransitionRef.current = transition;
    transition.ready.catch(() => {});
    const finish = () => {
      if (projectTransitionRef.current !== transition) return;
      projectTransitionRef.current = null;
      setProjectSwitching(false);
    };
    transition.finished.then(finish, finish);
  };
  const changeSection = (next) => {
    const update = () => {
      setSection(next);
      setSelectedProjectId('all');
      setActiveTab('all');
      setBasemapFilter('all');
      setMembersOpen(false);
      setSidebarOpen(false);
      setFilterOpen(false);
      setQuery('');
      setMapView(next === 'home' ? 'grid' : 'table');
      if (next === 'home' || next === 'projects') setProjectView('grid');
    };
    if (next === 'projects' && selectedProjectId !== 'all') {
      transitionProject(update);
    } else {
      projectTransitionSequence.current += 1;
      projectTransitionRef.current?.skipTransition();
      projectTransitionRef.current = null;
      setProjectSwitching(false);
      update();
    }
  };
  const chooseProject = (projectId) => {
    const update = () => {
      setSelectedProjectId(Number(projectId));
      setSection('maps');
      setMapView('table');
      setActiveTab('all');
      setQuery('');
      setBasemapFilter('all');
      setFilterOpen(false);
      setMembersOpen(false);
      setSidebarOpen(false);
    };
    if (selectedProjectId === Number(projectId) && section === 'maps') {
      update();
    } else {
      transitionProject(update, selectedProjectId !== 'all' && section === 'maps');
    }
  };
  const openDialog = (next) => {
    setError('');
    setDialog(next);
    setSidebarOpen(false);
  };
  const openCreateMap = () => {
    if (!canCreateInProject) return;
    if (!editableProjects.length) {
      openDialog('project');
      return;
    }
    const project =
      editableProjects.find((item) => item.id === selectedProjectId) ||
      editableProjects[0];
    setMapForm({ name: '', projectId: String(project.id) });
    openDialog('map');
  };
  const submitDialog = async (event) => {
    event.preventDefault();
    setDialogBusy(true);
    setError('');
    try {
      if (dialog === 'project') {
        const project = await api.createProject({
          name: projectForm.name.trim(),
          description: projectForm.description.trim(),
        });
        await loadLibrary();
        chooseProject(project.id);
        setProjectForm({ name: '', description: '' });
      } else if (dialog === 'map') {
        const map = await api.createMap({
          name: mapForm.name.trim(),
          projectId: Number(mapForm.projectId),
        });
        navigate(`/maps/${map.id}`);
      } else if (dialog === 'invite' && selectedProject) {
        await api.inviteProjectMember(selectedProject.id, {
          email: inviteForm.email.trim(),
          role: inviteForm.role,
        });
        setInviteForm({ email: '', role: 'editor' });
        setMembersOpen(true);
        setMembersRefreshKey((value) => value + 1);
        await loadLibrary();
      }
      setDialog(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDialogBusy(false);
    }
  };
  const emptyTitle = isTrash
    ? 'dashboard.emptyTrash'
    : filterTab === 'favorites'
      ? 'dashboard.emptyFavorites'
      : filterTab === 'shared'
        ? 'dashboard.emptyShared'
        : 'library.noMatchTitle';
  const emptyHint = isTrash
    ? 'dashboard.trashHint'
    : filterTab === 'favorites'
      ? 'dashboard.emptyFavoritesHint'
      : filterTab === 'shared'
        ? 'dashboard.emptySharedHint'
        : 'library.noMatchSearch';

  return (
    <main className="dashboard-page">
      <LibrarySidebar
        user={user}
        projects={projects}
        section={section}
        selectedProjectId={selectedProjectId}
        animateProjectSelection={projectSwitching}
        onNavigate={changeSection}
        onProject={chooseProject}
        onCreateProject={() => openDialog('project')}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        t={t}
      />
      <div className="dashboard-content" inert={sidebarOpen}>
        <header
          className={`dashboard-topbar${section !== 'home' ? ' on-white' : ''}`}
        >
          <button
            className="icon-button dashboard-mobile-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('dashboard.openNavigation')}
          >
            <Menu size={21} />
          </button>
          <label className="dashboard-search">
            <Search size={16} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('dashboard.search')}
              aria-label={t('dashboard.search')}
            />
            {query ? (
              <button
                onClick={() => setQuery('')}
                aria-label={t('editor.clearSearch')}
              >
                <X size={14} />
              </button>
            ) : (
              <kbd>⌘ K</kbd>
            )}
          </label>
          <div className="dashboard-topbar-actions">
            <div className="dashboard-activity-anchor" ref={activityRef}>
              <button
                className="icon-button"
                onClick={() => setActivityOpen((value) => !value)}
                aria-label={t('dashboard.showActivity')}
                aria-expanded={activityOpen}
              >
                <Bell size={18} />
              </button>
              {activityOpen ? (
                <section className="dashboard-activity">
                  <h3>{t('dashboard.recentActivity')}</h3>
                  {maps.length ? (
                    [...maps]
                      .sort((a, b) =>
                        String(b.updated_at).localeCompare(
                          String(a.updated_at),
                        ),
                      )
                      .slice(0, 4)
                      .map((map) => (
                        <button
                          key={map.id}
                          onClick={() => navigate(`/maps/${map.id}`)}
                        >
                          <span className="space-icon space-color-0">
                            <Folder size={15} />
                          </span>
                          <span>
                            <strong>{map.name}</strong>
                            <small>
                              {t('dashboard.modified', {
                                date: relativeDate(map.updated_at, lang),
                              })}
                            </small>
                          </span>
                        </button>
                      ))
                  ) : (
                    <p>{t('dashboard.noActivity')}</p>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        </header>
        {section === 'home' ? (
          <LibraryHero
            user={user}
            onCreateMap={openCreateMap}
            onCreateProject={() => openDialog('project')}
            t={t}
            slide={slide}
            setSlide={setSlide}
          />
        ) : null}
        <div className="dashboard-workspace">
          {error && !dialog ? (
            <div className="inline-error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError('')}
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {section === 'home' ? (
            <HomeOverview maps={maps} projects={projects} user={user} query={normalizedQuery} loading={loading} lang={lang} t={t} onMap={(mapId) => navigate(`/maps/${mapId}`)} onProject={chooseProject} onMoreMaps={() => changeSection('maps')} onMoreProjects={() => changeSection('projects')} onRefresh={loadLibrary} onToast={setToast} />
          ) : null}
          {section !== 'home' && !isProjects ? (
            <section
              key={selectedProjectId}
              className={`dashboard-maps-section${selectedProject && !isTrash ? ' is-project-detail' : ''}`}
              style={{ viewTransitionName: projectSwitching ? 'project-maps' : undefined }}
              aria-label={t('dashboard.yourMaps')}
            >
              {selectedProject && !isTrash ? (
                <div className="dashboard-project-breadcrumb">
                  <button type="button" onClick={() => changeSection('projects')}><ArrowLeft size={15} />{t('dashboard.backToProjects')}</button>
                  <span>/</span>
                  <span>{selectedProject.name}</span>
                  <small>{t('dashboard.mapCount', { n: selectedProject.map_count || 0 })}</small>
                </div>
              ) : null}
              <div className="dashboard-section-toolbar">
                <div className="dashboard-section-heading">
                  <h2>
                    {isTrash
                      ? t('dashboard.trash')
                      : selectedProject?.name || t('dashboard.yourMaps')}
                  </h2>
                  {!isTrash && !selectedProject ? (
                    <nav
                      className="dashboard-map-tabs"
                      aria-label={t('dashboard.yourMaps')}
                    >
                      {tabs.map(([key, label]) => (
                        <button
                          key={key}
                          className={filterTab === key ? 'active' : ''}
                          onClick={() => {
                            setActiveTab(key);
                            if (section === 'favorites' || section === 'shared')
                              setSection('maps');
                          }}
                          aria-pressed={filterTab === key}
                        >
                          {label}
                        </button>
                      ))}
                    </nav>
                  ) : null}
                </div>
                <div className="dashboard-view-actions">
                  <div className="dashboard-view-toggle" role="group" aria-label={t('dashboard.mapViews')}>
                    <button type="button" className={mapView === 'grid' ? 'active' : ''} onClick={() => setMapView('grid')} aria-label={t('dashboard.gridView')} aria-pressed={mapView === 'grid'} title={t('dashboard.gridView')}><Grid2X2 size={15} /></button>
                    <button type="button" className={mapView === 'table' ? 'active' : ''} onClick={() => setMapView('table')} aria-label={t('dashboard.tableView')} aria-pressed={mapView === 'table'} title={t('dashboard.tableView')}><Table2 size={15} /></button>
                  </div>
                  <label className="dashboard-sort">
                    <ArrowDownUp size={14} />
                    <select
                      value={sort}
                      onChange={(event) => setSort(event.target.value)}
                      aria-label={t('library.sort')}
                    >
                      <option value="modified">
                        {t('dashboard.lastModified')}
                      </option>
                      <option value="oldest">
                        {t('dashboard.oldestFirst')}
                      </option>
                      <option value="name">{t('dashboard.nameAZ')}</option>
                    </select>
                    <ChevronDown size={13} />
                  </label>
                  <button
                    className={`dashboard-filter-button${filterOpen ? ' active' : ''}`}
                    onClick={() => setFilterOpen((value) => !value)}
                    aria-expanded={filterOpen}
                  >
                    <SlidersHorizontal size={15} />
                    {t('dashboard.filter')}
                    {selectedProjectId !== 'all' || basemapFilter !== 'all' ? (
                      <span className="dashboard-filter-dot" />
                    ) : null}
                  </button>
                  {!isTrash ? (
                    <button
                      className="dashboard-primary compact"
                      onClick={openCreateMap}
                      disabled={!canCreateInProject}
                    >
                      <Plus size={15} />
                      {t('library.createMap')}
                    </button>
                  ) : null}
                </div>
              </div>
              {isTrash ? (
                <p className="dashboard-section-description">
                  {t('dashboard.trashHint')}
                </p>
              ) : null}
              {filterOpen ? (
                <div className="dashboard-filter-panel">
                  <label>
                    {t('dashboard.chooseProject')}
                    <select
                      aria-label={t('dashboard.chooseProject')}
                      value={selectedProjectId}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (isTrash) setSelectedProjectId(value === 'all' ? 'all' : Number(value));
                        else if (value === 'all') changeSection('maps');
                        else chooseProject(value);
                      }}
                    >
                      <option value="all">{t('dashboard.allProjects')}</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('dashboard.mapType')}
                    <select
                      aria-label={t('dashboard.mapType')}
                      value={basemapFilter}
                      onChange={(event) => setBasemapFilter(event.target.value)}
                    >
                      <option value="all">{t('dashboard.anyBasemap')}</option>
                      <option value="standard">
                        {lang === 'zh' ? '标准' : 'Standard'}
                      </option>
                      <option value="satellite">
                        {lang === 'zh' ? '卫星' : 'Satellite'}
                      </option>
                      <option value="terrain">
                        {lang === 'zh' ? '浅色' : 'Light'}
                      </option>
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelectedProjectId('all');
                      setBasemapFilter('all');
                      setQuery('');
                    }}
                  >
                    {t('dashboard.clearFilters')}
                  </button>
                </div>
              ) : null}
              {selectedProject ? (
                <div className="dashboard-project-context">
                  <p>{selectedProject.description}</p>
                  <div>
                    <button
                      className="dashboard-secondary compact"
                      onClick={() => setMembersOpen((value) => !value)}
                    >
                      <Users size={15} />
                      {t(
                        membersOpen
                          ? 'library.collapseMembers'
                          : 'library.viewMembers',
                      )}
                    </button>
                    {canManageProject ? (
                      <button
                        className="dashboard-secondary compact"
                        onClick={() => openDialog('invite')}
                      >
                        <Plus size={15} />
                        {t('library.inviteMembers')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {selectedProject && membersOpen ? (
                <ProjectMembers
                  key={selectedProject.id}
                  project={selectedProject}
                  canManage={canManageProject}
                  refreshKey={membersRefreshKey}
                  onChanged={loadLibrary}
                  t={t}
                />
              ) : null}
              {loading ? (
                <div
                  className="dashboard-table-loading"
                  aria-label={t('dashboard.loadingMaps')}
                >
                  {[0, 1, 2, 3].map((n) => (
                    <div key={n} />
                  ))}
                </div>
              ) : (
                <>
                  {filtered.length === 0 ? (
                    <div className="dashboard-empty">
                      <span>
                        {isTrash ? (
                          <Trash2 size={26} />
                        ) : filterTab === 'favorites' ? (
                          <Star size={26} />
                        ) : (
                          <Search size={26} />
                        )}
                      </span>
                      <h3>{t(emptyTitle)}</h3>
                      <p>{selectedProject && !isTrash && !normalizedQuery && basemapFilter === 'all' ? t('library.noMatchInProject', { name: selectedProject.name }) : t(emptyHint)}</p>
                      {!isTrash && canCreateInProject && !normalizedQuery && basemapFilter === 'all' ? <button className="dashboard-secondary" onClick={openCreateMap}><Plus size={15} />{t('library.createMap')}</button> : null}
                    </div>
                  ) : null}
                  <MapsTable
                    key={isTrash ? 'trash' : 'active'}
                    maps={filtered}
                    user={user}
                    lang={lang}
                    t={t}
                    trashed={isTrash}
                    view={mapView}
                    onOpen={(mapId) => navigate(`/maps/${mapId}`)}
                    onPreview={(mapId) => navigate(`/maps/${mapId}?preview=1`)}
                    onCreateMap={canCreateInProject && filterTab === 'all' && !normalizedQuery && basemapFilter === 'all' ? openCreateMap : undefined}
                    onRefresh={loadLibrary}
                    onToast={setToast}
                  />
                </>
              )}
            </section>
          ) : null}
          {!isTrash && isProjects ? (
            <section className="dashboard-projects-section">
              <div className="dashboard-projects-heading">
                <h2>
                  {t('dashboard.projects')}
                </h2>
                <div className="dashboard-projects-actions">
                  <div className="dashboard-view-toggle" role="group" aria-label={t('dashboard.projectViews')}>
                    <button type="button" className={projectView === 'grid' ? 'active' : ''} onClick={() => setProjectView('grid')} aria-label={t('dashboard.projectGridView')} aria-pressed={projectView === 'grid'} title={t('dashboard.projectGridView')}><Grid2X2 size={15} /></button>
                    <button type="button" className={projectView === 'table' ? 'active' : ''} onClick={() => setProjectView('table')} aria-label={t('dashboard.projectTableView')} aria-pressed={projectView === 'table'} title={t('dashboard.projectTableView')}><Table2 size={15} /></button>
                  </div>
                  <button className="dashboard-secondary compact" onClick={() => openDialog('project')}><Plus size={15} />{t('library.createProject')}</button>
                </div>
              </div>
              {!loading && visibleProjects.length === 0 ? (
                <div className="dashboard-empty dashboard-project-empty">
                  <Folder size={28} />
                  <h3>{t('dashboard.emptyProjects')}</h3>
                  <p>{t('dashboard.emptyProjectsHint')}</p>
                  <button
                    className="dashboard-secondary"
                    onClick={() => openDialog('project')}
                  >
                    <Plus size={15} />
                    {t('library.createProject')}
                  </button>
                </div>
              ) : (
                <ProjectsTable
                  projects={visibleProjects}
                  user={user}
                  lang={lang}
                  t={t}
                  view={projectView}
                  onOpen={chooseProject}
                  onCreateProject={() => openDialog('project')}
                  onRefresh={loadLibrary}
                  onToast={setToast}
                />
              )}
            </section>
          ) : null}
        </div>
      </div>
      {toast ? (
        <div className="dashboard-toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      ) : null}
      {dialog ? (
        <LibraryDialog
          title={t(
            dialog === 'map'
              ? 'dashboard.createMapTitle'
              : dialog === 'invite'
                ? 'library.inviteMembers'
                : 'library.createProject',
          )}
          onClose={() => {
            if (!dialogBusy) {
              setDialog(null);
              setError('');
            }
          }}
          closeLabel={t('common.close')}
        >
          <form className="dialog-form" onSubmit={submitDialog}>
            {error ? (
              <div className="inline-error" role="alert">
                {error}
              </div>
            ) : null}
            {dialog === 'project' ? (
              <>
                <label>
                  {t('library.projectName')}
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    value={projectForm.name}
                    onChange={(event) =>
                      setProjectForm({
                        ...projectForm,
                        name: event.target.value,
                      })
                    }
                    placeholder={t('library.projectNamePlaceholder')}
                  />
                </label>
                <label>
                  {t('library.projectDesc')}
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={projectForm.description}
                    onChange={(event) =>
                      setProjectForm({
                        ...projectForm,
                        description: event.target.value,
                      })
                    }
                    placeholder={t('library.projectDescPlaceholder')}
                  />
                </label>
              </>
            ) : dialog === 'map' ? (
              <>
                <label>
                  {t('dashboard.newMapName')}
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    value={mapForm.name}
                    onChange={(event) =>
                      setMapForm({ ...mapForm, name: event.target.value })
                    }
                    placeholder={t('dashboard.mapNamePlaceholder')}
                  />
                </label>
                <label>
                  {t('dashboard.chooseProject')}
                  <select
                    aria-label={t('dashboard.chooseProject')}
                    value={mapForm.projectId}
                    onChange={(event) =>
                      setMapForm({ ...mapForm, projectId: event.target.value })
                    }
                  >
                    {editableProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  {t('library.memberEmail')}
                  <input
                    autoFocus
                    required
                    type="email"
                    value={inviteForm.email}
                    onChange={(event) =>
                      setInviteForm({
                        ...inviteForm,
                        email: event.target.value,
                      })
                    }
                    placeholder={t('library.memberEmailPlaceholder')}
                  />
                </label>
                <label>
                  {t('library.projectRole')}
                  <select
                    aria-label={t('library.projectRole')}
                    value={inviteForm.role}
                    onChange={(event) =>
                      setInviteForm({ ...inviteForm, role: event.target.value })
                    }
                  >
                    <option value="editor">{t('library.roleEditor')}</option>
                    <option value="viewer">{t('library.roleViewer')}</option>
                  </select>
                </label>
              </>
            )}
            <footer className="dialog-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => setDialog(null)}
                disabled={dialogBusy}
              >
                {t('common.cancel')}
              </button>
              <button
                className="dashboard-primary"
                disabled={
                  dialogBusy ||
                  (dialog === 'project' && !projectForm.name.trim()) ||
                  (dialog === 'map' && !mapForm.name.trim())
                }
              >
                {t(
                  dialogBusy
                    ? 'library.creating'
                    : dialog === 'invite'
                      ? 'library.sendInvite'
                      : dialog === 'map'
                        ? 'library.createMap'
                        : 'library.create',
                )}
              </button>
            </footer>
          </form>
        </LibraryDialog>
      ) : null}
    </main>
  );
}
