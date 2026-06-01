import { EmptyState } from "../components/EmptyState";

export function NotAuthorized() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <EmptyState
        kind="offline"
        title="this loft is private"
        sub="you're not the resident — sign in with the right account to come in."
        action={
          <a href="/" className="btn btn-primary inline-flex items-center">
            Try again
          </a>
        }
      />
    </div>
  );
}
