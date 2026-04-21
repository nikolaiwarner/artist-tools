import { createContext, useContext } from 'react';

type AppShellContextValue = {
  openMenu: () => void;
  closeMenu: () => void;
  menuOpen: boolean;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({
  children,
  value
}: {
  children: React.ReactNode;
  value: AppShellContextValue;
}) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const context = useContext(AppShellContext);

  if (!context) {
    throw new Error('useAppShell must be used within AppShellProvider');
  }

  return context;
}