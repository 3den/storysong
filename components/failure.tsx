import { Button } from "@/components/ui/button";

/** An inline error with an explicit retry. */
export function Failure({ message, onRetry, retryDisabled }: { message: string; onRetry: () => void; retryDisabled: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
      <p>
        <span className="font-semibold text-destructive">Error: </span>
        {message}
      </p>
      <Button variant="outline" className="h-9 px-3" onClick={onRetry} disabled={retryDisabled}>
        Try again
      </Button>
    </div>
  );
}
