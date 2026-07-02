import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser } from "@/lib/server/client/auth";
import { isWebPushConfigured } from "@/lib/server/notifications/web-push";

type SubscribeBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function POST(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: "Web push is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as SubscribeBody | null;
  const endpoint = body?.endpoint?.trim();
  const p256dh = body?.keys?.p256dh?.trim();
  const authKey = body?.keys?.auth?.trim();

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "Invalid push subscription payload" }, { status: 400 });
  }

  const service = createServiceClient();
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;
  const now = new Date().toISOString();

  const { data, error } = await service
    .from("push_subscriptions")
    .upsert(
      {
        user_id: auth.userId,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: userAgent,
        updated_at: now,
      },
      { onConflict: "user_id,endpoint" }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: { id: data?.id ?? null, ok: true } });
}

export async function DELETE(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint")?.trim();

  const service = createServiceClient();
  let query = service.from("push_subscriptions").delete().eq("user_id", auth.userId);

  if (endpoint) {
    query = query.eq("endpoint", endpoint);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: { ok: true } });
}
