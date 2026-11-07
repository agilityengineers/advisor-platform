import { useEffect } from "react";

interface Meta {
  title?: string;
  description?: string;
  /** e.g. "noindex, nofollow, noarchive" for private pricing pages. */
  robots?: string | null;
}

function setMeta(name: string, content: string | null | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!content) {
    if (el && el.dataset.managed === "1") el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    el.dataset.managed = "1";
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Document title and robots/description tags for a public page; robots is removed on unmount. */
export function useDocumentMeta({ title, description, robots }: Meta): void {
  useEffect(() => {
    if (title) document.title = title;
    if (description !== undefined) setMeta("description", description);
    setMeta("robots", robots ?? null);
    return () => {
      setMeta("robots", null);
    };
  }, [title, description, robots]);
}
