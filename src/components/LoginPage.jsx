import { useState } from 'react';
import { ArrowLeft, Mail, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { navigate } from '../App.jsx';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';

export default function LoginPage() {
  const { loginWith, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    if (isRegister) {
      if (!name.trim()) {
        setError(t('login.needNickname'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('login.passwordMismatch'));
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const result = isRegister
        ? await api.register({ name: name.trim(), email: email.trim(), password })
        : await api.login(email.trim(), password);
      await loginWith(result.sessionId);
      navigate('/');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const title = authLoading
    ? t('common.loading')
    : busy
      ? (isRegister ? t('login.titleBusyRegister') : t('login.titleBusyLogin'))
      : (isRegister ? t('login.titleRegister') : t('login.titleLogin'));

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <div className="login-card-top">
          <span className="admin-login-logo">
            {isRegister ? <UserPlus size={24} /> : <Mail size={24} />}
          </span>
          <LanguageSwitch />
        </div>
        <div className="admin-login-brand">Open My Map · {isRegister ? t('login.brandRegister') : t('login.brandLogin')}</div>
        <h1>{title}</h1>
        <p>
          {authLoading || busy
            ? t('login.hintBusy')
            : isRegister
              ? t('login.hintRegister')
              : t('login.hintLogin')}
        </p>
        {error ? <div className="inline-error">{error}</div> : null}
        {authLoading ? null : (
          <form onSubmit={onSubmit}>
            {isRegister ? (
              <label>
                {t('login.nickname')}
                <input autoFocus type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('login.nicknamePlaceholder')} required maxLength={60} />
              </label>
            ) : null}
            <label>
              {t('login.email')}
              <input autoFocus={!isRegister} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
            </label>
            <label>
              {t('login.password')}
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? t('login.passwordPlaceholderNew') : t('login.passwordPlaceholder')} required minLength={6} autoComplete={isRegister ? 'new-password' : 'current-password'} />
            </label>
            {isRegister ? (
              <label>
                {t('login.confirmPassword')}
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t('login.confirmPasswordPlaceholder')} required minLength={6} autoComplete="new-password" />
              </label>
            ) : null}
            <button type="submit" className="admin-primary-button" disabled={busy}>
              {isRegister ? <UserPlus size={16} /> : <Mail size={16} />}
              {busy ? t('common.loading') : (isRegister ? t('login.submitRegister') : t('login.submitLogin'))}
            </button>
            {!isRegister ? (
              <p className="login-dev-hint">admin@openmymap.local / admin123</p>
            ) : null}
          </form>
        )}
        {authLoading ? null : (
          <button type="button" className="admin-text-button login-back" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
            {isRegister ? t('login.switchToLogin') : t('login.switchToRegister')}
          </button>
        )}
        <button className="admin-text-button login-back" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />{t('login.backLibrary')}
        </button>
      </section>
    </main>
  );
}
