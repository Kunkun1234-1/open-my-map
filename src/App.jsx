import { useEffect, useState } from 'react';
import MapLibrary from './components/MapLibrary.jsx';
import MapEditor from './components/MapEditor.jsx';
import AdminConsole from './components/AdminConsole.jsx';
import PublicView from './components/PublicView.jsx';
import LoginPage from './components/LoginPage.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import { I18nProvider, useI18n } from './i18n/index.jsx';

export function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function parseRoute(pathname) {
  const editorMatch = pathname.match(/^\/maps\/(\d+)/);
  const publicMatch = pathname.match(/^\/view\/([^/]+)/);
  if (pathname.startsWith('/admin')) return { page: 'admin' };
  if (pathname === '/login') return { page: 'login' };
  if (pathname === '/me') return { page: 'me' };
  if (editorMatch) return { page: 'editor', mapId: Number(editorMatch[1]) };
  if (publicMatch) return { page: 'public', token: publicMatch[1] };
  return { page: 'library' };
}

function Router() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const { user, loading } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    const onRoute = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);

  const isPublic = route.page === 'public' || route.page === 'login';
  useEffect(() => {
    if (!loading && !user && !isPublic) {
      navigate('/login');
    }
  }, [loading, user, isPublic]);

  if (route.page === 'login') return <LoginPage />;
  if (route.page === 'me') return <ProfilePage />;
  if (route.page === 'admin') return <AdminConsole />;
  if (route.page === 'public') return <PublicView token={route.token} />;
  if (loading) return <div className="loading-state">{t('common.loading')}</div>;
  if (!user) return <LoginPage />;
  if (route.page === 'editor') return <MapEditor mapId={route.mapId} />;
  return <MapLibrary />;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </I18nProvider>
  );
}
