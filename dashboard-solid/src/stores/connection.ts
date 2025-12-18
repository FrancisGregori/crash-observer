import { createStore } from 'solid-js/store';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  lastConnected: Date | null;
  reconnectAttempts: number;
  error: string | null;
}

const initialState: ConnectionState = {
  status: 'disconnected',
  lastConnected: null,
  reconnectAttempts: 0,
  error: null,
};

const [state, setState] = createStore<ConnectionState>(initialState);

export const connectionStore = state;

export function setConnectionStatus(status: ConnectionStatus) {
  setState('status', status);
  if (status === 'connected') {
    setState('lastConnected', new Date());
    setState('reconnectAttempts', 0);
    setState('error', null);
  }
}

export function setConnectionError(error: string | null) {
  setState('error', error);
  if (error) {
    setState('status', 'error');
  }
}

export function incrementReconnectAttempts() {
  setState('reconnectAttempts', (prev) => prev + 1);
}

export function resetReconnectAttempts() {
  setState('reconnectAttempts', 0);
}
