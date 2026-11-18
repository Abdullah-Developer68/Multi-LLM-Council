import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Image } from 'expo-image';
import { Camera, Check, RotateCcw, SwitchCamera, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Txt } from '@/components/ui/text';
import { cameraPhotoName, prepareImageAsset } from '@/lib/attachments';
import { haptic } from '@/lib/haptics';
import { goBack } from '@/lib/nav';
import { useAppStore } from '@/store';
import { ATTACHMENT_LIMITS } from '@/shared/types';
import { palettes, radius } from '@/theme';

/** Camera chrome always sits on black, so it uses the dark palette whatever the app theme. */
const c = palettes.dark;

/**
 * In-app camera for attaching photos. Renders the camera itself (expo-camera)
 * instead of handing off to the system camera app, which some Android builds
 * refuse to resolve from Expo Go ("Failed to resolve activity").
 */
export default function CameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mountError, setMountError] = useState<string | null>(null);
  const addAttachments = useAppStore((s) => s.addAttachments);
  const attachedCount = useAppStore((s) => s.draftAttachments.length);
  const showToast = useAppStore((s) => s.showToast);

  const capture = async () => {
    if (!cameraRef.current || !ready || busy) return;
    haptic.tap();
    setBusy(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setPhotoUri(picture.uri);
    } catch (err) {
      showToast(`Couldn't take the photo (${(err as Error)?.message ?? 'unknown error'}).`, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const usePhoto = async () => {
    if (!photoUri || busy) return;
    if (attachedCount >= ATTACHMENT_LIMITS.maxFiles) {
      showToast(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message.`, 'danger');
      goBack();
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepareImageAsset(photoUri, cameraPhotoName());
      if (prepared.size > ATTACHMENT_LIMITS.maxBytes) {
        showToast(`“${prepared.name}” exceeds the 15 MB limit.`, 'danger');
        setBusy(false);
        return;
      }
      haptic.success();
      addAttachments([prepared]);
      goBack();
    } catch {
      showToast('Could not process that photo.', 'danger');
      setBusy(false);
    }
  };

  // Permission states ---------------------------------------------------------
  if (!permission) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={c.foreground} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <TopBar />
        <View style={[styles.center, styles.flex, styles.message]}>
          <View style={styles.messageIcon}>
            <Camera size={24} color={c.foreground} strokeWidth={1.75} />
          </View>
          <Txt variant="title" color={c.foreground} style={styles.centerText}>
            Allow camera access
          </Txt>
          <Txt color={c.mutedForeground} style={styles.centerText}>
            Council needs the camera to photograph notes, documents or screens and attach them to your question.
          </Txt>
          {permission.canAskAgain ? (
            <Pressable onPress={requestPermission} style={({ pressed }) => [styles.allow, pressed && styles.pressed]}>
              <Txt variant="bodyMedium" color={c.primaryForeground}>
                Allow camera
              </Txt>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => Linking.openSettings()}
              style={({ pressed }) => [styles.allow, pressed && styles.pressed]}
            >
              <Txt variant="bodyMedium" color={c.primaryForeground}>
                Open settings
              </Txt>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Review the captured photo ---------------------------------------------------
  if (photoUri) {
    return (
      <View style={styles.root}>
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
          <TopBar />
          <View style={styles.flex} />
          <View style={styles.reviewBar}>
            <Button
              label="Retake"
              variant="outline"
              icon={RotateCcw}
              onPress={() => setPhotoUri(null)}
              disabled={busy}
              style={styles.reviewButton}
            />
            <Button label="Use photo" icon={Check} onPress={usePhoto} loading={busy} style={styles.reviewButton} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Live viewfinder -------------------------------------------------------------
  return (
    <View style={styles.root}>
      {mountError ? (
        <View style={[styles.center, styles.flex, styles.message]}>
          <Txt variant="title" color={c.foreground} style={styles.centerText}>
            Camera unavailable
          </Txt>
          <Txt color={c.mutedForeground} style={styles.centerText}>
            {mountError}
          </Txt>
        </View>
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          onCameraReady={() => setReady(true)}
          onMountError={(e) => setMountError(e.message)}
        />
      )}
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <TopBar />
        <View style={styles.flex} />
        <View style={styles.shutterBar}>
          <View style={styles.sideSlot} />
          <Pressable
            onPress={capture}
            disabled={!ready || busy || !!mountError}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            style={({ pressed }) => [styles.shutter, (pressed || busy) && styles.shutterPressed]}
          >
            {busy ? <ActivityIndicator color={c.primaryForeground} /> : <View style={styles.shutterInner} />}
          </Pressable>
          <View style={styles.sideSlot}>
            <Pressable
              onPress={() => {
                haptic.select();
                setReady(false);
                setFacing((f) => (f === 'back' ? 'front' : 'back'));
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Switch camera"
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              <SwitchCamera size={20} color={c.foreground} strokeWidth={1.75} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function TopBar() {
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={goBack}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Close camera"
        style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
      >
        <X size={20} color={c.foreground} strokeWidth={1.75} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8 },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  shutterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingBottom: 28 },
  sideSlot: { width: 44, alignItems: 'center' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: c.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.75 },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.foreground },
  reviewBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 20 },
  reviewButton: { flex: 1 },
  message: { gap: 12, paddingHorizontal: 32 },
  messageIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: c.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  allow: {
    marginTop: 8,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
