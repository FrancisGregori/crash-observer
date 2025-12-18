import { Component, onMount, onCleanup } from 'solid-js';
import { useWebSocket } from './hooks/useWebSocket';
import { roundsStore, fetchInitialData } from './stores/rounds';
import { connectionStore } from './stores/connection';
import { TopBar } from './components/layout/TopBar';
import { MainLayout } from './components/layout/MainLayout';

const App: Component = () => {
  const { connect, disconnect } = useWebSocket();

  onMount(() => {
    // Fetch initial data from REST API
    fetchInitialData();

    // Connect to WebSocket for real-time updates
    connect();
  });

  onCleanup(() => {
    disconnect();
  });

  return (
    <div class="h-screen flex flex-col overflow-hidden">
      <TopBar />
      <MainLayout />
    </div>
  );
};

export default App;
