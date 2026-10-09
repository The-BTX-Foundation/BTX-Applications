'use client';

// The shared load-error block: shown when a screen's data fails to load (drafts landing-error.html, apply-error.html,
// status-error.html and their phone versions). One summary box and a Try again button that runs `onRetry`.
import { Button } from './button';
import { ErrorIcon } from './icons';

export function LoadError({
  onRetry,
  title = "This page didn't load.",
  text = 'Check your connection, then try again.',
}: {
  onRetry: () => void;
  title?: string;
  text?: string;
}) {
  return (
    <div className="er-c">
      <div className="es" role="alert">
        <p>
          <ErrorIcon />
          <span>{title}</span>
        </p>
        <div className="er-t">{text}</div>
      </div>
      <Button className="er-btn" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
