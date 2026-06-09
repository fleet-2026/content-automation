import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendPush, type PushMessage } from "@/lib/push";

// Push the rider (and optionally the assigned driver) about a status change.
async function notifyTrip(tripId: string, opts: { rider?: string; driver?: string }) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { rider: true, driver: { include: { user: true } } },
  });
  if (!trip) return;
  const messages: PushMessage[] = [];
  if (opts.rider && trip.rider?.pushToken) {
    messages.push({ to: trip.rider.pushToken, title: "Your trip", body: opts.rider, data: { tripId } });
  }
  if (opts.driver && trip.driver?.user?.pushToken) {
    messages.push({ to: trip.driver.user.pushToken, title: "Dispatch", body: opts.driver, data: { tripId } });
  }
  await sendPush(messages);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { driver: { include: { vehicle: true } }, vehicle: true, rider: true },
  });
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(trip);
}

const patchSchema = z.object({
  // "assign" auto-selects a free driver+vehicle; or pass explicit driverId/vehicleId.
  action: z.enum(["assign", "start", "complete", "cancel"]).optional(),
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  fare: z.number().optional(),
  distanceKm: z.number().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const trip = await prisma.trip.findUnique({ where: { id } });
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action, driverId, vehicleId, fare, distanceKm } = parsed.data;

  // --- assign: find an available driver with a vehicle, mark vehicle ON_TRIP
  if (action === "assign") {
    let dId = driverId;
    let vId = vehicleId;
    if (!dId || !vId) {
      const driver = await prisma.driver.findFirst({
        where: {
          status: "ACTIVE",
          vehicleId: { not: null },
          vehicle: { is: { status: "AVAILABLE" } },
          trips: { none: { status: { in: ["ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] } } },
        },
        include: { vehicle: true },
      });
      if (!driver) {
        return NextResponse.json({ error: "No available driver with a vehicle" }, { status: 409 });
      }
      dId = driver.id;
      vId = driver.vehicleId!;
    }
    const [updated] = await prisma.$transaction([
      prisma.trip.update({
        where: { id },
        data: { status: "ASSIGNED", driverId: dId, vehicleId: vId, assignedAt: new Date() },
        include: { driver: true, vehicle: true },
      }),
      prisma.vehicle.update({ where: { id: vId }, data: { status: "ON_TRIP" } }),
    ]);
    await notifyTrip(id, {
      rider: `Driver assigned: ${updated.driver?.name ?? "on the way"}`,
      driver: `New trip: ${updated.pickupAddress} → ${updated.dropoffAddress}`,
    });
    return NextResponse.json(updated);
  }

  if (action === "start") {
    const updated = await prisma.trip.update({
      where: { id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    await notifyTrip(id, { rider: "Your trip has started." });
    return NextResponse.json(updated);
  }

  if (action === "complete") {
    const updated = await prisma.trip.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date(), fare, distanceKm },
    });
    if (updated.vehicleId) {
      await prisma.vehicle.update({ where: { id: updated.vehicleId }, data: { status: "AVAILABLE" } });
    }
    await notifyTrip(id, { rider: "Trip completed. Thanks for riding!" });
    return NextResponse.json(updated);
  }

  if (action === "cancel") {
    const updated = await prisma.trip.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (updated.vehicleId) {
      await prisma.vehicle.update({ where: { id: updated.vehicleId }, data: { status: "AVAILABLE" } });
    }
    return NextResponse.json(updated);
  }

  // No action → plain field update.
  const updated = await prisma.trip.update({
    where: { id },
    data: { driverId, vehicleId, fare, distanceKm },
  });
  return NextResponse.json(updated);
}
