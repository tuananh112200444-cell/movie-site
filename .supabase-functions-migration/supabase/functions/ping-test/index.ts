export default async function handler(_req) {
  return new Response(JSON.stringify({
    ok: true,
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
