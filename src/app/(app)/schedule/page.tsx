import { ScheduleUI } from "./schedule-ui";
import {
  DEMO,
  demoScheduled,
  demoRecurringSlots,
  demoAutomations,
} from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export default function SchedulePage() {
  // In demo mode we serve the rich pre-populated calendar. In real mode the
  // server would query Draft / RecurringSlot / Inngest run history.
  const scheduled = DEMO ? demoScheduled : [];
  const recurring = DEMO ? demoRecurringSlots : [];
  const automations = DEMO ? demoAutomations : [];

  return (
    <div className="px-8 py-10 max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">Schedule & automations</h1>
      <p className="text-[var(--color-muted)] mt-1 mb-8">
        Your posting calendar, recurring slots, and every background job running
        on your behalf.
      </p>
      <ScheduleUI scheduled={scheduled} recurring={recurring} automations={automations} />
    </div>
  );
}
