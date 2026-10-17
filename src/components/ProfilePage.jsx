import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, LogOut, Monitor, RefreshCw, Shield, Upload, User as UserIcon } from 'lucide-react';
import { api, getSessionId } from '../api.js';
import { useAuth } from '../auth.jsx';
import { navigate } from '../App.jsx';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';
import UserAvatar from './UserAvatar.jsx';
import HomeAppearance from './profile/HomeAppearance.jsx';
import './profile.css';

function describeSession(userAgent, t) {
  const ua = userAgent || '';
  let browser = t('profile.unknownBrowser');
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/(?:Chrome|CriOS)\//.test(ua)) browser = 'Chrome';
  else if (/(?:Firefox|FxiOS)\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  let platform = t('profile.unknownDevice');
  if (/(?:iPhone|iPad|iPod)/.test(ua)) platform = 'iOS';
  else if (/Android/.test(ua)) platform = 'Android';
  else if (/(?:Macintosh|Mac OS X)/.test(ua)) platform = 'macOS';
  else if (/Windows/.test(ua)) platform = 'Windows';
  else if (/Linux/.test(ua)) platform = 'Linux';
  return { browser, platform };
}

function PasswordField({ label, value, onChange, autoComplete, visible, onToggle, t }) {
  const inputId = useId();
  const visibilityLabel = t(visible ? 'profile.hidePassword' : 'profile.showPassword');
  return (
    <div className="profile-field">
      <label htmlFor={inputId}>{label}</label>
      <span className="profile-password-control">
        <input id={inputId} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} minLength={autoComplete === 'new-password' ? 6 : undefined} required />
        <button type="button" onClick={onToggle} aria-label={`${visibilityLabel} · ${label}`} title={`${visibilityLabel} · ${label}`} aria-pressed={visible}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading, logout, refresh } = useAuth();
  const { lang, t } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [sessionsError, setSessionsError] = useState('');
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || user?.name || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordVisibility, setPasswordVisibility] = useState({ current: false, next: false, confirm: false });
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef(null);
  const mountedRef = useRef(true);

  const roleLabel = { admin: t('profile.roleAdmin'), editor: t('profile.roleEditor') };

  useEffect(() => {
    setDisplayName(user?.displayName || user?.name || '');
  }, [user?.displayName, user?.name]);

  useEffect(() => {
    if (!loading && user && window.location.hash === '#home-appearance') {
      document.getElementById('home-appearance')?.scrollIntoView({ block: 'start' });
    }
  }, [loading, user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadSessions = useCallback(async () => {
    if (!mountedRef.current) return;
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const nextSessions = await api.sessions();
      if (mountedRef.current) setSessions(nextSessions);
    } catch (requestError) {
      if (mountedRef.current) setSessionsError(requestError.message);
    } finally {
      if (mountedRef.current) setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return undefined;
    loadSessions();
    return undefined;
  }, [loadSessions, loading, user]);

  const changeAvatar = async (file) => {
    if (avatarBusy) return;
    setError('');
    setMessage('');
    if (file) {
      const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
      const unknownType = !file.type || file.type === 'application/octet-stream';
      if (!supported.includes(file.type) && !(unknownType && /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name))) {
        setError(t('profile.avatarInvalidType'));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(t('profile.avatarTooLarge'));
        return;
      }
    }
    setAvatarBusy(true);
    try {
      if (file) await api.uploadAvatar(file);
      else await api.resetAvatar();
      await refresh();
      setMessage(t(file ? 'profile.avatarUpdated' : 'profile.avatarReset'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAvatarBusy(false);
    }
  };

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
      setSessionsError(requestError.message);
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

  if (loading) return <main className="profile-state-page">{t('common.loading')}</main>;
  if (!user) {
    return <main className="profile-state-page"><button type="button" onClick={() => navigate('/login')}>{t('login.submitLogin')}</button></main>;
  }

  const name = user.displayName || user.name || t('profile.title');
  const currentSessionId = getSessionId();
  const togglePassword = (field) => setPasswordVisibility((current) => ({ ...current, [field]: !current[field] }));

  return (
    <div className="profile-page-shell">
      <div className="profile-workspace">
        <header className="profile-topbar">
          <button type="button" onClick={() => navigate('/')}><ArrowLeft size={15} />{t('profile.library')}</button>
          <span className="profile-wordmark">Open My Map</span>
          <LanguageSwitch className="profile-language-switch" />
        </header>

        <main className="profile-main">
          <header className="profile-title-block">
            <div className="profile-title-copy"><h1>{t('profile.settings')}</h1><p>{t('profile.settingsHint')}</p></div>
            <section className="profile-identity" aria-label={name}>
            <UserAvatar user={user} className="profile-avatar" />
            <div><strong>{name}</strong><span>{user.email}</span></div>
            <span className="profile-role-badge"><Shield size={13} />{roleLabel[user.role] || user.role || '—'}</span>
            </section>
          </header>

          {error ? <div className="profile-alert is-error" role="alert">{error}</div> : null}
          {message ? <div className="profile-alert is-success" role="status">{message}</div> : null}

          <div className="profile-panels">
            <section id="profile-details" className="profile-panel">
              <div className="profile-panel-heading"><UserIcon size={20} /><div><h2>{t('profile.title')}</h2><p>{t('profile.profileHint')}</p></div></div>
              <form className="profile-form" onSubmit={onSaveProfile}>
                <div className="profile-avatar-field" aria-busy={avatarBusy}>
                  <span className="profile-avatar-label">{t('profile.avatar')}</span>
                  <div className="profile-avatar-editor">
                    <UserAvatar user={user} className="profile-avatar profile-avatar-preview" />
                    <div>
                      <div className="profile-avatar-actions">
                        <button type="button" className="profile-secondary-button" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}><Upload size={14} />{t(avatarBusy ? 'profile.avatarUploading' : user.avatarUrl ? 'profile.changeAvatar' : 'profile.uploadAvatar')}</button>
                        {user.avatarUrl?.startsWith('/api/users/') ? <button type="button" className="profile-avatar-reset" disabled={avatarBusy} onClick={() => changeAvatar(null)}>{t('profile.resetAvatar')}</button> : null}
                      </div>
                      <p>{t('profile.avatarHint')}</p>
                    </div>
                  </div>
                  <input ref={avatarInputRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) changeAvatar(file); }} />
                </div>
                <label className="profile-field"><span>{t('profile.displayName')}</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} required /><small>{t('profile.nicknameHint')}</small></label>
                <label className="profile-field"><span>{t('login.email')}</span><input value={user.email || ''} disabled readOnly /><small>{t('profile.emailHint')}</small></label>
                <button type="submit" className="profile-primary-button" disabled={profileBusy}>{profileBusy ? t('common.loading') : t('profile.saveProfile')}</button>
              </form>
            </section>

            <section id="profile-security" className="profile-panel">
              <div className="profile-panel-heading"><KeyRound size={20} /><div><h2>{t('profile.changePassword')}</h2><p>{t('profile.securityHint')}</p></div></div>
              <form className="profile-form" onSubmit={onChangePassword}>
                <PasswordField label={t('profile.currentPassword')} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" visible={passwordVisibility.current} onToggle={() => togglePassword('current')} t={t} />
                <PasswordField label={t('profile.newPassword')} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" visible={passwordVisibility.next} onToggle={() => togglePassword('next')} t={t} />
                <PasswordField label={t('profile.confirmPassword')} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" visible={passwordVisibility.confirm} onToggle={() => togglePassword('confirm')} t={t} />
                <p className="profile-password-hint">{t('profile.passwordHint')}</p>
                <button type="submit" className="profile-primary-button" disabled={passwordBusy}>{passwordBusy ? t('common.loading') : t('profile.changePassword')}</button>
              </form>
            </section>
          </div>

          <HomeAppearance />

          <section id="profile-sessions" className="profile-panel profile-sessions-panel">
            <div className="profile-panel-heading profile-sessions-heading"><Monitor size={20} /><div><h2>{t('profile.sessions')}</h2><p>{t('profile.sessionsHint')}</p></div><button type="button" className="profile-secondary-button" onClick={onRevokeAll}><LogOut size={15} />{t('profile.revokeAll')}</button></div>
            {sessionsError ? <div className="profile-session-error" role="alert"><span>{sessionsError}</span><button type="button" disabled={sessionsLoading} onClick={() => loadSessions()}><RefreshCw size={14} />{t('profile.refreshSessions')}</button></div> : null}
            <div className="profile-sessions-table" role="table">
              <div className="profile-session-row is-heading" role="row"><span role="columnheader">{t('profile.device')}</span><span role="columnheader">{t('profile.ipAddress')}</span><span role="columnheader">{t('profile.lastActive')}</span><span role="columnheader">{t('profile.status')}</span></div>
              {!sessionsLoading && sessions.length === 0 ? <div className="profile-session-empty">{t('profile.noSessions')}</div> : null}
              {sessionsLoading && sessions.length === 0 ? <div className="profile-session-empty">{t('common.loading')}</div> : null}
              {sessions.map((session) => {
                const device = describeSession(session.user_agent, t);
                const current = session.id === currentSessionId;
                return (
                  <div key={session.id} className="profile-session-row" role="row" title={session.user_agent || ''}>
                    <span className="profile-session-device" role="cell"><span className="profile-device-icon"><Monitor size={16} /></span><span><strong>{device.browser}</strong><small>{device.platform}</small></span></span>
                    <span data-label={t('profile.ipAddress')} role="cell">{session.ip || '—'}</span>
                    <span data-label={t('profile.lastActive')} role="cell">{new Date(session.last_seen_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en')}</span>
                    <span data-label={t('profile.status')} role="cell"><span className={`profile-session-status${current ? ' is-current' : ''}`}>{t(current ? 'profile.currentDevice' : 'profile.otherDevice')}</span></span>
                  </div>
                );
              })}
            </div>
          </section>

          <footer className="profile-logout-row"><div><strong>{t('profile.logout')}</strong><span>{t('profile.logoutHint')}</span></div><button type="button" onClick={onLogout}><LogOut size={16} />{t('profile.logout')}</button></footer>
        </main>
      </div>
    </div>
  );
}
