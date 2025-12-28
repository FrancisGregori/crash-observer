import { Component, onMount, onCleanup, createEffect } from 'solid-js';
import { useWebSocket } from './hooks/useWebSocket';
import { roundsStore, fetchInitialData } from './stores/rounds';
import { connectionStore } from './stores/connection';
import { botsStore } from './stores/bots';
import { TopBar } from './components/layout/TopBar';
import { MainLayout } from './components/layout/MainLayout';
import { BotHistoryBar } from './components/bot/BotHistoryBar';

const App: Component = () => {
  const { connect, disconnect } = useWebSocket();

  // Check if any bot is active
  const hasActiveBots = () => {
    return botsStore.bot1.state.active || botsStore.bot2.state.active;
  };

  // Handler for beforeunload event
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasActiveBots()) {
      // Standard way to show confirmation dialog
      e.preventDefault();
      // For older browsers
      e.returnValue = 'Você tem um bot ativo. Tem certeza que deseja sair?';
      return e.returnValue;
    }
  };

  onMount(() => {
    // Fetch initial data from REST API
    fetchInitialData();

    // Connect to WebSocket for real-time updates
    connect();

    // Add beforeunload listener to warn when leaving with active bots
    window.addEventListener('beforeunload', handleBeforeUnload);
  });

  onCleanup(() => {
    disconnect();
    window.removeEventListener('beforeunload', handleBeforeUnload);
  });

  return (
    <div class="h-screen flex flex-col overflow-hidden">
      <TopBar />
      <MainLayout />
      <BotHistoryBar />
    </div>
  );
};

export default App;
