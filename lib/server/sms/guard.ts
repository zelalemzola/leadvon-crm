import { NextResponse } from "next/server";
import {
  SMS_COMING_SOON_CODE,
  getSmsComingSoonMessage,
  isSmsFeatureEnabled,
} from "@/lib/sms/feature-gate";

export function rejectIfSmsComingSoon() {
  if (isSmsFeatureEnabled()) return null;
  return NextResponse.json(
    { error: getSmsComingSoonMessage(), code: SMS_COMING_SOON_CODE },
    { status: 503 }
  );
}
