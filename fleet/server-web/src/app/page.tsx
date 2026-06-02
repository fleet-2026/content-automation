import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { complianceStatus, documentTypeLabel, daysUntil } from "@/lib/compliance";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [vehicleCount, availableCount, driverCount, activeTrips, docs] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { status: "AVAILABLE" } }),
    prisma.driver.count({ where: { status: "ACTIVE" } }),
    prisma.trip.count({ where: { status: { in: ["REQUESTED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] } } }),
    prisma.document.findMany({ include: { vehicle: true, driver: true }, orderBy: { expiresOn: "asc" } }),
  ]);

  const scored = docs.map((d) => ({ ...d, status: complianceStatus(d.expiresOn) }));
  const expired = scored.filter((d) => d.status === "EXPIRED");
  const expiringSoon = scored.filter((d) => d.status === "EXPIRING_SOON");
  const attention = [...expired, ...expiringSoon].slice(0, 12);

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">Fleet overview and compliance alerts</p>

      <div className="kpis">
        <div className="kpi">
          <div className="value">{vehicleCount}</div>
          <div className="label">Vehicles</div>
        </div>
        <div className="kpi">
          <div className="value">{availableCount}</div>
          <div className="label">Available now</div>
        </div>
        <div className="kpi">
          <div className="value">{driverCount}</div>
          <div className="label">Active drivers</div>
        </div>
        <div className="kpi">
          <div className="value">{activeTrips}</div>
          <div className="label">Trips in progress</div>
        </div>
        <div className="kpi danger">
          <div className="value">{expired.length}</div>
          <div className="label">Expired documents</div>
        </div>
        <div className="kpi warn">
          <div className="value">{expiringSoon.length}</div>
          <div className="label">Expiring ≤ 30 days</div>
        </div>
      </div>

      <div className="card">
        <h2>Needs attention — license & document expiries</h2>
        {attention.length === 0 ? (
          <div className="empty">All documents are valid. 🎉</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Belongs to</th>
                <th>Number</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((d) => {
                const owner = d.vehicle
                  ? `${d.vehicle.plateNumber} · ${d.vehicle.make} ${d.vehicle.model}`
                  : d.driver
                  ? d.driver.name
                  : "—";
                const days = daysUntil(d.expiresOn);
                return (
                  <tr key={d.id}>
                    <td>{documentTypeLabel(d.type)}</td>
                    <td>{owner}</td>
                    <td className="muted">{d.number ?? "—"}</td>
                    <td>
                      {new Date(d.expiresOn).toLocaleDateString()}{" "}
                      <span className="muted">
                        ({days < 0 ? `${-days}d ago` : `in ${days}d`})
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${d.status === "EXPIRED" ? "red" : "amber"}`}>
                        {d.status === "EXPIRED" ? "Expired" : "Expiring soon"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        See the full list under <Link href="/licenses" style={{ color: "var(--brand)" }}>Licenses & Expiries</Link>.
      </p>
    </>
  );
}
