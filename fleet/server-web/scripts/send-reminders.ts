// Run the expiry-reminder scan from the CLI (handy for local testing or a
// system cron):  npm run reminders
import { runExpiryReminders } from "../src/lib/reminders";

runExpiryReminders()
  .then((r) => {
    console.log("Expiry reminders done:", r);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
