import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const vehicles = await prisma.vehicle.findMany({
    where: status ? { status } : undefined,
    include: { assignedDriver: true, documents: true },
    orderBy: { plateNumber: "asc" },
  });
  return NextResponse.json(vehicles);
}

const createSchema = z.object({
  plateNumber: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int(),
  color: z.string().optional(),
  seats: z.number().int().optional(),
  vin: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const vehicle = await prisma.vehicle.create({ data: parsed.data });
  return NextResponse.json(vehicle, { status: 201 });
}
