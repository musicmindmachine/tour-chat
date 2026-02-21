"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function AccountPage() {
  const viewer = useQuery(api.users.viewer);
  const updateName = useMutation(api.users.updateName);
  const { signOut } = useAuthActions();
  const [displayName, setDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (viewer?.name) {
      setDisplayName(viewer.name);
    }
  }, [viewer?.name]);

  if (viewer === undefined) {
    return <p className="text-sm text-muted-foreground">Loading account...</p>;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="displayName" className="text-sm font-medium">
              Display name
            </label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your name"
            />
          </div>
          <Button
            disabled={isSaving}
            onClick={async () => {
              setIsSaving(true);
              try {
                await updateName({ name: displayName });
                toast.success("Profile updated");
              } catch (error) {
                console.error(error);
                toast.error("Could not update your profile");
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? "Saving..." : "Save profile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{viewer.email ?? "No email"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">User ID</p>
            <p className="break-all font-mono text-xs">{viewer._id}</p>
          </div>
          <Button variant="destructive" onClick={() => void signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
