import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const proxyUrl = process.env.PROXY_SERVER_URL || 'http://inspector-backend:3013';
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Missing sessionId parameter' },
      { status: 400 }
    );
  }
  
  try {
    // Get raw request body
    const body = await request.arrayBuffer();
    
    // Build the proxy URL
    const url = new URL(`${proxyUrl}/message`);
    url.searchParams.set('sessionId', sessionId);
    
    // Create headers to forward
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!['host', 'content-length'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
    // Make sure we set the Content-Type
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    
    // Forward the request
    console.log(`Forwarding message to ${url.toString()} with sessionId: ${sessionId}`);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body,
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    
    // Return the proxy response
    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    } else {
      const responseData = await response.json();
      return NextResponse.json(responseData, { status: response.status });
    }
  } catch (error) {
    console.error('Message proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to send message to proxy server', details: String(error) },
      { status: 500 }
    );
  }
}