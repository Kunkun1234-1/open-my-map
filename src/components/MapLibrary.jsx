import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Folder,
  Grid2X2,
  List,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
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
import LibraryDialog from './library/LibraryDialog.jsx';
import MapCard from './library/MapCard.jsx';
import ProjectMembers from './library/ProjectMembers.jsx';
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
  const [activeTab, setActiveTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('modified');
  const [basemapFilter, setBasemapFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [listMode, setListMode] = useState(false);
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
      project.my_role === 'editor' ||
      project.owner_user_id === user?.id,
  );
  const canManageProject =
    selectedProject &&
    (user?.role === 'admin' ||
      selectedProject.my_role === 'owner' ||
      selectedProject.owner_user_id === user?.id);
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
  const recentProjects = [...projects]
    .filter(
      (project) =>
        !normalizedQuery ||
        `${project.name} ${project.description || ''}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
    )
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, isProjects ? undefined : 3);
  const tabs = [
    ['all', t('library.tabAll')],
    ['owned', t('dashboard.owned')],
    ['shared', t('library.tabShared')],
    ['favorites', t('dashboard.favorites')],
  ];

  const changeSection = (next) => {
    setSection(next);
    setSelectedProjectId('all');
    setActiveTab('all');
    setBasemapFilter('all');
    setMembersOpen(false);
    setSidebarOpen(false);
    setFilterOpen(false);
  };
  const chooseProject = (projectId) => {
    setSelectedProjectId(Number(projectId));
    setSection('maps');
    setActiveTab('all');
    setMembersOpen(false);
    setSidebarOpen(false);
  };
  const openDialog = (next) => {
    setError('');
    setDialog(next);
    setSidebarOpen(false);
  };
  const openCreateMap = () => {
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
  const perform = async (action, success) => {
    try {
      setError('');
      await action();
      await loadLibrary();
      if (success) setToast(t(success));
    } catch (requestError) {
      setError(requestError.message);
    }
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
  const trashMap = (map) => {
    if (!window.confirm(t('dashboard.confirmTrash', { name: map.name })))
      return;
    return perform(() => api.trashMap(map.id), 'dashboard.trashSuccess');
  };
  const deleteForever = (map) => {
    if (!window.confirm(t('dashboard.permanentWarning', { name: map.name })))
      return;
    return perform(() => api.deleteMap(map.id), 'dashboard.deletedSuccess');
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
            <button
              className="dashboard-top-avatar"
              onClick={() => navigate('/me')}
              aria-label={t('dashboard.account')}
            >
              {(user?.displayName || user?.name || '?').slice(0, 1)}
            </button>
          </div>
        </header>
        {section === 'home' ? (
          <LibraryHero
            t={t}
            slide={slide}
            setSlide={setSlide}
            onCreateMap={openCreateMap}
            onCreateProject={() => openDialog('project')}
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
          {!isProjects ? (
            <section
              className="dashboard-maps-section"
              aria-label={t('dashboard.yourMaps')}
            >
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
                  <div
                    className="dashboard-view-toggle"
                    role="group"
                    aria-label={t('library.toggleList')}
                  >
                    <button
                      className={!listMode ? 'active' : ''}
                      onClick={() => setListMode(false)}
                      aria-label={t('dashboard.gridView')}
                      aria-pressed={!listMode}
                    >
                      <Grid2X2 size={15} />
                    </button>
                    <button
                      className={listMode ? 'active' : ''}
                      onClick={() => setListMode(true)}
                      aria-label={t('dashboard.listView')}
                      aria-pressed={listMode}
                    >
                      <List size={15} />
                    </button>
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
                  {section !== 'home' && !isTrash ? (
                    <button
                      className="dashboard-primary compact"
                      onClick={openCreateMap}
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
                      onChange={(event) =>
                        setSelectedProjectId(
                          event.target.value === 'all'
                            ? 'all'
                            : Number(event.target.value),
                        )
                      }
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
                  className="dashboard-map-grid"
                  aria-label={t('dashboard.loadingMaps')}
                >
                  {[0, 1, 2, 3].map((n) => (
                    <div className="dashboard-map-skeleton" key={n} />
                  ))}
                </div>
              ) : (
                <>
                  {filtered.length === 0 &&
                  (isTrash ||
                    filterTab !== 'all' ||
                    normalizedQuery ||
                    basemapFilter !== 'all') ? (
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
                      <p>{t(emptyHint)}</p>
                    </div>
                  ) : null}
                  <div
                    className={`dashboard-map-grid${listMode ? ' is-list' : ''}`}
                  >
                    {filtered.map((map, index) => (
                      <MapCard
                        key={map.id}
                        map={map}
                        index={index}
                        user={user}
                        lang={lang}
                        t={t}
                        trashed={isTrash}
                        onOpen={() => navigate(`/maps/${map.id}`)}
                        onPreview={() => navigate(`/maps/${map.id}?preview=1`)}
                        onFavorite={() =>
                          perform(() =>
                            api.favoriteMap(map.id, !map.is_favorite),
                          )
                        }
                        onTrash={() => trashMap(map)}
                        onRestore={() =>
                          perform(
                            () => api.restoreMap(map.id),
                            'dashboard.restoreSuccess',
                          )
                        }
                        onDelete={() => deleteForever(map)}
                      />
                    ))}
                    {!isTrash &&
                    filterTab === 'all' &&
                    !normalizedQuery &&
                    basemapFilter === 'all' ? (
                      <button
                        className="dashboard-create-card"
                        onClick={openCreateMap}
                      >
                        <span>
                          <Plus size={26} strokeWidth={1.5} />
                        </span>
                        <strong>{t('dashboard.createNewMap')}</strong>
                        <small>{t('dashboard.mapHint')}</small>
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}
          {!isTrash && (section === 'home' || isProjects) ? (
            <section className="dashboard-projects-section">
              <div className="dashboard-projects-heading">
                <h2>
                  {t(
                    isProjects
                      ? 'dashboard.projects'
                      : 'dashboard.recentProjects',
                  )}
                </h2>
                <button
                  onClick={
                    isProjects
                      ? () => openDialog('project')
                      : () => changeSection('projects')
                  }
                >
                  {t(
                    isProjects ? 'library.createProject' : 'dashboard.viewAll',
                  )}
                  {isProjects ? <Plus size={15} /> : <ArrowRight size={15} />}
                </button>
              </div>
              {!loading && recentProjects.length === 0 ? (
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
                <div className="dashboard-project-grid">
                  {recentProjects.map((project, index) => (
                    <button
                      className="dashboard-project-card"
                      key={project.id}
                      onClick={() => chooseProject(project.id)}
                      data-testid={`recent-project-${project.id}`}
                    >
                      <span
                        className={`dashboard-project-cover space-color-${index % 5}`}
                      >
                        <Folder size={21} strokeWidth={1.5} />
                      </span>
                      <span className="dashboard-project-text">
                        <strong>{project.name}</strong>
                        <small>
                          {t('dashboard.mapCount', {
                            n: project.map_count || 0,
                          })}{' '}
                          ·{' '}
                          {t('dashboard.updated', {
                            date: relativeDate(project.updated_at, lang),
                          })}
                        </small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
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
                    maxLength={180}
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
