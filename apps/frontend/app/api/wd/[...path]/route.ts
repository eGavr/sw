import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// The BFF gateway to the wd data plane (W3C New Session needs our bearer; everything after creation is
// authorized by possession of the session id and goes to wd directly — VNC/BiDi/commands never pass
// through here). Same pattern as /api/sw: the token lives only on this server.
const SW_WD_URL = process.env.SW_WD_URL ?? "http://localhost:3001";

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.AUTH_URL?.startsWith("https") ?? false,
  });

  const accessToken = token?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = `${SW_WD_URL}/${path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` };
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers["content-type"] = contentType;
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? await req.text() : undefined,
    redirect: "manual",
  });

  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}
