import { useRef, useState } from 'react';
import { Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import CardCover from './CardCover.jsx';
import LibraryDialog from './LibraryDialog.jsx';
import CoverField from './CoverField.jsx';
import { relativeDate } from './helpers.js';

export default function ProjectsTable({
  projects,
  user,
  lang,
  t,
  view = 'table',
  renderOverview,
  onOpen,
  onCreateProject,
  onRefresh,
  onToast,
}) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [coverChange, setCoverChange] = useState({ mode: 'keep' });
  const [focusField, setFocusField] = useState('name');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const nameRef = useRef(null);
  const descriptionRef = useRef(null);
  const canManage = (project) => user?.role === 'admin' || project.my_role === 'owner';
  const edit = (project, field = 'name') => {
    if (busy || !canManage(project)) return;
    setError('');
    setRefreshFailed(false);
    setForm({ name: project.name, description: project.description || '' });
    setCoverChange({ mode: 'keep' });
    setFocusField(field);
    setEditing(project);
  };
  const close = () => {
    if (busy) return;
    setEditing(null);
    setDeleting(null);
    setCoverChange({ mode: 'keep' });
    setError('');
    setRefreshFailed(false);
  };
  const remove = (project) => {
    if (busy || !canManage(project)) return;
    setError('');
    setRefreshFailed(false);
    setDeleting(project);
  };
  const refreshAfterMutation = async (successKey) => {
    onToast(t(successKey));
    try {
      await onRefresh();
      setError('');
      setRefreshFailed(false);
    } catch {
      setError(t('dashboard.projectRefreshFailed'));
      setRefreshFailed(true);
    }
  };
  const retryRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
      setError('');
      setRefreshFailed(false);
    } catch {
      setError(t('dashboard.projectRefreshFailed'));
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busy || (editing && coverChange.mode === 'invalid')) return;
    setBusy(true);
    setError('');
    try {
      if (editing) {
        const metadata = {
          name: form.name.trim(),
          description: form.description.trim(),
        };
        if (coverChange.mode === 'upload') {
          await api.uploadCover(
            'projects',
            editing.id,
            coverChange.file,
            metadata,
          );
        } else if (coverChange.mode === 'reset') {
          await api.resetCover('projects', editing.id, metadata);
        } else {
          await api.updateProject(editing.id, metadata);
        }
      } else {
        await api.deleteProject(deleting.id);
      }
      const successKey = editing
        ? 'dashboard.projectSaved'
        : 'dashboard.projectDeleted';
      setEditing(null);
      setDeleting(null);
      setCoverChange({ mode: 'keep' });
      await refreshAfterMutation(successKey);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {view === 'grid' ? <p className="dashboard-project-table-hint">{t('dashboard.projectCardHint')}</p> : null}
      {renderOverview ? renderOverview({ onEdit: edit, canEdit: canManage, disabled: busy || refreshing }) : view === 'grid' ? (
        <div className="dashboard-project-grid">
          {projects.map((project, index) => {
            const manageable = canManage(project);
            return (
              <article
                key={project.id}
                className="dashboard-map-card dashboard-project-overview-card"
                data-testid={`project-card-${project.id}`}
              >
                <div className="dashboard-card-cover">
                  <CardCover
                    entity={project}
                    kind="projects"
                    index={index}
                    t={t}
                    editable={false}
                    disabled={busy}
                    onOpen={() => onOpen(project.id)}
                    openLabel={t('common.open')}
                    onRefresh={onRefresh}
                    onToast={onToast}
                  />
                </div>
                <div className="dashboard-card-details">
                  <div className="dashboard-card-title-row">
                    <button
                      type="button"
                      className="dashboard-map-title"
                      title={project.name}
                      disabled={busy}
                      onClick={() => onOpen(project.id)}
                    >
                      <span
                        style={{
                          viewTransitionName: `project-${project.id}`,
                        }}
                      >
                        {project.name}
                      </span>
                    </button>
                  </div>
                  <p
                    className="dashboard-card-description"
                    title={
                      manageable
                        ? t('dashboard.doubleClickEdit')
                        : project.description || ''
                    }
                    onDoubleClick={() => edit(project, 'description')}
                  >
                    {project.description || '—'}
                  </p>
                  <div className="dashboard-card-meta">
                    <span>
                      <Folder size={11} />
                      {t('dashboard.mapCount', {
                        n: project.map_count || 0,
                      })}
                    </span>
                    <span title={project.updated_at}>
                      {t('dashboard.modified', {
                        date: relativeDate(project.updated_at, lang),
                      })}
                    </span>
                  </div>
                  <div className="dashboard-project-row-actions">
                    <button
                      type="button"
                      className="dashboard-action-icon"
                      disabled={!manageable || busy}
                      title={
                        !manageable
                          ? t('dashboard.projectOwnerOnly')
                          : t('dashboard.editProject')
                      }
                      aria-label={t('dashboard.editProjectNamed', {
                        name: project.name,
                      })}
                      onClick={() => edit(project)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="dashboard-action-icon danger"
                      disabled={!manageable || busy}
                      title={
                        !manageable
                          ? t('dashboard.projectOwnerOnly')
                          : t('dashboard.deleteProject')
                      }
                      aria-label={t('dashboard.deleteProjectNamed', {
                        name: project.name,
                      })}
                      onClick={() => remove(project)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {onCreateProject ? (
            <button
              type="button"
              className="dashboard-create-card"
              disabled={busy}
              onClick={onCreateProject}
            >
              <span>
                <Plus size={26} strokeWidth={1.5} />
              </span>
              <strong>{t('library.createProject')}</strong>
              <small>{t('dashboard.emptyProjectsHint')}</small>
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <p className="dashboard-project-table-hint">
            {t('dashboard.projectTableHint')}
          </p>
          <div className="dashboard-project-table-scroll" role="region" aria-label={t('dashboard.projects')} tabIndex={0}>
        <table className="dashboard-project-table">
          <thead><tr>
            <th scope="col">{t('library.projectName')}</th>
            <th scope="col">{t('library.projectDesc')}</th>
            <th scope="col">{t('dashboard.projectMapCount')}</th>
            <th scope="col">{t('library.projectRole')}</th>
            <th scope="col">{t('dashboard.lastModified')}</th>
            <th scope="col">{t('dashboard.projectActions')}</th>
          </tr></thead>
          <tbody>{projects.map((project) => {
            const manageable = canManage(project);
            const role = project.my_role === 'admin' || user?.role === 'admin' ? t('library.admin') : project.my_role === 'owner' ? t('library.roleOwner') : project.my_role === 'editor' ? t('library.roleEditor') : t('library.roleViewer');
            return <tr key={project.id} data-testid={`project-row-${project.id}`}>
              <td className={manageable ? 'editable' : ''} onDoubleClick={() => edit(project)} title={manageable ? t('dashboard.doubleClickEdit') : project.name}>
                <span className="dashboard-project-table-name" style={{ viewTransitionName: `project-${project.id}` }}><Folder size={17} /><strong>{project.name}</strong></span>
              </td>
              <td className={manageable ? 'editable dashboard-project-description' : 'dashboard-project-description'} onDoubleClick={() => edit(project, 'description')} title={manageable ? t('dashboard.doubleClickEdit') : project.description}>
                {project.description || <span className="dashboard-muted">—</span>}
              </td>
              <td>{project.map_count || 0}</td>
              <td><span className="dashboard-project-role">{role}</span></td>
              <td title={project.updated_at}>{relativeDate(project.updated_at, lang)}</td>
              <td><div className="dashboard-project-row-actions">
                <button type="button" onClick={() => onOpen(project.id)}>{t('common.open')}</button>
                <button type="button" className="dashboard-action-icon" disabled={!manageable} title={!manageable ? t('dashboard.projectOwnerOnly') : t('dashboard.editProject')} aria-label={t('dashboard.editProjectNamed', { name: project.name })} onClick={() => edit(project)}><Pencil size={14} /></button>
                <button type="button" className="dashboard-action-icon danger" disabled={!manageable} title={!manageable ? t('dashboard.projectOwnerOnly') : t('dashboard.deleteProject')} aria-label={t('dashboard.deleteProjectNamed', { name: project.name })} onClick={() => remove(project)}><Trash2 size={14} /></button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
          </div>
        </>
      )}
      {error && !editing && !deleting ? (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          {refreshFailed ? (
            <button
              type="button"
              className="text-button"
              disabled={refreshing}
              onClick={retryRefresh}
            >
              {t('common.refresh')}
            </button>
          ) : null}
        </div>
      ) : null}
      {editing || deleting ? <LibraryDialog title={t(editing ? 'dashboard.editProject' : 'dashboard.deleteProject')} onClose={close} closeLabel={t('common.close')} initialFocusRef={editing ? (focusField === 'name' ? nameRef : descriptionRef) : undefined}>
        <form className="dialog-form" onSubmit={submit}>
          {error ? <div className="inline-error" role="alert">{error}</div> : null}
          {editing ? <>
            <label>{t('library.projectName')}<input ref={nameRef} required maxLength={120} disabled={busy} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>{t('library.projectDesc')}<textarea ref={descriptionRef} rows={4} maxLength={2000} disabled={busy} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <CoverField entity={editing} value={coverChange} onChange={setCoverChange} t={t} disabled={busy} />
          </> : <>
            <p>{t('dashboard.confirmDeleteProject', { name: deleting.name })}</p>
            <p className="dashboard-project-delete-hint">{t('dashboard.deleteProjectHint')}</p>
          </>}
          <footer className="dialog-actions">
            <button type="button" className="text-button" onClick={close} disabled={busy}>{t('common.cancel')}</button>
            <button className={`dashboard-primary${deleting ? ' dashboard-danger-button' : ''}`} disabled={busy || (editing ? !form.name.trim() || coverChange.mode === 'invalid' : (deleting.total_map_count ?? deleting.map_count) > 0)}>{t(busy ? 'dashboard.projectWorking' : editing ? 'common.save' : 'common.delete')}</button>
          </footer>
        </form>
      </LibraryDialog> : null}
    </>
  );
}
