import { api } from "@/convex/_generated/api";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return jsonError("Not signed in.", 401);
    }

    const entries = await fetchQuery(
      api.users.listEmailAllowlist,
      {},
      { token },
    );
    return NextResponse.json({ entries });
  } catch (error) {
    return jsonError(getErrorMessage(error), getStatusCode(error));
  }
}

export async function POST(request: Request) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return jsonError("Not signed in.", 401);
    }

    const body = (await request.json()) as { email?: string };
    if (typeof body.email !== "string") {
      return jsonError("Email is required.", 400);
    }

    const entry = await fetchMutation(
      api.users.addEmailToAllowlist,
      { email: body.email },
      { token },
    );
    return NextResponse.json({ entry });
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
