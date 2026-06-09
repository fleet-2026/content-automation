import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const mine = url.searchParams.get("mine"); // "rider" | "driver"

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  if (mine) {
    const user = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (mine === "driver") {
      const driver = await prisma.driver.findUnique({ where: { userId: user.id } });
      where.driverId = driver?.id ?? "__none__";
    } else {
      where.riderId = user.id;
    }
  }

  const trips = await prisma.trip.findMany({
    where,
    include: { driver: true, vehicle: true, rider: true },
    orderBy: { requestedAt: "desc" },
  });
  return NextResponse.json(trips);
}

// Rider requests a trip (from the mobile app). The rider is the signed-in user.
const createSchema = z.object({
  pickupAddress: z.string().min(1),
  dropoffAddress: z.string().min(1),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLng: z.number().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const user = await getAuth(req);
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const trip = await prisma.trip.create({
    data: { ...parsed.data, riderId: user?.id ?? null, status: "REQUESTED" },
  });
  return NextResponse.json(trip, { status: 201 });
}
