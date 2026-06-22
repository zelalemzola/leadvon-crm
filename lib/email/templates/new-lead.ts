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

export function renderNewLeadEmail({
  recipientName,
  leadName,
  categoryName,
  phone,
  country,
  zipCode,
  assignedAgentName,
  leadsUrl,
}: {
  recipientName: string;
  leadName: string;
  categoryName: string;
  phone: string;
  country: string;
  zipCode?: string | null;
  assignedAgentName?: string | null;
  leadsUrl: string;
}) {
  const greeting = recipientName.trim() ? `Hello ${recipientName},` : "Hello,";
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#cbd5e1;">${greeting}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#cbd5e1;">
      A new lead has been delivered to your organization and is now available in your LeadVon portal.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1220;border:1px solid #1e293b;border-radius:12px;">
      <tr>
        <td style="padding:16px 18px;border-bottom:1px solid #1e293b;">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;">Lead</p>
          <p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#f8fafc;">${leadName}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 8px;font-size:14px;color:#cbd5e1;"><strong style="color:#f8fafc;">Product:</strong> ${categoryName || "—"}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#cbd5e1;"><strong style="color:#f8fafc;">Phone:</strong> ${phone || "—"}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#cbd5e1;"><strong style="color:#f8fafc;">Country:</strong> ${country || "—"}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#cbd5e1;"><strong style="color:#f8fafc;">Zip code:</strong> ${zipCode || "—"}</p>
          <p style="margin:0;font-size:14px;color:#cbd5e1;"><strong style="color:#f8fafc;">Assigned agent:</strong> ${assignedAgentName || "Unassigned"}</p>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#94a3b8;">
      Please review the lead promptly so your team can begin outreach while the opportunity is fresh.
    </p>`;

  return {
    subject: `New lead received: ${leadName}`,
    html: emailLayout({
      preview: `A new lead (${leadName}) is ready in your LeadVon portal.`,
      heading: "New Lead Received",
      bodyHtml,
      ctaLabel: "View lead in portal",
      ctaUrl: leadsUrl,
      footerNote:
        "This is an automated notification from LeadVon. If you were not expecting this message, please contact your account administrator.",
    }),
  };
}
