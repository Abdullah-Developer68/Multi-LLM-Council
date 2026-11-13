export function GET() {
  return Response.json({ status: 'ok', service: 'TRA Council', timestamp: new Date().toISOString() });
}
