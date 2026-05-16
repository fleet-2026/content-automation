import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "creator-os",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
