export async function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'TRA Multi-Agent System (Expo Full-Stack)',
  });
}
