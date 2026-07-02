export function emailLayout({
  preview,
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  footerNote,
}: {
  preview: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#111827;border:1px solid #312e81;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 12px;background:linear-gradient(135deg,#6d28d9,#4338ca);">
                <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.8);">LeadVon Client Portal</p>
                <h1 style="margin:12px 0 0;font-size:24px;line-height:1.3;color:#ffffff;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                ${bodyHtml}
                <p style="margin:28px 0 0;">
                  <a href="${ctaUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">
                    ${ctaLabel}
                  </a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
                  ${footerNote ?? "You are receiving this message because your organization is active on LeadVon."}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderNewLeadsDigestEmail({
  recipientName,
  leadCount,
  leadsUrl,
}: {
  recipientName: string;
  leadCount: number;
  leadsUrl: string;
}) {
  const safeCount = Math.max(1, Math.floor(leadCount));
  const greeting = recipientName.trim() ? `Hello ${recipientName},` : "Hello,";
  const summary =
    safeCount === 1
      ? "A new lead has been delivered to your organization and is now available in your LeadVon portal."
      : `${safeCount} new leads have been delivered to your organization and are now available in your LeadVon portal.`;
  const subject =
    safeCount === 1
      ? "New lead delivered to your LeadVon portal"
      : `${safeCount} new leads delivered to your LeadVon portal`;
  const preview =
    safeCount === 1
      ? "A new lead is ready for review in your LeadVon portal."
      : `${safeCount} new leads are ready for review in your LeadVon portal.`;
  const heading = safeCount === 1 ? "New Lead Delivered" : "New Leads Delivered";
  const ctaLabel = safeCount === 1 ? "View lead in portal" : "View leads in portal";

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#cbd5e1;">${greeting}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#cbd5e1;">${summary}</p>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#94a3b8;">
      Please sign in to review ${safeCount === 1 ? "the lead" : "your leads"} and begin outreach while the opportunity is fresh.
    </p>`;

  return {
    subject,
    html: emailLayout({
      preview,
      heading,
      bodyHtml,
      ctaLabel,
      ctaUrl: leadsUrl,
      footerNote:
        "This is a no-reply email. Please do not reply to this message.<br /><br />This is an automated notification from LeadVon. If you were not expecting this message, please contact your account administrator.",
    }),
  };
}
