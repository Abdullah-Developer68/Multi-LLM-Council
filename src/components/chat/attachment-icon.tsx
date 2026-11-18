import { FileCode, FileText, Image as ImageIcon, Presentation, Table } from 'lucide-react-native';

import type { AttachmentKind } from '@/shared/types';

export function AttachmentKindIcon({
  kind,
  color,
  size = 16,
  strokeWidth = 1.75,
}: {
  kind: AttachmentKind;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  switch (kind) {
    case 'image':
      return <ImageIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'presentation':
      return <Presentation size={size} color={color} strokeWidth={strokeWidth} />;
    case 'spreadsheet':
      return <Table size={size} color={color} strokeWidth={strokeWidth} />;
    case 'text':
      return <FileCode size={size} color={color} strokeWidth={strokeWidth} />;
    case 'pdf':
    case 'document':
    default:
      return <FileText size={size} color={color} strokeWidth={strokeWidth} />;
  }
}
