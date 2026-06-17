import { NextResponse } from "next/server";

import { extractBriefFromPdf } from "@/lib/briefs/extract";
import { BRIEF_DB_COLUMNS } from "@/lib/briefs/types";
import { createClient } from "@/lib/supabase/server";

// Reading the PDF with Claude can take a few seconds; give the function room.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Iniciá sesión." }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json({ error: "Falta el archivo PDF." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "El archivo tiene que ser un PDF." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El PDF supera los 20 MB." },
      { status: 400 },
    );
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const fields = await extractBriefFromPdf(base64);

    const { data, error } = await supabase
      .from("briefs")
      .insert({ ...fields, file_name: file.name, created_by: user.id })
      .select(BRIEF_DB_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ brief: data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo procesar el brief.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
