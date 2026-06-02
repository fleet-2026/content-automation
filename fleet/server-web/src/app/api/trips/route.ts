import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const trips = await prisma.trip.findMany({
    where: status ? { status } : undefined,
    include: { driver: true, vehicle: true, rider: true },
    orderBy: { requestedAt: "desc" },
  });
  return NextResponse.json(trips);
}

// Rider requests a trip (from the mobile app).
const createSchema = z.object({
  pickupAddress: z.string().min(1),
  dropoffAddress: z.string().min(1),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLng: z.number().optional(),
  riderId: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const trip = await prisma.trip.create({
    data: { ...parsed.data, status: "REQUESTED" },
  });
  return NextResponse.json(trip, { status: 201 });
}
