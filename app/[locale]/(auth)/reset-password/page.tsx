import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = {
  title: "Reset password · LeadVon",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <ResetPasswordForm />
    </div>
  );
}
