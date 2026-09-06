import {
  File, FileArchive, FileCode2, FileImage, FileSpreadsheet, FileText, FileVideo, Link2,
  type LucideIcon,
} from 'lucide-react';

export type ItemKind = 'artifact' | 'link' | 'image' | 'document' | 'sheet' | 'video' | 'archive' | 'file';

/** Kind drives both the icon and its colour tile, so a scan of the list separates types by shape and hue. */
export function itemKind(type: string, mime?: string | null): ItemKind {
  if (type === 'link') return 'link';
  if (type === 'artifact') return 'artifact';
  const value = mime || '';
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('video/')) return 'video';
  if (value === 'application/pdf' || value.startsWith('text/') || value.includes('word') || value.includes('document')) return 'document';
  if (value.includes('sheet') || value.includes('excel') || value.includes('csv')) return 'sheet';
  if (value.includes('zip') || value.includes('compressed') || value.includes('tar')) return 'archive';
  return 'file';
}

const icons: Record<ItemKind, LucideIcon> = {
  artifact: FileCode2,
  link: Link2,
  image: FileImage,
  document: FileText,
  sheet: FileSpreadsheet,
  video: FileVideo,
  archive: FileArchive,
  file: File,
};

const labels: Record<ItemKind, string> = {
  artifact: 'Interactive artifact',
  link: 'Link',
  image: 'Image',
  document: 'Document',
  sheet: 'Spreadsheet',
  video: 'Video',
  archive: 'Archive',
  file: 'File',
};

export function itemTypeLabel(type: string, mime?: string | null) {
  return labels[itemKind(type, mime)];
}

export function ItemIcon({ type, mime, size = 18 }: { type: string; mime?: string | null; size?: number }) {
  const kind = itemKind(type, mime);
  const Icon = icons[kind];
  return <span className="type-icon" data-kind={kind}><Icon size={size} strokeWidth={1.75} aria-hidden="true" /></span>;
}
