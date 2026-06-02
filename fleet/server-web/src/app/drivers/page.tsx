import { prisma } from "@/lib/prisma";
import { complianceStatus } from "@/lib/compliance";

export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const drivers = await prisma.driver.findMany({
    include: { vehicle: true, documents: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <h1>Drivers</h1>
      <p className="subtitle">{drivers.length} driver profiles</p>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Vehicle</th>
              <th>Rating</th>
              <th>License</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const license = d.documents.find((doc) => doc.type === "DRIVER_LICENSE");
              const licStatus = license ? complianceStatus(license.expiresOn) : null;
              const licBadge =
                licStatus === "EXPIRED" ? "red" : licStatus === "EXPIRING_SOON" ? "amber" : "green";
              return (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong></td>
                  <td className="muted">{d.phone}</td>
                  <td>{d.vehicle?.plateNumber ?? <span className="muted">—</span>}</td>
                  <td>{d.rating.toFixed(1)} ★</td>
                  <td>
                    {license ? (
                      <span className={`badge ${licBadge}`}>
                        {licStatus === "EXPIRED"
                          ? "Expired"
                          : licStatus === "EXPIRING_SOON"
                          ? "Expiring"
                          : "Valid"}
                      </span>
                    ) : (
                      <span className="muted">No license</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${d.status === "ACTIVE" ? "green" : "gray"}`}>{d.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
