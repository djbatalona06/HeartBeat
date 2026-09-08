import { Component, type ErrorInfo, type ReactNode } from 'react';
import { buildReport, readReportToken, sendReport } from '../pwa/crashReport';

/**
 * The last thing between a component throw and a white screen.
 *
 * There was no boundary at all before this, so any render error anywhere took
 * the whole app down to a blank page with nothing to read and nothing to press.
 *
 * Two things matter about how this is written. It styles itself from literal
 * values with the theme tokens only as a preference — `var(--color-base, ...)`
 * with a real fallback — because the case it most needs to survive is the theme
 * engine itself throwing, and a fallback that renders invisible text on an
 * invisible background is not a fallback. And it never imports from `db/` or
 * `features/`: a boundary that can throw on its own import is not one.
 */

interface Props {
  children: ReactNode;
  /**
   * Names the region that failed, for the report and for the message. The two
   * boundaries in App.tsx are a whole-app one and a per-route one, and knowing
   * which tripped is most of knowing what broke.
   */
  scope: string;
  /** Where "start over" should send someone. The route boundary goes Home. */
  recoverTo?: string;
}

interface State {
  error: Error | null;
  /** Bumping this remounts the subtree, which is how a retry actually retries. */
  attempt: number;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Left in deliberately: on a phone this is the only copy anyone can reach
    // through remote debugging, and it costs nothing in production.
    console.error(`[${this.props.scope}]`, error, info.componentStack);
    void sendReport(
      buildReport(this.props.scope, error, info.componentStack, location.hash || '/', Date.now()),
      readReportToken(),
    );
  }

  private retry = (): void => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1, copied: false }));
  };

  private copy = (): void => {
    const { error } = this.state;
    if (!error) return;
    const text = `${this.props.scope}: ${error.message}\n\n${error.stack ?? ''}`;
    // Not available on an insecure origin, and rejected if the tap is not
    // treated as a gesture. Either way the button should not throw inside the
    // component whose whole job is to be the thing that did not throw.
    navigator.clipboard?.writeText(text).then(
      () => this.setState({ copied: true }),
      () => this.setState({ copied: false }),
    );
  };

  render(): ReactNode {
    const { error, attempt, copied } = this.state;
    if (!error) return <div key={attempt}>{this.props.children}</div>;

    return (
      <div className="crash" role="alert">
        <p className="crash-glyph" aria-hidden="true">♥</p>
        <h1 className="crash-title">This screen stopped working.</h1>
        <p className="crash-body">
          Nothing you logged is lost — it is all still on this phone. Try the
          screen again, and if it keeps happening, send the details over.
        </p>
        <p className="crash-detail">{error.message}</p>
        <div className="crash-actions">
          <button type="button" className="crash-button" onClick={this.retry}>
            Try again
          </button>
          {this.props.recoverTo ? (
            <a className="crash-button crash-button-quiet" href={this.props.recoverTo}>
              Go home
            </a>
          ) : (
            <button
              type="button"
              className="crash-button crash-button-quiet"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          )}
          <button type="button" className="crash-button crash-button-quiet" onClick={this.copy}>
            {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
      </div>
    );
  }
}

