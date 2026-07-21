import { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, LogOut, Monitor, Shield, User as UserIcon } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { navigate } from '../App.jsx';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const { t } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || user?.name || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const roleLabel = {
    admin: t('profile.roleAdmin'),
    editor: t('profile.roleEditor'),
  };

  useEffect(() => {
    setDisplayName(user?.displayName || user?.name || '');
  }, [user]);

  const load = async () => {
    try {
      setSessions(await api.sessions());
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  useEffect(() => { load(); }, []);

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  const onRevokeAll = async () => {
    if (!window.confirm(t('profile.confirmRevoke'))) return;
    try {
      await api.revokeSessions();
      await onLogout();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const onSaveProfile = async (event) => {
    event.preventDefault();
    setProfileBusy(true);
    setError('');
    setMessage('');
    try {
      await api.updateProfile({ name: displayName.trim() });
      await refresh();
      setMessage(t('profile.nicknameUpdated'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProfileBusy(false);
    }
  };

  const onChangePassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('login.passwordMismatch'));
      return;
    }
    setPasswordBusy(true);
    setError('');
    setMessage('');
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(t('profile.passwordUpdated'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-card profile-card">
        <div className="profile-lang-row">
          <LanguageSwitch />
        </div>
        <div className="profile-header">
          <span className="profile-avatar">{(user?.displayName || user?.name || '?').slice(0, 1)}</span>
          <div>
            <h1>{user?.displayName || user?.name || t('profile.title')}</h1>
            <p className="profile-email">{user?.email || ''}</p>
            <span className={`profile-role ${user?.role === 'admin' ? 'is-admin' : ''}`}>
              <Shield size={13} /> {roleLabel[user?.role] || user?.role || '—'}
            </span>
          </div>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}
        {message ? <div className="inline-success">{message}</div> : null}

        <section className="profile-section">
          <h2><UserIcon size={16} /> {t('profile.title')}</h2>
          <form className="profile-form" onSubmit={onSaveProfile}>
            <label>{t('profile.displayName')}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} required /></label>
            <label>{t('login.email')}<input value={user?.email || ''} disabled readOnly /></label>
            <button type="submit" className="admin-outline-button" disabled={profileBusy}>
              {profileBusy ? t('common.loading') : t('profile.saveProfile')}
            </button>
          </form>
        </section>

        <section className="profile-section">
          <h2><KeyRound size={16} /> {t('profile.changePassword')}</h2>
          <form className="profile-form" onSubmit={onChangePassword}>
            <label>{t('profile.currentPassword')}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
            <label>{t('profile.newPassword')}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} autoComplete="new-password" required /></label>
            <label>{t('profile.confirmPassword')}<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} autoComplete="new-password" required /></label>
            <button type="submit" className="admin-outline-button" disabled={passwordBusy}>
              {passwordBusy ? t('common.loading') : t('profile.changePassword')}
            </button>
          </form>
        </section>

        <section className="profile-section">
          <h2><Monitor size={16} /> {t('profile.sessions')}</h2>
          <ul className="profile-sessions">
            {sessions.length === 0 ? <li className="profile-empty">—</li> : null}
            {sessions.map((session) => (
              <li key={session.id}>
                <span className="profile-session-agent" title={session.user_agent}>
                  {session.user_agent || '—'}
                </span>
                <span className="profile-session-meta">
                  {session.ip || '—'} · {new Date(session.last_seen_at).toLocaleString()}
                </span>
                <span className={`profile-session-current ${session.id === window.localStorage.getItem('open-my-map-session') ? 'is-current' : ''}`}>
                  {session.id === window.localStorage.getItem('open-my-map-session') ? '●' : ''}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="admin-outline-button" onClick={onRevokeAll}>{t('profile.revokeAll')}</button>
        </section>

        <footer className="profile-actions">
          <button type="button" className="admin-text-button" onClick={() => navigate('/')}><ArrowLeft size={16} /> {t('profile.back')}</button>
          <button type="button" className="admin-primary-button" onClick={onLogout}><LogOut size={16} /> {t('profile.logout')}</button>
        </footer>
      </section>
    </main>
  );
}
