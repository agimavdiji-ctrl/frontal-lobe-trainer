import AsyncStorage from '@react-native-async-storage/async-storage';

import { KeyValueStore } from './keyValueStore';

/** Device storage adapter. The only file that touches AsyncStorage. */
export const asyncStorageStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
