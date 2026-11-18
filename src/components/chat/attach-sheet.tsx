import { Camera, Images, Paperclip } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import { pickDocuments, pickFromCamera, pickFromLibrary } from '@/lib/attachments';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { ATTACHMENT_LIMITS } from '@/shared/types';
import { makeStyles } from '@/theme';
import { ListGroup, ListItem } from '../ui/layout';
import { Sheet } from '../ui/sheet';

const MODAL_DISMISS_MS = 250;

/** Bottom sheet for picking camera photos, library photos, or documents. */
export function AttachSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const count = useAppStore((s) => s.draftAttachments.length);
  const addAttachments = useAppStore((s) => s.addAttachments);
  const showToast = useAppStore((s) => s.showToast);

  const atLimit = count >= ATTACHMENT_LIMITS.maxFiles;

  const launchAfterDismiss = (runner: () => Promise<void>) => {
    onClose();
    if (Platform.OS === 'web') {
      void runner();
      return;
    }
    setTimeout(() => {
      void runner();
    }, MODAL_DISMISS_MS);
  };

  const callbacks = {
    currentCount: count,
    onLimit: (msg: string) => showToast(msg),
    onError: (msg: string) => showToast(msg, 'danger'),
  };

  const handleCamera = () => {
    haptic.select();
    launchAfterDismiss(async () => {
      const items = await pickFromCamera({
        ...callbacks,
        onDenied: () => showToast('Camera access is off. Enable it in Settings to take a photo.', 'danger'),
      });
      if (items.length) addAttachments(items);
    });
  };

  const handleLibrary = () => {
    haptic.select();
    launchAfterDismiss(async () => {
      const items = await pickFromLibrary(callbacks);
      if (items.length) addAttachments(items);
    });
  };

  const handleFiles = () => {
    haptic.select();
    launchAfterDismiss(async () => {
      const items = await pickDocuments(callbacks);
      if (items.length) addAttachments(items);
    });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add to message"
      description={atLimit ? `Maximum ${ATTACHMENT_LIMITS.maxFiles} attachments reached.` : undefined}
    >
      <View style={atLimit ? styles.disabled : undefined} pointerEvents={atLimit ? 'none' : 'auto'}>
        <ListGroup>
          <ListItem icon={Camera} title="Take photo" onPress={atLimit ? undefined : handleCamera} />
          <ListItem icon={Images} title="Photo library" onPress={atLimit ? undefined : handleLibrary} />
          <ListItem
            icon={Paperclip}
            title="Files"
            description="PDF, Word, PowerPoint, Excel, text…"
            onPress={atLimit ? undefined : handleFiles}
          />
        </ListGroup>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  disabled: { opacity: 0.45 },
}));
