import { NextResponse } from 'next/server';

export async function GET() {
  const proxyUrl = process.env.PROXY_SERVER_URL;

  try {
    console.log('Fetching config from /api/config/route.ts:', proxyUrl);
    const response = await fetch(`${proxyUrl}/config`);
    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Config fetch error:', error);
    return NextResponse.json(
      { 
        defaultEnvironment: {},
        defaultCommand: 'mcp-server-everything',
        defaultArgs: ''
      },
      { status: 200 }
    );
  }
}