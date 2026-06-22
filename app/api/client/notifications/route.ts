import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireCustomerUser } from "@/lib/server/client/auth";

export async function GET(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const service = createServiceClient();
  let query = service
    .from("customer_notifications")
    .select("id, type, title, body, entity_type, entity_id, metadata, read_at, email_sent_at, created_at")
    .eq("recipient_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { count: unreadCount } = await service
    .from("customer_notifications")
    .select("*", { head: true, count: "exact" })
    .eq("recipient_id", auth.userId)
    .is("read_at", null);

  return NextResponse.json({
    data: data ?? [],
    meta: { unread_count: unreadCount ?? 0 },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as
    | { mark_all_read?: boolean; ids?: string[] }
    | null;

  const service = createServiceClient();
  const now = new Date().toISOString();

  if (body?.mark_all_read) {
    const { error } = await service
      .from("customer_notifications")
      .update({ read_at: now })
      .eq("recipient_id", auth.userId)
      .is("read_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: { ok: true } });
  }

  const ids = (body?.ids ?? []).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: "No notification ids provided" }, { status: 400 });
  }

  const { error } = await service
    .from("customer_notifications")
    .update({ read_at: now })
    .eq("recipient_id", auth.userId)
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ data: { ok: true } });
}
