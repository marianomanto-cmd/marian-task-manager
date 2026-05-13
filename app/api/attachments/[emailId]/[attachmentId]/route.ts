import { NextResponse, type NextRequest } from "next/server";

import { GoogleAuthRequiredError, getGmailClient } from "@/lib/gmail/client";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams a Gmail attachment back to the browser with a Content-Disposition
 * that triggers a download. RLS via Supabase scopes by user_id; we also
 * verify the email belongs to the requester before hitting Gmail.
 *
 * URL: /api/attachments/<email-row-id>/<gmail-attachment-id>?name=...&mime=...
 *   - name (optional): filename used in Content-Disposition
 *   - mime (optional): falls back to application/octet-stream
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ emailId: string; attachmentId: string }> },
) {
  const { emailId, attachmentId } = await context.params;
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("name") ?? "adjunto";
  const mime = searchParams.get("mime") ?? "application/octet-stream";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const { data: email, error } = await supabase
    .from("emails")
    .select("gmail_message_id")
    .eq("id", emailId)
    .eq("user_id", user.id)
    .single();
  if (error || !email) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const gmail = await getGmailClient();
    const { data } = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: email.gmail_message_id,
      id: attachmentId,
    });
    if (!data.data) {
      return NextResponse.json({ error: "empty_attachment" }, { status: 404 });
    }

    // Gmail returns base64url; convert to standard base64 for Buffer.
    const standardBase64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = Buffer.from(standardBase64, "base64");

    return new NextResponse(new Uint8Array(binary), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(binary.length),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    if (err instanceof GoogleAuthRequiredError) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
