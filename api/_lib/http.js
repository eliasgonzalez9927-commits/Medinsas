export function allowOnly(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader("Allow", methods.join(", "));
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return false;
  }
  return true;
}

export function handleError(res, error) {
  console.error(error?.message ?? error);
  res.status(500).json({ error: "INTERNAL_ERROR" });
}

export function readQueryValue(value) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}
