import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { useI18n } from '../i18n/index.jsx';
import SharedMapViewer from './SharedMapViewer.jsx';

export default function PublicView({ token }) {
  const { t } = useI18n();
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.publicMap(token).then((data) => {
      if (cancelled) return;
      setResult({ token, data });
      document.title = `${data.name} - Open My Map`;
    }).catch((error) => {
      if (!cancelled) setResult({ token, error: error.message });
    });
    return () => { cancelled = true; };
  }, [token]);

  if (result?.token === token && result.error) return <div className="full-error"><X size={36} /><h1>{t('editor.mapDeleted')}</h1><p>{result.error}</p><button className="primary-button" onClick={() => navigate('/')}>Open My Map</button></div>;
  if (result?.token !== token || !result?.data) return <div className="full-loading"><span className="brand-mark"><i /><i /><i /></span><p>{t('public.loading')}</p></div>;
  return <SharedMapViewer key={token} mapData={result.data} />;
}
