"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"idle" | "sent">("idle");
  const [isSending, setIsSending] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {step === "idle"
              ? "Sign in with a magic link"
              : "Check your email"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "idle" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                formData.set("redirectTo", "/");

                setIsSending(true);
                signIn("resend", formData)
                  .then(() => {
                    setStep("sent");
                  })
                  .catch((error) => {
                    console.error(error);
                    toast.error(
                      "Could not send sign-in link. If using Resend test mode, send only to your own Resend account email or verify a sending domain.",
                    );
                  })
                  .finally(() => setIsSending(false));
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
              <Button className="w-full" type="submit" disabled={isSending}>
                {isSending ? "Sending link..." : "Send magic link"}
              </Button>
            </form>
          ) : (
            <div className="space-y-3 text-sm">
              <p>A sign-in link has been sent to your email address.</p>
              <Button variant="outline" onClick={() => setStep("idle")}>
                Use another email
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
