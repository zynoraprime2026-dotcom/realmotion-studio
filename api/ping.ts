// Minimal probe: no imports, no env, no async work. If this 500s too, the project
// is not building functions from api/ at all rather than studio.ts being at fault.
export default function handler(_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) {
  return res.status(200).json({ ok: true, at: 'ping' })
}
