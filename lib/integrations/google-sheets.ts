import crypto from "node:crypto";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function normalizePrivateKey(raw: string) {
  return raw.replace(/\\n/g, "\n").trim();
}

export function getGoogleSheetsServiceAccount(): ServiceAccountCredentials | null {
  const json = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as Partial<ServiceAccountCredentials>;
      if (parsed.client_email?.trim() && parsed.private_key?.trim()) {
        return {
          client_email: parsed.client_email.trim(),
          private_key: normalizePrivateKey(parsed.private_key),
        };
      }
    } catch {
      return null;
    }
  }

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) return null;

  return {
    client_email: clientEmail,
    private_key: normalizePrivateKey(privateKey),
  };
}

export function isGoogleSheetsConfigured() {
  return Boolean(getGoogleSheetsServiceAccount());
}

export function getGoogleSheetsEditorEmail() {
  return getGoogleSheetsServiceAccount()?.client_email ?? null;
}

async function getAccessToken() {
  const credentials = getGoogleSheetsServiceAccount();
  if (!credentials) {
    throw new Error("Google Sheets service account is not configured");
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.accessToken;
  }

  const iat = Math.floor(now / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claim = base64UrlJson({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  });
  const unsigned = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(credentials.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google OAuth token failed (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("Google OAuth token response missing access_token");
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

export async function appendSpreadsheetRows(args: {
  spreadsheetId: string;
  sheetName: string;
  range: string;
  values: string[][];
}) {
  const accessToken = await getAccessToken();
  const encodedRange = encodeURIComponent(`${args.sheetName}!${args.range}`);
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}/values/${encodedRange}:append`
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  url.searchParams.set("insertDataOption", "INSERT_ROWS");
  url.searchParams.set("includeValuesInResponse", "false");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: args.values }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets append failed (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
