import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, Folder, Grid3X3, Layers, List, Map as MapIcon, MapPin,
  Menu, MoreVertical, Plus, Search, Shield, SortAsc, Users,
} from 'lucide-react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { useAuth } from '../auth.jsx';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';
import { AMAP_CONFIGURED } from '../amap.js';
import {
  AMAP_PROVIDER, baseMapPreviewStyle, formatDate, getBaseMapConfig,
} from '../utils.js';

function Brand({ label }) {
  return (
    <button className="brand-button" onClick={() => navigate('/')} aria-label={label}>
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span><b>Open</b> My Map</span>
    </button>
  );
}

function ProjectCard({ project, active, isAll = false, onSelect, t }) {
  return (
    <button
      type="button"
      className={`project-card project-card--sidebar${active ? ' active' : ''}${isAll ? ' all-projects' : ''}`}
      onClick={onSelect}
      role="tab"
      aria-selected={active}
      data-testid={isAll ? 'project-filter-all' : `project-filter-${project.id}`}
    >
      <span className="project-card-topline">
        <span className="project-card-icon"><Folder size={20} /></span>
        <span className="project-card-type">{isAll ? t('library.workspaceType') : t('library.projectType')}</span>
        {active ? <span className="project-card-current">{t('library.current')}</span> : <ChevronRight className="project-card-arrow" size={17} />}
      </span>
      <strong title={project.name}>{project.name}</strong>
      <span className="project-card-description">
        {project.description || (isAll
          ? t('library.allProjectsDesc')
          : t('library.managedBy', { name: project.owner_name || t('library.unassigned') }))}
      </span>
      <span className="project-card-stats" aria-label={`${project.map_count} ${t('library.maps')}, ${project.layer_count} ${t('library.layers')}, ${project.feature_count} ${t('library.features')}`}>
        <span><MapIcon size={13} /> {project.map_count} {t('library.maps')}</span>
        <span><Layers size={13} /> {project.layer_count} {t('library.layers')}</span>
        <span><MapPin size={13} /> {project.feature_count} {t('library.features')}</span>
      </span>
    </button>
  );
}

function MapCard({ map, onOpen, onDelete, t }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const baseMap = getBaseMapConfig(map.base_map);
  return (
    <article className="map-card" data-testid={`map-card-${map.id}`}>
      <button
        className="map-card-preview"
        onClick={onOpen}
        style={baseMapPreviewStyle(map.base_map, map.center_lat, map.center_lng, map.zoom)}
        aria-label={t('library.openMap', { name: map.name })}
      >
        <span className={AMAP_CONFIGURED ? 'map-card-source' : 'map-card-source config-missing'}>
          {AMAP_CONFIGURED ? baseMap.name : t('library.needAmapKey')}
        </span>
        <span className="mini-pin one" /><span className="mini-pin two" /><span className="mini-line" />
      </button>
      <div className="map-card-body">
        <span className="map-card-project" title={map.project_name || t('library.unassignedProject')}>
          <Folder size={12} /> {map.project_name || t('library.unassignedProject')}
        </span>
        <button className="map-card-title" onClick={onOpen}>{map.name}</button>
        <div className="map-card-meta">
          <span>{formatDate(map.updated_at)}</span>
          <span>{map.layer_count} {t('library.layers')} · {map.feature_count} {t('library.features')}</span>
        </div>
        <button className="icon-button card-more" onClick={() => setMenuOpen((value) => !value)} aria-label={t('library.mapActions')}>
          <MoreVertical size={19} />
        </button>
        {menuOpen ? (
          <div className="popup-menu card-menu">
            <button onClick={onOpen}>{t('library.openInEditor')}</button>
            <button onClick={() => navigate(`/maps/${map.id}?preview=1`)}>{t('library.previewMap')}</button>
            <button className="danger" onClick={onDelete}>{t('library.moveToTrash')}</button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MembersPanel({ project, members: initialMembers = [], canManage, onChanged, t }) {
  const [members, setMembers] = useState(initialMembers);
  const [loading, setLoading] = useState(initialMembers.length === 0);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const memberRoleLabel = {
    owner: t('library.roleOwner'),
    editor: t('library.roleEditor'),
    viewer: t('library.roleViewer'),
  };

  const load = async () => {
    try {
      setLoading(true);
      setMembers(await api.projectMembers(project.id));
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [project.id]);

  const changeRole = async (member, role) => {
    setBusyId(member.userId);
    try {
      await api.updateProjectMember(project.id, member.userId, { role });
      await load();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (member) => {
    if (!window.confirm(t('library.confirmRemove', { name: member.name }))) return;
    setBusyId(member.userId);
    try {
      await api.removeProjectMember(project.id, member.userId);
      await load();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  const transfer = async (member) => {
    if (!window.confirm(t('library.confirmTransfer', { name: member.name }))) return;
    setBusyId(member.userId);
    try {
      await api.transferProject(project.id, member.userId);
      await load();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="project-members-panel" aria-label={t('library.projectMembers')}>
      <header>
        <h3><Users size={16} /> {t('library.membersHeading')}</h3>
        <span>{t('library.peopleCount', { n: members.length })}</span>
      </header>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <p className="muted">{t('library.loadingMembers')}</p> : null}
      <ul className="project-members-list">
        {members.map((member) => (
          <li key={member.userId}>
            <span className="member-avatar">{(member.name || '?').slice(0, 1)}</span>
            <span className="member-meta">
              <b>{member.name}</b>
              <small>{member.email}</small>
            </span>
            {canManage && member.role !== 'owner' ? (
              <select
                value={member.role}
                disabled={busyId === member.userId}
                onChange={(event) => changeRole(member, event.target.value)}
                aria-label={`${member.name}`}
              >
                <option value="editor">{t('library.roleEditor')}</option>
                <option value="viewer">{t('library.roleViewer')}</option>
              </select>
            ) : (
              <span className="member-role">{memberRoleLabel[member.role] || member.role}</span>
            )}
            {canManage && member.role !== 'owner' ? (
              <div className="member-actions">
                <button type="button" className="text-button" disabled={busyId === member.userId} onClick={() => transfer(member)}>{t('library.transfer')}</button>
                <button type="button" className="text-button danger" disabled={busyId === member.userId} onClick={() => removeMember(member)}>{t('library.remove')}</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function MapLibrary() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [maps, setMaps] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [listMode, setListMode] = useState(false);
  const [error, setError] = useState('');
  const [projectDialog, setProjectDialog] = useState(false);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [projectMembers, setProjectMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'editor' });
  const [dialogBusy, setDialogBusy] = useState(false);

  const tabs = [
    ['all', t('library.tabAll')],
    ['owned', t('library.tabOwned')],
    ['shared', t('library.tabShared')],
    ['recent', t('library.tabRecent')],
  ];

  const loadLibrary = async () => {
    try {
      setLoading(true);
      const [nextMaps, nextProjects] = await Promise.all([api.maps(), api.projects()]);
      setMaps(nextMaps);
      setProjects(nextProjects);
      setSelectedProjectId((current) => (
        current === 'all' || nextProjects.some((project) => project.id === current) ? current : 'all'
      ));
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLibrary(); }, []);

  const projectSummary = useMemo(() => projects.reduce((summary, project) => ({
    ...summary,
    map_count: summary.map_count + Number(project.map_count || 0),
    layer_count: summary.layer_count + Number(project.layer_count || 0),
    feature_count: summary.feature_count + Number(project.feature_count || 0),
  }), {
    id: 'all',
    name: t('library.allProjects'),
    description: t('library.allProjectsDesc'),
    map_count: 0,
    layer_count: 0,
    feature_count: 0,
  }), [projects, t]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    let cancelled = false;
    const loadProjectMembers = async () => {
      if (!selectedProject || selectedProjectId === 'all') {
        setProjectMembers([]);
        setMembersLoading(false);
        return;
      }
      setMembersLoading(true);
      try {
        const nextMembers = await api.projectMembers(selectedProject.id);
        if (!cancelled) setProjectMembers(nextMembers);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    };

    loadProjectMembers();
    return () => { cancelled = true; };
  }, [selectedProject, selectedProjectId]);

  const canManageSelected = Boolean(
    selectedProject
    && (user?.role === 'admin' || selectedProject.owner_user_id === user?.id || selectedProject.my_role === 'owner'),
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let list = maps.filter((map) => {
      if (selectedProjectId !== 'all' && map.project_id !== selectedProjectId) return false;
      if (!normalized) return true;
      return `${map.name} ${map.description} ${map.project_name || ''}`.toLowerCase().includes(normalized);
    });

    if (activeTab === 'owned') {
      list = list.filter((map) => map.is_owner || map.my_role === 'owner' || map.my_role === 'admin');
    } else if (activeTab === 'shared') {
      list = list.filter((map) => !map.is_owner && map.my_role !== 'owner' && map.my_role !== 'admin');
    } else if (activeTab === 'recent') {
      list = [...list].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 12);
    }

    return list;
  }, [maps, query, selectedProjectId, activeTab]);

  const createMap = async () => {
    try {
      if (!projects.length) {
        setProjectDialog(true);
        setError(t('library.needProjectFirst'));
        return;
      }
      const targetProjectId = selectedProject?.id || projects[0]?.id;
      const map = await api.createMap({ name: t('library.untitledMap'), projectId: targetProjectId });
      navigate(`/maps/${map.id}`);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const createProject = async (event) => {
    event.preventDefault();
    if (!projectForm.name.trim()) return;
    setDialogBusy(true);
    try {
      const project = await api.createProject({
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
      });
      setProjectDialog(false);
      setProjectForm({ name: '', description: '' });
      await loadLibrary();
      setSelectedProjectId(project.id);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDialogBusy(false);
    }
  };

  const inviteMember = async (event) => {
    event.preventDefault();
    if (!selectedProject || !inviteForm.email.trim()) return;
    setDialogBusy(true);
    try {
      await api.inviteProjectMember(selectedProject.id, {
        email: inviteForm.email.trim(),
        role: inviteForm.role,
      });
      setInviteDialog(false);
      setInviteForm({ email: '', role: 'editor' });
      setMembersOpen(true);
      await loadLibrary();
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDialogBusy(false);
    }
  };

  const deleteMap = async (map) => {
    if (!window.confirm(t('library.confirmDeleteMap', { name: map.name }))) return;
    try {
      await api.deleteMap(map.id);
      await loadLibrary();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <main className="library-page">
      <div className="library-shell">
        <aside className="library-sidebar">
          <Brand label={t('library.homeAria')} />
          <label className="library-search library-search--sidebar">
            <Search size={20} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('library.searchPlaceholder')} aria-label={t('library.searchPlaceholder')} />
          </label>
          <nav className="library-project-rail" aria-label={t('library.projectsFolder')}>
            <button
              type="button"
              className="project-card project-card--sidebar all-projects workspace-parent-card"
              onClick={() => {
                setSelectedProjectId('all');
                setMembersOpen(false);
              }}
              role="tab"
              aria-selected={selectedProjectId === 'all'}
              data-testid="project-filter-all"
            >
              <span className="project-card-topline">
                <span className="project-card-icon"><Folder size={20} /></span>
                <span className="project-card-type">{t('library.workspaceType')}</span>
                {selectedProjectId === 'all' ? <span className="project-card-current">{t('library.current')}</span> : <ChevronRight className="project-card-arrow" size={17} />}
              </span>
              <strong title={projectSummary.name}>{projectSummary.name}</strong>
              <span className="project-card-description">{projectSummary.description}</span>
              <span className="project-card-stats" aria-label={`${projectSummary.map_count} ${t('library.maps')}, ${projectSummary.layer_count} ${t('library.layers')}, ${projectSummary.feature_count} ${t('library.features')}`}>
                <span><MapIcon size={13} /> {projectSummary.map_count} {t('library.maps')}</span>
                <span><Layers size={13} /> {projectSummary.layer_count} {t('library.layers')}</span>
                <span><MapPin size={13} /> {projectSummary.feature_count} {t('library.features')}</span>
              </span>
            </button>

            {!loading && projects.length > 0 ? (
              <div className="workspace-project-list" role="tablist" aria-label={t('library.myProjects')}>
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    active={selectedProjectId === project.id}
                    onSelect={() => {
                      setSelectedProjectId(project.id);
                      setMembersOpen(true);
                    }}
                    t={t}
                  />
                ))}
              </div>
            ) : !loading && projects.length === 0 ? (
              <div className="empty-projects empty-projects--sidebar">
                <Folder size={24} />
                <div>
                  <strong>{t('library.noProjectsTitle')}</strong>
                  <span>{t('library.noProjectsHint')}</span>
                </div>
              </div>
          ) : null}
          </nav>
          <button
            type="button"
            className="library-profile-footer"
            onClick={() => navigate('/me')}
            aria-label={t('library.account')}
            title={user?.displayName || user?.name || ''}
          >
            <span className="library-profile-avatar" aria-hidden="true">
              {(user?.displayName || user?.name || '?').slice(0, 1)}
            </span>
            <span className="library-profile-meta">
              <strong>{user?.displayName || user?.name || t('library.account')}</strong>
              <small>{t('library.account')}</small>
            </span>
          </button>
        </aside>

        <section className="library-content">
          <div className="library-toolbar">
            <nav className="library-tabs" aria-label={t('library.searchPlaceholder')}>
              {tabs.map(([key, label]) => (
                <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>{label}</button>
              ))}
            </nav>
            <div className="library-view-actions">
              <LanguageSwitch className="library-lang-switch" />
              <button className="icon-button" onClick={() => setListMode((value) => !value)} aria-label={t('library.toggleList')}>
                {listMode ? <Grid3X3 size={19} /> : <List size={19} />}
              </button>
              <button className="icon-button" aria-label={t('library.sort')}><SortAsc size={19} /></button>
              {user?.role === 'admin' ? (
                <button className="admin-link" onClick={() => navigate('/admin')}><Shield size={17} /> {t('library.admin')}</button>
              ) : null}
            </div>
          </div>

          {error ? <div className="inline-error">{error}</div> : null}
          {loading ? <div className="loading-state">{t('common.loading')}</div> : null}

          {!loading ? (
            <div className="project-map-heading">
              <div>
                <span className="project-map-path">
                  <Folder size={13} /> {selectedProject?.name || t('library.allProjects')} <ChevronRight size={13} /> {t('library.maps')}
                </span>
                <h2>{selectedProject ? t('library.projectMaps') : t('library.allMaps')}</h2>
                <p>
                  {selectedProject
                    ? selectedProject.description || t('library.managedByOwner', { name: selectedProject.owner_name || t('library.roleOwner') })
                    : t('library.selectProjectHint')}
                </p>
              </div>
              <div className="project-map-actions">
                {canManageSelected ? (
                  <>
                    <button className="secondary-button" onClick={() => setMembersOpen((value) => !value)}>
                      <Users size={16} /> {membersOpen ? t('library.collapseMembers') : t('library.manageMembers')}
                    </button>
                    <button className="secondary-button" onClick={() => { setError(''); setInviteDialog(true); }}>
                      <Users size={16} /> {t('library.inviteMembers')}
                    </button>
                  </>
                ) : selectedProject ? (
                  <button className="secondary-button" onClick={() => setMembersOpen((value) => !value)}>
                    <Users size={16} /> {membersOpen ? t('library.collapseMembers') : t('library.viewMembers')}
                  </button>
                ) : null}
                <span className="map-count">{t('library.mapCount', { n: filtered.length })}</span>
              </div>
            </div>
          ) : null}

          {selectedProject && membersOpen ? (
            <MembersPanel project={selectedProject} members={projectMembers} canManage={canManageSelected} onChanged={loadLibrary} t={t} />
          ) : null}

          {!loading && filtered.length === 0 ? (
            <div className="empty-library">
              <Users size={36} />
              <h2>{t('library.noMatchTitle')}</h2>
              <p>
                {selectedProject
                  ? t('library.noMatchInProject', { name: selectedProject.name })
                  : projects.length
                    ? t('library.noMatchSearch')
                    : t('library.createProjectFirst')}
              </p>
              <button className="primary-button" onClick={projects.length ? createMap : () => setProjectDialog(true)}>
                {projects.length ? t('library.createMap') : t('library.createProject')}
              </button>
            </div>
          ) : (
            <div className={listMode ? 'map-grid list-mode' : 'map-grid'}>
              {filtered.map((map) => (
                <MapCard key={map.id} map={map} onOpen={() => navigate(`/maps/${map.id}`)} onDelete={() => deleteMap(map)} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>
      <footer className="library-footer">{t('library.footer', { provider: AMAP_PROVIDER })}</footer>

      {projectDialog ? (
        <div className="modal-backdrop">
          <section className="modal-dialog" role="dialog" aria-modal="true" aria-label={t('library.createProject')}>
            <header><h2>{t('library.createProject')}</h2><button type="button" className="icon-button" onClick={() => setProjectDialog(false)} aria-label={t('common.close')}>×</button></header>
            <form className="dialog-form" onSubmit={createProject}>
              <label>{t('library.projectName')}<input autoFocus required value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder={t('library.projectNamePlaceholder')} maxLength={120} /></label>
              <label>{t('library.projectDesc')}<textarea value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} placeholder={t('library.projectDescPlaceholder')} rows={3} /></label>
              <footer className="dialog-actions">
                <button type="button" className="text-button" onClick={() => setProjectDialog(false)}>{t('common.cancel')}</button>
                <button className="primary-button" disabled={dialogBusy}>{dialogBusy ? t('library.creating') : t('library.create')}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {inviteDialog && selectedProject ? (
        <div className="modal-backdrop">
          <section className="modal-dialog" role="dialog" aria-modal="true" aria-label={t('library.inviteMembers')}>
            <header><h2>{t('library.inviteTo', { name: selectedProject.name })}</h2><button type="button" className="icon-button" onClick={() => setInviteDialog(false)} aria-label={t('common.close')}>×</button></header>
            <form className="dialog-form" onSubmit={inviteMember}>
              <label>{t('library.memberEmail')}<input autoFocus required type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder={t('library.memberEmailPlaceholder')} /></label>
              <label>{t('library.projectRole')}<select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}><option value="editor">{t('library.roleEditor')}</option><option value="viewer">{t('library.roleViewer')}</option></select></label>
              <footer className="dialog-actions">
                <button type="button" className="text-button" onClick={() => setInviteDialog(false)}>{t('common.cancel')}</button>
                <button className="primary-button" disabled={dialogBusy}>{dialogBusy ? t('library.inviting') : t('library.sendInvite')}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
