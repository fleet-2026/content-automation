import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { complianceStatus } from "@/lib/compliance";

// Returns all compliance documents with a derived status. Optional ?status=
// filter (EXPIRED | EXPIRING_SOON | VALID) powers the alerts view.
export async function GET(req: Request) {
  const filter = new URL(req.url).searchParams.get("status") ?? undefined;
  const docs = await prisma.document.findMany({
    include: { vehicle: true, driver: true },
    orderBy: { expiresOn: "asc" },
  });
  const withStatus = docs.map((d) => ({ ...d, status: complianceStatus(d.expiresOn) }));
  const result = filter ? withStatus.filter((d) => d.status === filter) : withStatus;
  return NextResponse.json(result);
}

const createSchema = z
  .object({
    type: z.enum(["DRIVER_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "PERMIT"]),
    number: z.string().optional(),
    issuedOn: z.string().datetime().optional(),
    expiresOn: z.string().datetime(),
    notes: z.string().optional(),
    vehicleId: z.string().optional(),
    driverId: z.string().optional(),
  })
  .refine((d) => d.vehicleId || d.driverId, {
    message: "A document must belong to a vehicle or a driver",
  });

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { issuedOn, expiresOn, ...rest } = parsed.data;
  const doc = await prisma.document.create({
    data: {
      ...rest,
      issuedOn: issuedOn ? new Date(issuedOn) : null,
      expiresOn: new Date(expiresOn),
    },
  });
  return NextResponse.json(doc, { status: 201 });
}
