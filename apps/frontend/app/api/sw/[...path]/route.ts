import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// The BFF gateway: the browser calls same-origin /api/sw/* with its httpOnly cookie; this handler reads
// the sw access token from the session on the SERVER (never in the browser) and forwards to the sw api
// with `Authorization: Bearer`. All sw traffic goes through here.
const SW_API_URL = process.env.SW_API_URL ?? "http://localhost:4000";

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

  const url = `${SW_API_URL}/${path.join("/")}${req.nextUrl.search}`;
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

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}
