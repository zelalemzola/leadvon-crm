import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteStaffSchema } from "@/lib/validation/admin";

async function staffCount(): Promise<{ count: number | null; error: Error | null }> {
  const admin = createServiceClient();
  const activeCountRes = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "staff")
    .eq("is_active", true);

  // Backward compatibility if is_active column doesn't exist yet.
  if (activeCountRes.error && activeCountRes.error.message.includes("is_active")) {
    const fallbackRes = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "staff");
    if (fallbackRes.error) {
      return { count: null, error: new Error(fallbackRes.error.message) };
    }
    return { count: fallbackRes.count ?? 0, error: null };
  }

  if (activeCountRes.error) {
    return { count: null, error: new Error(activeCountRes.error.message) };
  }
  return { count: activeCountRes.count ?? 0, error: null };
}

/** Whether setup is allowed (no active staff users yet). */
export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      allowed: false,
      reason: "missing_service_key",
    });
  }
  const { count, error } = await staffCount();
  if (error) {
    return NextResponse.json({
      allowed: false,
      reason: "database",
      message: error.message,
    });
  }
  return NextResponse.json({ allowed: count === 0 });
}

/** Create a recovery staff user (only when no active staff exist). Requires service role. */
export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const { count, error: countError } = await staffCount();
  if (countError) {
    return NextResponse.json(
      { error: countError.message },
      { status: 500 }
    );
  }
  if (count !== 0) {
    return NextResponse.json(
      {
        error:
          "Setup is disabled — at least one active staff account already exists. Sign in with that account.",
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = inviteStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, full_name } = parsed.data;

  const admin = createServiceClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "staff" },
    user_metadata: { full_name },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (data.user) {
    await admin
      .from("profiles")
      .update({
        role: "staff",
        is_active: true,
        email,
        full_name: full_name || null,
      })
      .eq("id", data.user.id);
  }

  return NextResponse.json({ ok: true });
}
