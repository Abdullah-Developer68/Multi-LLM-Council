import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Headline } from '@/components/ui/text';
import { makeStyles } from '@/theme';

export default function NotFound() {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Headline muted="Page not found." strong="Let’s get you back to your chats." />
        <Button label="Back to chats" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  body: { flex: 1, justifyContent: 'center', padding: 24, gap: 20, maxWidth: 520, alignSelf: 'center', width: '100%' },
}));
