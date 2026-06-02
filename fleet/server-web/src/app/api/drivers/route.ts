import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const drivers = await prisma.driver.findMany({
    include: { vehicle: true, documents: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(drivers);
}

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  vehicleId: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const driver = await prisma.driver.create({ data: parsed.data });
  return NextResponse.json(driver, { status: 201 });
}
