import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const transportType = searchParams.get('transportType');
  const proxyUrl = process.env.PROXY_SERVER_URL || 'http://inspector-backend:3013';
  
  // Forward to the proxy server
  const url = new URL(`${proxyUrl}/sse`);
  
  // Add all original search params
  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  
  // Forward the request with all headers
  const headers = new Headers(request.headers);
  
  try {
    const response = await fetch(url, {
      headers,
      method: 'GET',
    });
    
    // Create a readable stream response
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to proxy server' }, 
      { status: 500 }
    );
  }
}