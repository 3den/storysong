import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** An inline error with an explicit retry. */
export function Failure({ message, onRetry, retryDisabled }: { message: string; onRetry: () => void; retryDisabled: boolean }) {
  return (
    // Dark ink on the pastel fill: the overrides flip the text, the retry button's border, and the focus outline.
    <div
      role="alert"
      className="flex gap-2 rounded-lg bg-destructive p-3 text-sm text-foreground [--foreground:var(--background)] [--input:var(--background)]"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-col items-start gap-2">
        <p>
          <span className="font-semibold">Error: </span>
          {message}
        </p>
        <Button variant="outline" className="h-9 px-3" onClick={onRetry} disabled={retryDisabled}>
          Try again
        </Button>
      </div>
    </div>
  );
}
