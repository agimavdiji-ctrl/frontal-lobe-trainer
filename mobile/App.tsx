import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { createVerbalNBackRepository } from './src/features/verbalNBack/persistence';
import { asyncStorageStore } from './src/features/verbalNBack/persistence/asyncStorageStore';
import { VerbalNBackScreen } from './src/features/verbalNBack/ui/VerbalNBackScreen';

export default function App() {
  const repository = useMemo(() => createVerbalNBackRepository(asyncStorageStore), []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <VerbalNBackScreen repository={repository} />
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1222' },
});
