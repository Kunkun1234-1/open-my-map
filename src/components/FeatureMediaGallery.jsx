import { Trash2 } from 'lucide-react';

export const MAX_ATTACHMENTS_PER_FEATURE = 12;
export const MAX_FILES_PER_UPLOAD = 8;
export const MEDIA_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.avif,.mp4,.webm,.mov,.m4v,image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/x-m4v';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function validateMediaSelection(fileList, existingCount = 0) {
  const files = Array.from(fileList || []);
  if (!files.length) return [];
  if (files.length > MAX_FILES_PER_UPLOAD) throw new Error(`每次最多上传 ${MAX_FILES_PER_UPLOAD} 个文件`);
  if (existingCount + files.length > MAX_ATTACHMENTS_PER_FEATURE) throw new Error(`每个地点最多保存 ${MAX_ATTACHMENTS_PER_FEATURE} 个附件`);

  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extension);
    const isVideo = file.type.startsWith('video/') || VIDEO_EXTENSIONS.has(extension);
    if (!isImage && !isVideo) throw new Error(`“${file.name}”不是支持的图片或视频`);
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > limit) throw new Error(`“${file.name}”超过${isImage ? '图片 15 MB' : '视频 100 MB'}限制`);
  }
  return files;
}

export default function FeatureMediaGallery({
  attachments = [],
  featureName = '地点',
  compact = false,
  editable = false,
  deletingId = null,
  onDelete,
}) {
  if (!attachments.length) return null;
  const visibleAttachments = compact ? attachments.slice(0, 3) : attachments;
  const remaining = attachments.length - visibleAttachments.length;

  return (
    <div className={compact ? 'feature-media-grid compact' : 'feature-media-grid'}>
      {visibleAttachments.map((attachment) => (
        <article className={`feature-media-item ${attachment.kind}`} key={attachment.id}>
          {attachment.kind === 'image' ? (
            <a href={attachment.url} target="_blank" rel="noreferrer" aria-label={`打开图片 ${attachment.original_name}`}>
              <img src={attachment.url} alt={`${featureName} · ${attachment.original_name}`} loading="lazy" decoding="async" />
            </a>
          ) : (
            <video src={attachment.url} controls playsInline preload="metadata" aria-label={`${featureName} · ${attachment.original_name}`} />
          )}
          {!compact ? <div className="feature-media-meta"><span title={attachment.original_name}>{attachment.original_name}</span><small>{formatFileSize(attachment.size_bytes)}</small></div> : null}
          {editable ? (
            <button type="button" className="feature-media-delete" onClick={() => onDelete?.(attachment)} disabled={deletingId === attachment.id} aria-label={`删除附件 ${attachment.original_name}`}>
              <Trash2 size={14} />
            </button>
          ) : null}
        </article>
      ))}
      {remaining > 0 ? <span className="feature-media-more">另有 {remaining} 项</span> : null}
    </div>
  );
}
