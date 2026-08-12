export function isEventDetailPath(pathname) {
  return /\/(?:event(?:-details)?|events|calendar|shows|garcias-events)\/[a-z0-9][^/?#]*/i.test(
    String(pathname || ""),
  );
}
