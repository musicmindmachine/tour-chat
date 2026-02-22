"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {step === "request" ? "Sign in with email code" : "Enter your code"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "request" ? (
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const rawEmail = formData.get("email");
                if (typeof rawEmail !== "string") {
                  toast.error("Enter your email address.");
                  return;
                }

                const normalizedEmail = normalizeEmail(rawEmail);
                setIsRequestingCode(true);
                try {
                  await signIn("resend", {
                    email: normalizedEmail,
                    redirectTo: "/",
                  });
                  setEmail(normalizedEmail);
                  setCode("");
                  setStep("verify");
                  toast.success("Code sent. Check your email.");
                } catch (error) {
                  console.error(error);
                  toast.error(getErrorMessage(error));
                } finally {
                  setIsRequestingCode(false);
                }
              }}
            >
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </div>
              <Button
                className="w-full"
                type="submit"
                disabled={isRequestingCode}
              >
                {isRequestingCode ? "Sending code..." : "Send code"}
              </Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const trimmedCode = code.trim();
                if (trimmedCode.length === 0) {
                  toast.error("Enter the code from your email.");
                  return;
                }

                setIsVerifyingCode(true);
                try {
                  const result = await signIn("resend", {
                    email,
                    code: trimmedCode,
                    redirectTo: "/",
                  });
                  if (!result.signingIn) {
                    toast.error("Invalid or expired code. Request a new code.");
                    return;
                  }
                  toast.success("Signed in.");
                } catch (error) {
                  console.error(error);
                  toast.error(getErrorMessage(error));
                } finally {
                  setIsVerifyingCode(false);
                }
              }}
            >
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">
                  We sent a one-time code to <span className="font-medium text-foreground">{email}</span>.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="code" className="text-sm font-medium">
                  One-time code
                </label>
                <Input
                  id="code"
                  name="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                  placeholder="12345678"
                />
              </div>
              <Button className="w-full" type="submit" disabled={isVerifyingCode}>
                {isVerifyingCode ? "Verifying..." : "Verify and sign in"}
              </Button>
              <Button
                className="w-full"
                variant="outline"
                type="button"
                onClick={() => setStep("request")}
                disabled={isVerifyingCode}
              >
                Use another email
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Sign-in failed. Please try again.";
}
