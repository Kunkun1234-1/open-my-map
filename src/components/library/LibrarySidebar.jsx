import UserAvatar from '../UserAvatar.jsx';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Shield,
  X,
} from 'lucide-react';
import { navigate } from '../../App.jsx';
import { LanguageSwitch } from '../../i18n/index.jsx';
import './sidebar-groups.css';

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
  open,
  onClose,
  lang,
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
  const logoLocale = lang === 'en' ? 'en' : 'zh';
  const appName = logoLocale === 'en' ? 'Map Talk' : t('common.appName');
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
            type="button"
            className="dashboard-brand"
            onClick={() => onNavigate('home')}
            aria-label={t('library.homeAria', { name: appName })}
          >
            <img className="dashboard-brand-mark" src={`/images/map-talk-logo-${logoLocale}.svg`} width="1706" height="481" alt="" />
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
        <nav className="dashboard-main-nav" aria-label={t('library.menu')}>
          <button
            onClick={() => onNavigate('home')}
            aria-current={
              section === 'home' && selectedProjectId === 'all'
                ? 'page'
                : undefined
            }
          >
            <span>{t('dashboard.home')}</span>
          </button>

          <button
            onClick={() => onNavigate('maps')}
            aria-current={
              ['maps', 'shared', 'favorites', 'trash'].includes(section) &&
              selectedProjectId === 'all'
                ? 'page'
                : undefined
            }
          >
            <span>{t('dashboard.maps')}</span>
          </button>

          <div className="sidebar-nav-group-heading">
              <button
                type="button"
                className="sidebar-nav-group-link"
                onClick={() => onNavigate('projects')}
                aria-current={section === 'projects' ? 'page' : undefined}
              >
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
              <div id="sidebar-project-children" className="sidebar-project-children">
                {projects.map((project, index) => (
                  <button
                    key={project.id}
                    style={{ viewTransitionName: animateProjectSelection && selectedProjectId === project.id ? 'project-selection' : undefined }}
                    onClick={() => chooseProject(project.id)}
                    aria-current={selectedProjectId === project.id ? 'page' : undefined}
                    data-testid={`project-filter-${project.id}`}
                    title={project.name}
                  >
                    <span className="sidebar-project-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <span style={{ viewTransitionName: !animateProjectSelection && section === 'maps' && selectedProjectId === project.id ? `project-${project.id}` : undefined }}>{project.name}</span>
                  </button>
                ))}
              </div>
          ) : null}
          <button type="button" onClick={() => onNavigate('about')}
            aria-current={section === 'about' ? 'page' : undefined}>
            <span>{t('dashboard.about')}</span>
          </button>
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
