import { useEffect, useState } from 'react';
import { api } from '../api.js';
import './user-avatar.css';

export default function UserAvatar({ user, className = '' }) {
  const source = user?.avatarUrl || '';
  const [loaded, setLoaded] = useState(null);
  const [failedSource, setFailedSource] = useState(null);
  const protectedSource = source.startsWith('/api/users/');
  const imageUrl = protectedSource ? (loaded?.source === source ? loaded.url : '') : source;

  useEffect(() => {
    if (!protectedSource) return undefined;
    let active = true;
    let objectUrl;
    api.fetchAvatar(source).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ source, url: objectUrl });
    }).catch(() => {
      if (active) setLoaded(null);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, protectedSource]);

  return (
    <span className={`user-avatar ${className}`.trim()} aria-hidden="true">
      {(user?.displayName || user?.name || '?').slice(0, 1)}
      {imageUrl && failedSource !== imageUrl ? <img src={imageUrl} alt="" onError={() => setFailedSource(imageUrl)} /> : null}
    </span>
  );
}
