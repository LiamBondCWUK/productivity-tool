import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = 'http://localhost:3001/api';
const TIMEOUT_MS = 30000; // 30 seconds

interface ProxyContext {
  params: Promise<{ path: string[] }>;
}

async function proxyRequest(
  request: NextRequest,
  method: string,
  pathSegments: string[]
): Promise<Response> {
  try {
    const pathString = pathSegments.join('/');
    const url = new URL(`${BACKEND_URL}/${pathString}`);

    // Preserve query parameters
    const searchParams = request.nextUrl.searchParams;
    for (const [key, value] of searchParams) {
      url.searchParams.append(key, value);
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
      },
    };

    // Forward body for non-GET requests
    if (method !== 'GET' && method !== 'HEAD') {
      const contentType = request.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        try {
          fetchOptions.body = JSON.stringify(await request.json());
        } catch {
          fetchOptions.body = await request.text();
        }
      } else {
        fetchOptions.body = await request.text();
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      let body: string | object = '';

      if (contentType?.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      return new NextResponse(typeof body === 'string' ? body : JSON.stringify(body), {
        status: response.status,
        headers: {
          'content-type': contentType || 'application/json',
        },
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Backend request timeout' },
          { status: 504 }
        );
      }
      throw fetchError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to proxy request to backend', details: message },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, 'GET', path);
}

export async function POST(request: NextRequest, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, 'POST', path);
}

export async function PUT(request: NextRequest, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, 'PUT', path);
}

export async function PATCH(request: NextRequest, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, 'PATCH', path);
}

export async function DELETE(request: NextRequest, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, 'DELETE', path);
}

export async function HEAD(request: NextRequest, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, 'HEAD', path);
}
