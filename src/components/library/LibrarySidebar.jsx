import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Compass,
  Folder,
  Globe,
  Home,
  Map,
  Menu,
  Plus,
  Shield,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { navigate } from '../../App.jsx';
import { LanguageSwitch } from '../../i18n/index.jsx';

const sections = [
  ['home', Home],
  ['maps', Map],
  ['projects', Folder],
  ['shared', Users],
  ['favorites', Star],
  ['trash', Trash2],
];
const spaceIcons = [Users, Compass, Globe, Map, Compass];

export default function LibrarySidebar({
  user,
  projects,
  section,
  selectedProjectId,
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
  const closeRef = useRef(null);
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
  const name = user?.displayName || user?.name || t('library.account');
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
        <nav className="dashboard-main-nav" aria-label={t('library.menu')}>
          {sections.map(([key, Icon]) => (
            <button
              key={key}
              className={
                section === key && selectedProjectId === 'all' ? 'active' : ''
              }
              onClick={() => onNavigate(key)}
              aria-current={
                section === key && selectedProjectId === 'all'
                  ? 'page'
                  : undefined
              }
            >
              <Icon size={17} strokeWidth={1.7} />
              <span>{t(`dashboard.${key}`)}</span>
            </button>
          ))}
        </nav>
        <div className="dashboard-spaces-heading">
          <span>{t('dashboard.spaces')}</span>
          <ChevronDown size={13} />
        </div>
        <nav className="dashboard-spaces" aria-label={t('library.myProjects')}>
          {projects.map((project, index) => {
            const Icon = spaceIcons[index % spaceIcons.length];
            return (
              <button
                key={project.id}
                className={selectedProjectId === project.id ? 'active' : ''}
                onClick={() => onProject(project.id)}
                data-testid={`project-filter-${project.id}`}
                title={project.name}
              >
                <span className={`space-icon space-color-${index % 5}`}>
                  <Icon size={14} strokeWidth={1.8} />
                </span>
                <span>{project.name}</span>
              </button>
            );
          })}
          <button onClick={onCreateProject} className="dashboard-new-space">
            <Plus size={16} />
            <span>{t('dashboard.newSpace')}</span>
          </button>
        </nav>
        <div className="dashboard-sidebar-bottom">
          <button
            className="dashboard-promo"
            onClick={() => onNavigate('maps')}
          >
            <span>
              {t('dashboard.promo')}
              <br />
              {t('dashboard.promoSecond')}
            </span>
            <span className="dashboard-promo-arrow">
              <ArrowRight size={17} />
            </span>
          </button>
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
            <span className="dashboard-initial">{name.slice(0, 1)}</span>
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
