import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MAKES = [
  ["Toyota", ["Corolla", "Camry", "Hilux", "RAV4"]],
  ["Hyundai", ["Elantra", "Tucson", "Accent"]],
  ["Kia", ["Sportage", "Cerato", "Sorento"]],
  ["Nissan", ["Sunny", "Altima", "X-Trail"]],
  ["Ford", ["Focus", "Transit", "Explorer"]],
  ["Volkswagen", ["Passat", "Golf", "Tiguan"]],
] as const;

const COLORS = ["White", "Black", "Silver", "Gray", "Blue", "Red"];
const FIRST = ["Ahmed", "Mohamed", "Omar", "Youssef", "Khaled", "Mahmoud", "Ali", "Hassan", "Karim", "Tarek", "Sara", "Mona", "Laila", "Nour", "Heba"];
const LAST = ["Hassan", "Ibrahim", "Saleh", "Farouk", "Nasser", "Adel", "Mansour", "Gaber", "Said", "Fahmy"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("Clearing existing data…");
  await prisma.trip.deleteMany();
  await prisma.document.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();

  // --- Admin + dispatcher accounts (web app) -------------------------------
  const adminPassword = await bcrypt.hash("admin1234", 10);
  const admin = await prisma.user.create({
    data: {
      email: "admin@fleet.local",
      name: "Fleet Admin",
      role: "ADMIN",
      password: adminPassword,
    },
  });
  console.log(`Created admin: ${admin.email} / admin1234`);

  // --- A couple of riders (mobile app) -------------------------------------
  const rider = await prisma.user.create({
    data: { email: "rider@fleet.local", name: "Sample Rider", role: "RIDER", phone: "+20100000000" },
  });

  // --- 300 vehicles --------------------------------------------------------
  console.log("Creating 300 vehicles…");
  const vehicleIds: string[] = [];
  for (let i = 1; i <= 300; i++) {
    const [make, models] = pick(MAKES);
    const model = pick(models);
    const year = randInt(2016, 2024);
    const v = await prisma.vehicle.create({
      data: {
        plateNumber: `FL-${String(i).padStart(4, "0")}`,
        make,
        model,
        year,
        color: pick(COLORS),
        seats: randInt(4, 7),
        mileageKm: randInt(10_000, 220_000),
        vin: `VIN${String(i).padStart(6, "0")}${year}`,
        status: Math.random() < 0.08 ? "MAINTENANCE" : "AVAILABLE",
      },
    });
    vehicleIds.push(v.id);

    // Registration + insurance docs. Make ~15% expired/expiring to exercise alerts.
    const regOffset = Math.random() < 0.15 ? randInt(-40, 25) : randInt(60, 700);
    const insOffset = Math.random() < 0.15 ? randInt(-40, 25) : randInt(60, 400);
    await prisma.document.createMany({
      data: [
        { vehicleId: v.id, type: "VEHICLE_REGISTRATION", number: `REG-${i}`, expiresOn: daysFromNow(regOffset) },
        { vehicleId: v.id, type: "INSURANCE", number: `INS-${i}`, expiresOn: daysFromNow(insOffset) },
      ],
    });
  }

  // --- 120 drivers, assigned to the first 120 vehicles --------------------
  console.log("Creating 120 drivers…");
  for (let i = 1; i <= 120; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const driver = await prisma.driver.create({
      data: {
        name,
        phone: `+2011${String(randInt(0, 99999999)).padStart(8, "0")}`,
        email: `driver${i}@fleet.local`,
        rating: Math.round((4 + Math.random()) * 10) / 10,
        status: Math.random() < 0.05 ? "INACTIVE" : "ACTIVE",
        vehicleId: vehicleIds[i - 1],
      },
    });

    const licOffset = Math.random() < 0.18 ? randInt(-30, 25) : randInt(90, 1200);
    await prisma.document.create({
      data: {
        driverId: driver.id,
        type: "DRIVER_LICENSE",
        number: `DL-${100000 + i}`,
        expiresOn: daysFromNow(licOffset),
      },
    });
  }

  // --- A few sample trips --------------------------------------------------
  console.log("Creating sample trips…");
  const someDrivers = await prisma.driver.findMany({ take: 5, include: { vehicle: true } });
  const samples = [
    { pickup: "Downtown HQ, Cairo", dropoff: "Cairo Intl Airport", status: "COMPLETED" },
    { pickup: "Maadi Office", dropoff: "Nasr City Branch", status: "IN_PROGRESS" },
    { pickup: "Zamalek", dropoff: "New Cairo", status: "ASSIGNED" },
    { pickup: "Giza Plant", dropoff: "6th October Warehouse", status: "REQUESTED" },
  ];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = someDrivers[i % someDrivers.length];
    const assigned = s.status !== "REQUESTED";
    await prisma.trip.create({
      data: {
        status: s.status,
        pickupAddress: s.pickup,
        dropoffAddress: s.dropoff,
        distanceKm: randInt(5, 45),
        fare: randInt(40, 300),
        riderId: rider.id,
        driverId: assigned ? d.id : null,
        vehicleId: assigned ? d.vehicleId : null,
        assignedAt: assigned ? new Date() : null,
        startedAt: s.status === "IN_PROGRESS" || s.status === "COMPLETED" ? new Date() : null,
        completedAt: s.status === "COMPLETED" ? new Date() : null,
      },
    });
  }

  const counts = {
    vehicles: await prisma.vehicle.count(),
    drivers: await prisma.driver.count(),
    documents: await prisma.document.count(),
    trips: await prisma.trip.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
