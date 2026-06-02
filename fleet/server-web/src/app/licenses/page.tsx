import { prisma } from "@/lib/prisma";
import { complianceStatus, documentTypeLabel, daysUntil } from "@/lib/compliance";

export const dynamic = "force-dynamic";

export default async function LicensesPage() {
  const docs = await prisma.document.findMany({
    include: { vehicle: true, driver: true },
    orderBy: { expiresOn: "asc" },
  });
  const scored = docs.map((d) => ({ ...d, status: complianceStatus(d.expiresOn) }));

  const sections: { key: string; title: string; badge: string }[] = [
    { key: "EXPIRED", title: "Expired", badge: "red" },
    { key: "EXPIRING_SOON", title: "Expiring within 30 days", badge: "amber" },
    { key: "VALID", title: "Valid", badge: "green" },
  ];

  return (
    <>
      <h1>Licenses & Expiries</h1>
      <p className="subtitle">All compliance documents across vehicles and drivers</p>

      {sections.map((section) => {
        const rows = scored.filter((d) => d.status === section.key);
        return (
          <div className="card" key={section.key}>
            <h2>
              {section.title} <span className="muted">· {rows.length}</span>
            </h2>
            {rows.length === 0 ? (
              <div className="empty">None.</div>
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
                  {rows.map((d) => {
                    const owner = d.vehicle
                      ? `${d.vehicle.plateNumber} · ${d.vehicle.make} ${d.vehicle.model}`
                      : d.driver?.name ?? "—";
                    const days = daysUntil(d.expiresOn);
                    return (
                      <tr key={d.id}>
                        <td>{documentTypeLabel(d.type)}</td>
                        <td>{owner}</td>
                        <td className="muted">{d.number ?? "—"}</td>
                        <td>
                          {new Date(d.expiresOn).toLocaleDateString()}{" "}
                          <span className="muted">({days < 0 ? `${-days}d ago` : `in ${days}d`})</span>
                        </td>
                        <td>
                          <span className={`badge ${section.badge}`}>{section.title.split(" ")[0]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </>
  );
}
