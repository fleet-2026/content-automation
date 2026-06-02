import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: "green",
  ON_TRIP: "blue",
  MAINTENANCE: "amber",
  OUT_OF_SERVICE: "red",
};

export default async function VehiclesPage() {
  const vehicles = await prisma.vehicle.findMany({
    include: { assignedDriver: true },
    orderBy: { plateNumber: "asc" },
  });

  return (
    <>
      <h1>Vehicles</h1>
      <p className="subtitle">{vehicles.length} vehicles in the fleet</p>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Plate</th>
              <th>Vehicle</th>
              <th>Year</th>
              <th>Mileage</th>
              <th>Driver</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td><strong>{v.plateNumber}</strong></td>
                <td>{v.make} {v.model} <span className="muted">· {v.color}</span></td>
                <td>{v.year}</td>
                <td className="muted">{v.mileageKm.toLocaleString()} km</td>
                <td>{v.assignedDriver?.name ?? <span className="muted">Unassigned</span>}</td>
                <td><span className={`badge ${STATUS_BADGE[v.status] ?? "gray"}`}>{v.status.replace("_", " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
