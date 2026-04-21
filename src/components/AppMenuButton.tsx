import { useAppShell } from './AppShellContext';

type AppMenuButtonProps = {
  className?: string;
};

export function AppMenuButton({ className = '' }: AppMenuButtonProps) {
  const { openMenu } = useAppShell();

  return (
    <button
      type="button"
      className={`app-menu-button ${className}`.trim()}
      aria-label="Open menu"
      onClick={openMenu}
    >
      <span className="hamburger-bar" />
      <span className="hamburger-bar" />
      <span className="hamburger-bar" />
    </button>
  );
}