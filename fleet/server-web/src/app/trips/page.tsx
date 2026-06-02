import { prisma } from "@/lib/prisma";
import { TripActions } from "@/components/TripActions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  REQUESTED: "amber",
  ASSIGNED: "blue",
  EN_ROUTE: "blue",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  CANCELLED: "gray",
};

export default async function TripsPage() {
  const trips = await prisma.trip.findMany({
    include: { driver: true, vehicle: true, rider: true },
    orderBy: { requestedAt: "desc" },
    take: 100,
  });

  return (
    <>
      <h1>Trips</h1>
      <p className="subtitle">Dispatch board — request → assign → in progress → completed</p>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Rider</th>
              <th>Driver / Vehicle</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.pickupAddress}</strong>
                  <div className="muted">→ {t.dropoffAddress}</div>
                </td>
                <td className="muted">{t.rider?.name ?? "—"}</td>
                <td>
                  {t.driver ? (
                    <>
                      {t.driver.name}
                      <div className="muted">{t.vehicle?.plateNumber ?? ""}</div>
                    </>
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[t.status] ?? "gray"}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </td>
                <td>
                  <TripActions tripId={t.id} status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
