import { usePersistedState } from './usePersistedState'

// Settings > Developer. Kept on this device, like the reader settings.
export const useDeveloperMode = (): [boolean, (on: boolean) => void] => {
  const [on, setOn] = usePersistedState<boolean>({
    key: 'stash-developer-mode',
    initialValue: false,
  })
  return [on, setOn]
}
