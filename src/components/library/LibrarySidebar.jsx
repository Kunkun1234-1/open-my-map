import UserAvatar from '../UserAvatar.jsx';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Globe,
  Home,
  Map,
  Plus,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { navigate } from '../../App.jsx';
import { LanguageSwitch } from '../../i18n/index.jsx';
import './sidebar-groups.css';

const spaceIcons = [Users, Compass, Globe, Map, Compass];

function storageKey(userId) {
  return `open-my-map-sidebar-groups:${userId || 'anonymous'}`;
}

function readGroupState(key) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || '{}');
    return {
      projects: saved.projects !== false,
    };
  } catch {
    return { projects: true };
  }
}

function writeGroupState(key, state) {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export default function LibrarySidebar({
  user,
  projects,
  section,
  selectedProjectId,
  animateProjectSelection = false,
  onNavigate,
  onProject,
  onCreateProject,
  open,
  onClose,
  t,
}) {
  const [mobile, setMobile] = useState(
    () => window.matchMedia('(max-width:640px)').matches,
  );
  const currentStorageKey = storageKey(user?.id);
  const [groups, setGroups] = useState(() =>
    readGroupState(currentStorageKey),
  );
  const [manuallyCollapsedProjectId, setManuallyCollapsedProjectId] =
    useState(null);
  const closeRef = useRef(null);
  const loadedStorageKeyRef = useRef(currentStorageKey);
  useEffect(() => {
    const media = window.matchMedia('(max-width:640px)');
    const update = (event) => {
      setMobile(event.matches);
      if (!event.matches) onClose();
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    return () => previousFocus?.focus();
  }, [mobile, open]);
  useEffect(() => {
    if (loadedStorageKeyRef.current !== currentStorageKey) return;
    writeGroupState(currentStorageKey, groups);
  }, [currentStorageKey, groups]);
  useEffect(() => {
    if (loadedStorageKeyRef.current === currentStorageKey) return;
    loadedStorageKeyRef.current = currentStorageKey;
    setGroups(readGroupState(currentStorageKey));
  }, [currentStorageKey]);
  useEffect(() => {
    if (selectedProjectId === 'all' || selectedProjectId == null) {
      setManuallyCollapsedProjectId(null);
      return;
    }
    setManuallyCollapsedProjectId((current) =>
      current === selectedProjectId ? current : null,
    );
    setGroups((current) =>
      current.projects ? current : { ...current, projects: true },
    );
  }, [selectedProjectId]);
  const name = user?.displayName || user?.name || t('library.account');
  const toggleProjects = () => {
    const willCollapse = projectsExpanded;
    setManuallyCollapsedProjectId(
      willCollapse && selectedProjectId !== 'all'
        ? selectedProjectId
        : null,
    );
    setGroups((current) => ({
      ...current,
      projects: !projectsExpanded,
    }));
  };
  const chooseProject = (projectId) => {
    setGroups((current) =>
      current.projects ? current : { ...current, projects: true },
    );
    onProject(projectId);
  };
  const selectedProjectIsConcrete =
    selectedProjectId !== 'all' && selectedProjectId != null;
  const projectsExpanded =
    groups.projects ||
    (selectedProjectIsConcrete &&
      manuallyCollapsedProjectId !== selectedProjectId);
  return (
    <>
      {open ? (
        <button
          className="dashboard-nav-backdrop"
          onClick={onClose}
          aria-label={t('dashboard.closeNavigation')}
        />
      ) : null}
      <aside
        className={`dashboard-sidebar${open ? ' is-open' : ''}`}
        aria-label={t('library.menu')}
        inert={mobile && !open}
      >
        <div className="dashboard-brand-row">
          <button
            className="dashboard-brand"
            onClick={() => onNavigate('home')}
            aria-label={t('library.homeAria')}
          >
            <svg
              width="23"
              height="25"
              viewBox="0 0 23 25"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m2 5 6-3 7 2 6-2v18l-6 3-7-2-6 2V5Z"
                fill="currentColor"
              />
              <path
                d="M8 7v10M15 8v10"
                stroke="white"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <span>Open My Map</span>
          </button>
          <button
            ref={closeRef}
            className="icon-button dashboard-close-nav"
            onClick={onClose}
            aria-label={t('dashboard.closeNavigation')}
          >
            <X size={19} />
          </button>
        </div>
        <nav className="dashboard-main-nav sidebar-groups" aria-label={t('library.menu')}>
          <button
            className={
              section === 'home' && selectedProjectId === 'all'
                ? 'active'
                : ''
            }
            onClick={() => onNavigate('home')}
            aria-current={
              section === 'home' && selectedProjectId === 'all'
                ? 'page'
                : undefined
            }
          >
            <Home size={17} strokeWidth={1.7} />
            <span>{t('dashboard.home')}</span>
          </button>

          <button
            className={
              ['maps', 'shared', 'favorites', 'trash'].includes(section) &&
              selectedProjectId === 'all'
                ? 'active'
                : ''
            }
            onClick={() => onNavigate('maps')}
            aria-current={
              ['maps', 'shared', 'favorites', 'trash'].includes(section) &&
              selectedProjectId === 'all'
                ? 'page'
                : undefined
            }
          >
            <Map size={17} strokeWidth={1.7} />
            <span>{t('dashboard.maps')}</span>
          </button>

          <section className="sidebar-nav-group sidebar-project-group">
            <div className="sidebar-nav-group-heading">
              <button
                type="button"
                className={`sidebar-nav-group-link${
                  section === 'projects' ? ' active' : ''
                }`}
                onClick={() => onNavigate('projects')}
                aria-current={section === 'projects' ? 'page' : undefined}
              >
                <Compass size={17} strokeWidth={1.7} />
                <span>{t('dashboard.projects')}</span>
              </button>
              <button
                type="button"
                className="sidebar-nav-group-toggle"
                onClick={toggleProjects}
                aria-expanded={projectsExpanded}
                aria-controls="sidebar-project-children"
                aria-label={t(
                  projectsExpanded
                    ? 'dashboard.collapseProjects'
                    : 'dashboard.expandProjects',
                )}
              >
                {projectsExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
            </div>
            {projectsExpanded ? (
              <div id="sidebar-project-children" className="sidebar-nav-children sidebar-project-children">
                {projects.map((project, index) => {
                  const Icon = spaceIcons[index % spaceIcons.length];
                  return (
                    <button
                      key={project.id}
                      className={selectedProjectId === project.id ? 'active' : ''}
                      style={{ viewTransitionName: animateProjectSelection && selectedProjectId === project.id ? 'project-selection' : undefined }}
                      onClick={() => chooseProject(project.id)}
                      aria-current={selectedProjectId === project.id ? 'page' : undefined}
                      data-testid={`project-filter-${project.id}`}
                      title={project.name}
                    >
                      <span className={`space-icon space-color-${index % 5}`}>
                        <Icon size={14} strokeWidth={1.8} />
                      </span>
                      <span style={{ viewTransitionName: !animateProjectSelection && section === 'maps' && selectedProjectId === project.id ? `project-${project.id}` : undefined }}>{project.name}</span>
                    </button>
                  );
                })}
                <button onClick={onCreateProject} className="dashboard-new-space">
                  <Plus size={16} />
                  <span>{t('library.createProject')}</span>
                </button>
              </div>
            ) : null}
          </section>
        </nav>
        <div className="dashboard-sidebar-bottom">
          <div className="dashboard-sidebar-utilities">
            <LanguageSwitch />
            {user?.role === 'admin' ? (
              <button
                className="icon-button"
                onClick={() => navigate('/admin')}
                aria-label={t('library.admin')}
              >
                <Shield size={15} />
              </button>
            ) : null}
          </div>
          <button
            className="dashboard-account"
            onClick={() => navigate('/me')}
            aria-label={t('dashboard.account')}
          >
            <UserAvatar user={user} className="dashboard-initial" />
            <span className="dashboard-account-text">
              <strong>{name}</strong>
              <small>{t('dashboard.plan')}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}
