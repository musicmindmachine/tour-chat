import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const resolvedParams = await params;
    const token = await convexAuthNextjsToken();
    if (!token) {
      return jsonError("Not signed in.", 401);
    }

    await fetchMutation(
      api.users.removeEmailFromAllowlist,
      { entryId: resolvedParams.entryId as Id<"emailAllowlist"> },
      { token },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(getErrorMessage(error), getStatusCode(error));
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getStatusCode(error: unknown) {
  const message = getErrorMessage(error);
  if (message.includes("Not signed in")) {
    return 401;
  }
  if (message.includes("Admin access required")) {
    return 403;
  }
  return 400;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Request failed.";
}
