/**
 * Hash router.
 *
 * Hash routes keep the app deployable as static files (no server rewrite rules)
 * and make a run shareable, e.g. `#/incident/disk-full`.
 */

import { useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "incident"; id: string }
  | { name: "debrief"; id: string }
  | { name: "progress" };

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const [head, id] = clean.split("/");

  if (head === "incident" && id) return { name: "incident", id };
  if (head === "debrief" && id) return { name: "debrief", id };
  if (head === "progress") return { name: "progress" };
  return { name: "home" };
}

export function navigate(path: string): void {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}
