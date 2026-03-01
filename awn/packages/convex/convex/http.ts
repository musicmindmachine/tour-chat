import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { resendClient } from "./notifications";

const http = httpRouter();

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return resendClient.handleResendEventWebhook(ctx, req);
  }),
});

export default http;
