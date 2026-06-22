import { Resend } from "resend";
import { renderNewLeadEmail } from "@/lib/email/templates/new-lead";

let resendClient: Resend | null = null;

function getResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export function getResendFromAddress() {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "LeadVon <onboarding@resend.dev>"
  );
}

export function getAppBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (!configured) return "http://localhost:3000";
  return configured.startsWith("http") ? configured : `https://${configured}`;
}

export async function sendNewLeadEmail(input: {
  to: string;
  recipientName: string;
  leadName: string;
  categoryName: string;
  phone: string;
  country: string;
  zipCode?: string | null;
  assignedAgentName?: string | null;
  locale?: string;
}) {
  const resend = getResend();
  if (!resend) {
    return { ok: false as const, skipped: true as const, reason: "RESEND_API_KEY is not configured" };
  }
  if (!input.to) {
    return { ok: false as const, skipped: true as const, reason: "Missing recipient email" };
  }

  const localePrefix = input.locale === "fr" ? "/fr" : "/en";
  const leadsUrl = `${getAppBaseUrl()}${localePrefix}/client/leads`;
  const { subject, html } = renderNewLeadEmail({
    recipientName: input.recipientName,
    leadName: input.leadName,
    categoryName: input.categoryName,
    phone: input.phone,
    country: input.country,
    zipCode: input.zipCode,
    assignedAgentName: input.assignedAgentName,
    leadsUrl,
  });

  const result = await resend.emails.send({
    from: getResendFromAddress(),
    to: input.to,
    subject,
    html,
  });

  if (result.error) {
    return { ok: false as const, skipped: false as const, reason: result.error.message };
  }

  return { ok: true as const, id: result.data?.id ?? null };
}
