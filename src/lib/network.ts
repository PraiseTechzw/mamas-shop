import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export type ConnectionState = 'online' | 'offline' | 'checking';

export function getConnectionState(state: NetInfoState): ConnectionState {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  if (state.isConnected === true) return 'online';
  return 'checking';
}

export function subscribeToConnection(listener: (state: ConnectionState) => void) {
  return NetInfo.addEventListener((state) => listener(getConnectionState(state)));
}

export async function checkConnection(): Promise<ConnectionState> {
  return getConnectionState(await NetInfo.fetch());
}
