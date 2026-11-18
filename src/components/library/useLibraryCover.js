import { useState } from 'react';
import useProtectedImage from '../../useProtectedImage.js';
import { defaultCoverUrl } from './helpers.js';

export default function useLibraryCover(entity, kind, { useDefault = false } = {}) {
  const uploaded = useProtectedImage(useDefault ? '' : entity.cover_url);
  const [invalidUrl, setInvalidUrl] = useState('');
  const invalidUpload = Boolean(uploaded.url) && uploaded.url === invalidUrl;

  const onError = (event) => {
    if (uploaded.url && event.currentTarget.getAttribute('src') === uploaded.url) {
      setInvalidUrl(uploaded.url);
    }
  };

  return {
    url: uploaded.url && !invalidUpload ? uploaded.url : defaultCoverUrl(entity, kind),
    error: uploaded.error || invalidUpload,
    retry: uploaded.retry,
    onError,
  };
}
