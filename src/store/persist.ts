import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { kv } from '@/lib/db';

/** Zustand persistence backed by IndexedDB, so app state survives offline and is not size-capped like localStorage. */
const idbStateStorage: StateStorage = {
  getItem: async (name) => (await kv.get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await kv.set(name, value);
  },
  removeItem: async (name) => {
    await kv.del(name);
  },
};

export const idbStorage = <T,>() => createJSONStorage<T>(() => idbStateStorage);
