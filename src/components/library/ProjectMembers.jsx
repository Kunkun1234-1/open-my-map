import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../../api.js';

export default function MembersPanel({
  project,
  members: initialMembers = [],
  canManage,
  onChanged,
  refreshKey,
  t,
}) {
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

  useEffect(() => {
    load();
  }, [project.id, refreshKey]);

  const changeRole = async (member, role) => {
    setBusyId(member.userId);
    try {
      await api.updateProjectMember(project.id, member.userId, { role });
      await load();
      await onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (member) => {
    if (!window.confirm(t('library.confirmRemove', { name: member.name })))
      return;
    setBusyId(member.userId);
    try {
      await api.removeProjectMember(project.id, member.userId);
      await load();
      await onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  const transfer = async (member) => {
    if (!window.confirm(t('library.confirmTransfer', { name: member.name })))
      return;
    setBusyId(member.userId);
    try {
      await api.transferProject(project.id, member.userId);
      await load();
      await onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="project-members-panel"
      aria-label={t('library.projectMembers')}
    >
      <header>
        <h3>
          <Users size={16} /> {t('library.membersHeading')}
        </h3>
        <span>{t('library.peopleCount', { n: members.length })}</span>
      </header>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <p className="muted">{t('library.loadingMembers')}</p> : null}
      <ul className="project-members-list">
        {members.map((member) => (
          <li key={member.userId}>
            <span className="member-avatar">
              {(member.name || '?').slice(0, 1)}
            </span>
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
              <span className="member-role">
                {memberRoleLabel[member.role] || member.role}
              </span>
            )}
            {canManage && member.role !== 'owner' ? (
              <div className="member-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busyId === member.userId}
                  onClick={() => transfer(member)}
                >
                  {t('library.transfer')}
                </button>
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busyId === member.userId}
                  onClick={() => removeMember(member)}
                >
                  {t('library.remove')}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
