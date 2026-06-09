import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

// The mobile app registers its Expo push token here after sign-in.
const schema = z.object({ pushToken: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await prisma.user.update({ where: { id: user.id }, data: { pushToken: parsed.data.pushToken } });
  return NextResponse.json({ ok: true });
}
