import { useRef, useState } from 'react';
import {
  Map as MapIcon,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react';
import { api } from '../../api.js';
import LibraryDialog from './LibraryDialog.jsx';
import MapCard from './MapCard.jsx';
import CoverField from './CoverField.jsx';
import { relativeDate } from './helpers.js';

export default function MapsTable({
  maps,
  user,
  lang,
  t,
  trashed,
  view = 'table',
  renderOverview,
  onOpen,
  onPreview,
  onCreateMap,
  onRefresh,
  onToast,
}) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [coverChange, setCoverChange] = useState({ mode: 'keep' });
  const [focusField, setFocusField] = useState('name');
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latestConflict, setLatestConflict] = useState(null);
  const nameRef = useRef(null);
  const descriptionRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const canEdit = (map) =>
    isAdmin || map.my_role === 'owner' || map.my_role === 'editor';
  const canDelete = (map) => isAdmin || map.my_role === 'owner';

  const openEditor = (map, field = 'name') => {
    if (
      trashed ||
      !canEdit(map) ||
      busy ||
      rowBusyId !== null ||
      refreshing
    )
      return;
    setError('');
    setRefreshFailed(false);
    setConflict(false);
    setLatestConflict(null);
    setForm({ name: map.name, description: map.description || '' });
    setCoverChange({ mode: 'keep' });
    setFocusField(field);
    setEditing({ ...map });
  };

  const openDeleteDialog = (map) => {
    if (!canDelete(map) || busy || rowBusyId !== null || refreshing) return;
    setError('');
    setRefreshFailed(false);
    setConflict(false);
    setLatestConflict(null);
    setDeleting(map);
  };

  const closeDialog = () => {
    if (busy) return;
    setEditing(null);
    setCoverChange({ mode: 'keep' });
    setDeleting(null);
    setError('');
    setRefreshFailed(false);
    setConflict(false);
    setLatestConflict(null);
  };

  const refreshAfterMutation = async (successKey) => {
    onToast(t(successKey));
    try {
      await onRefresh();
      setError('');
      setRefreshFailed(false);
    } catch {
      setError(t('dashboard.mapRefreshFailed'));
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
      setError(t('dashboard.mapRefreshFailed'));
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  };

  const refreshEditingVersion = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setError('');
    try {
      const latest = await api.map(editing.id);
      setForm((current) => ({
        name: current.name === editing.name ? latest.name : current.name,
        description:
          current.description === (editing.description || '')
            ? latest.description || ''
            : current.description,
      }));
      setEditing((current) =>
        current
          ? {
              ...current,
              name: latest.name,
              description: latest.description || '',
              version: latest.version,
              cover_url: latest.cover_url,
              updated_at: latest.updated_at,
              feature_count: latest.layers.reduce((count, layer) => count + layer.features.length, 0),
            }
          : current,
      );
      setConflict(false);
      setLatestConflict(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (!editing || busy || coverChange.mode === 'invalid') return;
    setBusy(true);
    setError('');
    setConflict(false);
    try {
      const metadata = {
        name: form.name.trim(),
        description: form.description.trim(),
        expectedVersion: editing.version,
      };
      if (coverChange.mode === 'upload') {
        await api.uploadCover('maps', editing.id, coverChange.file, metadata);
      } else if (coverChange.mode === 'reset') {
        await api.resetCover('maps', editing.id, metadata);
      } else {
        await api.updateMap(editing.id, metadata);
      }
      setEditing(null);
      setConflict(false);
      setLatestConflict(null);
      await refreshAfterMutation('dashboard.mapSaved');
    } catch (requestError) {
      if (requestError.status === 409 || requestError.conflict) {
        setConflict(true);
        setLatestConflict(requestError.latest || null);
        setError(t('dashboard.mapConflict'));
      } else {
        setError(requestError.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (event) => {
    event.preventDefault();
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    try {
      if (trashed) {
        await api.deleteMap(deleting.id);
      } else {
        await api.trashMap(deleting.id);
      }
      setDeleting(null);
      await refreshAfterMutation(
        trashed ? 'dashboard.deletedSuccess' : 'dashboard.trashSuccess',
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (map) => {
    if (!canDelete(map) || rowBusyId !== null) return;
    setRowBusyId(map.id);
    setError('');
    setRefreshFailed(false);
    try {
      await api.restoreMap(map.id);
      await refreshAfterMutation('dashboard.restoreSuccess');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRowBusyId(null);
    }
  };

  const toggleFavorite = async (map) => {
    if (trashed || rowBusyId !== null) return;
    setRowBusyId(map.id);
    setError('');
    setRefreshFailed(false);
    try {
      await api.favoriteMap(map.id, !map.is_favorite);
      await refreshAfterMutation('dashboard.favoriteSuccess');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRowBusyId(null);
    }
  };

  const rowsLocked = busy || rowBusyId !== null || refreshing;

  return (
    <>
      {view === 'table' ? (
        <p className="dashboard-project-table-hint">
        {t(trashed ? 'dashboard.trashHint' : view === 'grid' ? 'dashboard.mapCardHint' : 'dashboard.mapTableHint')}
        </p>
      ) : null}
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
      {renderOverview ? renderOverview({ onEdit: openEditor, canEdit, disabled: rowsLocked }) : view === 'grid' ? (
        <div className="dashboard-map-grid">
          {maps.map((map, index) => (
            <MapCard
              key={map.id}
              map={map}
              index={index}
              lang={lang}
              t={t}
              trashed={trashed}
              editable={!trashed && canEdit(map)}
              deletable={canDelete(map)}
              disabled={rowsLocked}
              onOpen={() => onOpen(map.id)}
              onPreview={() =>
                onPreview ? onPreview(map.id) : onOpen(map.id)
              }
              onFavorite={() => toggleFavorite(map)}
              onTrash={() => openDeleteDialog(map)}
              onRestore={() => restore(map)}
              onDelete={() => openDeleteDialog(map)}
              onEdit={() => openEditor(map)}
              onRefresh={onRefresh}
              onToast={onToast}
            />
          ))}
          {!trashed && onCreateMap ? (
            <button
              type="button"
              className="dashboard-create-card"
              disabled={rowsLocked}
              onClick={onCreateMap}
            >
              <span>
                <Plus size={26} strokeWidth={1.5} />
              </span>
              <strong>{t('dashboard.createNewMap')}</strong>
              <small>{t('dashboard.mapHint')}</small>
            </button>
          ) : null}
        </div>
      ) : (
        <div
          className="dashboard-project-table-scroll"
          role="region"
          aria-label={t('dashboard.maps')}
          tabIndex={0}
        >
        <table className="dashboard-project-table dashboard-map-table">
          <thead>
            <tr>
              <th scope="col">{t('dashboard.newMapName')}</th>
              <th scope="col">{t('dashboard.mapDescription')}</th>
              <th scope="col">{t('dashboard.chooseProject')}</th>
              <th scope="col">{t('library.layers')}</th>
              <th scope="col">{t('library.features')}</th>
              <th scope="col">{t('dashboard.lastModified')}</th>
              <th scope="col">{t('dashboard.projectActions')}</th>
            </tr>
          </thead>
          <tbody>
            {maps.map((map) => {
              const editable = !trashed && canEdit(map);
              const deletable = canDelete(map);
              return (
                <tr key={map.id} data-testid={`map-row-${map.id}`}>
                  <td
                    className={editable ? 'editable' : ''}
                    onDoubleClick={() => openEditor(map)}
                    title={
                      editable
                        ? t('dashboard.doubleClickEdit')
                        : map.name
                    }
                  >
                    <span className="dashboard-project-table-name">
                      <MapIcon size={17} />
                      <strong>{map.name}</strong>
                    </span>
                  </td>
                  <td
                    className={
                      editable
                        ? 'editable dashboard-project-description'
                        : 'dashboard-project-description'
                    }
                    onDoubleClick={() => openEditor(map, 'description')}
                    title={
                      editable
                        ? t('dashboard.doubleClickEdit')
                        : map.description || ''
                    }
                  >
                    {map.description || (
                      <span className="dashboard-muted">—</span>
                    )}
                  </td>
                  <td>{map.project_name || '—'}</td>
                  <td>{map.layer_count || 0}</td>
                  <td>{map.feature_count || 0}</td>
                  <td title={map.updated_at}>
                    {relativeDate(map.updated_at, lang)}
                  </td>
                  <td>
                    <div className="dashboard-project-row-actions">
                      {!trashed ? (
                        <button
                          type="button"
                          onClick={() => onOpen(map.id)}
                          disabled={rowsLocked}
                        >
                          {t('common.open')}
                        </button>
                      ) : null}
                      {!trashed ? (
                        <button
                          type="button"
                          className="dashboard-action-icon"
                          disabled={rowsLocked}
                          title={t(map.is_favorite ? 'dashboard.unfavorite' : 'dashboard.favorite')}
                          aria-label={t(
                            map.is_favorite
                              ? 'dashboard.unfavorite'
                              : 'dashboard.favorite',
                          )}
                          aria-pressed={Boolean(map.is_favorite)}
                          onClick={() => toggleFavorite(map)}
                        >
                          <Star
                            size={14}
                            fill={map.is_favorite ? 'currentColor' : 'none'}
                          />
                        </button>
                      ) : null}
                      {!trashed ? (
                        <button
                          type="button"
                          className="dashboard-action-icon"
                          disabled={!editable || rowsLocked}
                          title={
                            !editable
                              ? t('dashboard.mapEditPermission')
                              : t('dashboard.editMap')
                          }
                          aria-label={t('dashboard.editMapNamed', {
                            name: map.name,
                          })}
                          onClick={() => openEditor(map)}
                        >
                          <Pencil size={14} />
                        </button>
                      ) : null}
                      {trashed ? (
                        <button
                          type="button"
                          className="dashboard-action-icon"
                          disabled={!deletable || rowsLocked}
                          aria-label={t('dashboard.restore')}
                          title={
                            !deletable
                              ? t('dashboard.mapDeletePermission')
                              : t('dashboard.restore')
                          }
                          onClick={() => restore(map)}
                        >
                          <RotateCcw size={14} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="dashboard-action-icon danger"
                        disabled={!deletable || rowsLocked}
                        title={
                          !deletable
                            ? t('dashboard.mapDeletePermission')
                            : t(trashed ? 'dashboard.deleteForever' : 'common.delete')
                        }
                        aria-label={t('dashboard.deleteMapNamed', {
                          name: map.name,
                        })}
                        onClick={() => openDeleteDialog(map)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {editing ? (
        <LibraryDialog
          title={t('dashboard.editMap')}
          onClose={closeDialog}
          closeLabel={t('common.close')}
          initialFocusRef={
            focusField === 'name' ? nameRef : descriptionRef
          }
        >
          <form className="dialog-form" onSubmit={submitEdit}>
            {error ? (
              <div className="inline-error" role="alert">
                <span>{error}</span>
                {conflict && latestConflict ? (
                  <p>
                    {t('dashboard.mapLatestValues', {
                      name: latestConflict.name,
                      description: latestConflict.description || '—',
                    })}
                  </p>
                ) : null}
                {conflict ? (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={refreshEditingVersion}
                  >
                    {t('dashboard.reloadMapVersion')}
                  </button>
                ) : null}
              </div>
            ) : null}
            <label>
              {t('dashboard.newMapName')}
              <input
                ref={nameRef}
                required
                maxLength={120}
                disabled={busy}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              {t('dashboard.mapDescription')}
              <textarea
                ref={descriptionRef}
                rows={4}
                maxLength={2000}
                disabled={busy}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <CoverField entity={editing} kind="maps" value={coverChange} onChange={setCoverChange} t={t} disabled={busy} />
            <footer className="dialog-actions">
              <button
                type="button"
                className="text-button"
                onClick={closeDialog}
                disabled={busy}
              >
                {t('common.cancel')}
              </button>
              <button
                className="dashboard-primary"
                disabled={busy || !form.name.trim() || conflict || coverChange.mode === 'invalid'}
              >
                {t(busy ? 'dashboard.projectWorking' : 'common.save')}
              </button>
            </footer>
          </form>
        </LibraryDialog>
      ) : null}

      {deleting ? (
        <LibraryDialog
          title={t('dashboard.deleteMapNamed', { name: deleting.name })}
          onClose={closeDialog}
          closeLabel={t('common.close')}
        >
          <form className="dialog-form" onSubmit={confirmDelete}>
            {error ? (
              <div className="inline-error" role="alert">
                {error}
              </div>
            ) : null}
            <p>
              {t(
                trashed
                  ? 'dashboard.permanentWarning'
                  : 'dashboard.confirmTrash',
                { name: deleting.name },
              )}
            </p>
            <footer className="dialog-actions">
              <button
                type="button"
                className="text-button"
                onClick={closeDialog}
                disabled={busy}
              >
                {t('common.cancel')}
              </button>
              <button
                className="dashboard-primary dashboard-danger-button"
                disabled={busy}
              >
                {t(
                  busy
                    ? 'dashboard.projectWorking'
                    : trashed
                      ? 'dashboard.deleteForever'
                      : 'common.delete',
                )}
              </button>
            </footer>
          </form>
        </LibraryDialog>
      ) : null}
    </>
  );
}
