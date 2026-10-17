import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export default function useProtectedImage(source) {
  const [image, setImage] = useState({ source: '', url: '', error: false });
  const [requestVersion, setRequestVersion] = useState(0);
  const retry = useCallback(() => {
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!source) {
      setImage({ source: '', url: '', error: false });
      return undefined;
    }
    let active = true;
    let objectUrl;
    setImage({ source, url: '', error: false });
    api.fetchImage(source).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({ source, url: objectUrl, error: false });
    }).catch(() => {
      if (active) setImage({ source, url: '', error: true });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requestVersion, source]);

  const matchesSource = Boolean(source) && image.source === source;
  return {
    url: matchesSource ? image.url : '',
    error: matchesSource && image.error,
    retry,
  };
}
