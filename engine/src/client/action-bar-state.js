import { atom, createStore } from "jotai/vanilla";

export const actionBarCategoryAtom = atom(null);

export function createActionBarState() {
  const store = createStore();
  return {
    get: () => store.get(actionBarCategoryAtom),
    set: (category) => store.set(actionBarCategoryAtom, category),
    toggle: (category) => store.set(actionBarCategoryAtom, store.get(actionBarCategoryAtom) === category ? null : category),
    subscribe: (listener) => store.sub(actionBarCategoryAtom, listener),
  };
}
