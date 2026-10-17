import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function useProtectedImage(source) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!source) return undefined;
    let active = true;
    let objectUrl;
    api.fetchImage(source).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({ source, url: objectUrl });
    }).catch(() => {
      if (active) setImage(null);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);
  return source && image?.source === source ? image.url : '';
}
