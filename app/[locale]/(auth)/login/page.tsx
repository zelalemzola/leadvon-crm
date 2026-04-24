import { LoginForm } from "@/components/auth/login-form";

export const metadata = {
  title: "Sign in · LeadVon",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <LoginForm initialError={error} />
    </div>
  );
}
