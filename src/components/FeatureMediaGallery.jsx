import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import './feature-media-gallery.css';

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
  deleteDisabled = false,
  deletingId = null,
  onDelete,
}) {
  const [activeImageId, setActiveImageId] = useState(null);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const images = useMemo(() => attachments.filter((attachment) => attachment.kind === 'image'), [attachments]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const activeImage = images.find((attachment) => attachment.id === activeImageId) || null;

  const closeLightbox = () => setActiveImageId(null);
  const moveLightbox = (offset) => {
    setActiveImageId((currentId) => {
      const currentImages = imagesRef.current;
      if (currentImages.length < 2) return currentId;
      const currentIndex = currentImages.findIndex((attachment) => attachment.id === currentId);
      const nextIndex = ((currentIndex < 0 ? 0 : currentIndex) + offset + currentImages.length) % currentImages.length;
      return currentImages[nextIndex].id;
    });
  };

  useEffect(() => {
    if (activeImageId !== null && !activeImage) setActiveImageId(null);
  }, [activeImage, activeImageId]);

  const lightboxOpen = activeImage !== null;
  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event) => {
      // The image dialog owns keyboard input while open, including editor shortcuts.
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveLightbox(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveLightbox(1);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled)') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    };
  }, [lightboxOpen]);

  if (!attachments.length) return null;
  const visibleAttachments = compact && !editable ? attachments.slice(0, 3) : attachments;
  const remaining = attachments.length - visibleAttachments.length;

  return (
    <div className={`feature-media-grid${compact ? ' compact' : ''}${editable ? ' editable' : ''}`}>
      {visibleAttachments.map((attachment) => (
        <article className={`feature-media-item ${attachment.kind}`} key={attachment.id}>
          {attachment.kind === 'image' ? (
            <button
              type="button"
              className="feature-media-open"
              aria-label={`查看大图 ${attachment.original_name}`}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setActiveImageId(attachment.id);
              }}
            >
              <img src={attachment.url} alt={`${featureName} · ${attachment.original_name}`} loading="lazy" decoding="async" />
            </button>
          ) : (
            <video src={attachment.url} controls playsInline preload="metadata" aria-label={`${featureName} · ${attachment.original_name}`} />
          )}
          {!compact ? <div className="feature-media-meta"><span title={attachment.original_name}>{attachment.original_name}</span><small>{formatFileSize(attachment.size_bytes)}</small></div> : null}
          {editable ? (
            <button type="button" className="feature-media-delete" onClick={() => onDelete?.(attachment)} disabled={deleteDisabled || deletingId === attachment.id} aria-label={`删除附件 ${attachment.original_name}`} title="删除附件">
              <X size={12} strokeWidth={1.5} />
            </button>
          ) : null}
        </article>
      ))}
      {remaining > 0 ? <span className="feature-media-more">另有 {remaining} 项</span> : null}
      {activeImage && typeof document !== 'undefined' ? createPortal(
        <div className="feature-media-lightbox" onMouseDown={(event) => { if (event.target === event.currentTarget) closeLightbox(); }}>
          <section ref={dialogRef} className="feature-media-lightbox-dialog" role="dialog" aria-modal="true" aria-label={`${featureName} · 图片查看`}>
            <header>
              <strong title={activeImage.original_name}>{activeImage.original_name}</strong>
              <span>{images.findIndex((attachment) => attachment.id === activeImage.id) + 1} / {images.length}</span>
              <button ref={closeRef} type="button" onClick={closeLightbox} aria-label="关闭大图 / Close image" title="关闭"><X size={22} /></button>
            </header>
            <div className="feature-media-lightbox-stage">
              {images.length > 1 ? <button type="button" className="feature-media-lightbox-previous" onClick={() => moveLightbox(-1)} aria-label="上一张图片 / Previous image" title="上一张"><ChevronLeft size={28} /></button> : null}
              <img src={activeImage.url} alt={`${featureName} · ${activeImage.original_name}`} />
              {images.length > 1 ? <button type="button" className="feature-media-lightbox-next" onClick={() => moveLightbox(1)} aria-label="下一张图片 / Next image" title="下一张"><ChevronRight size={28} /></button> : null}
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
