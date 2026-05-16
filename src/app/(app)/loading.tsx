import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <div className="px-8 py-10 max-w-6xl">
      <div className="flex items-center gap-3 text-[var(--color-muted)] text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    </div>
  );
}
