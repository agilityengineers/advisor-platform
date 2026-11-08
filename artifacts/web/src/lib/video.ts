/** Hero video: a pasted YouTube / Vimeo / Loom link or a direct file URL. */
export type VideoEmbed = { kind: "file"; src: string } | { kind: "embed"; src: string } | null;

export function videoEmbed(url: string | undefined | null): VideoEmbed {
  const v = (url ?? "").trim();
  if (!v) return null;
  if (/\.(mp4|webm|mov)(\?|$)/i.test(v)) return { kind: "file", src: v };
  const yt = v.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  if (yt) return { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1` };
  const vm = v.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: "embed", src: `https://player.vimeo.com/video/${vm[1]}` };
  const lm = v.match(/loom\.com\/(?:share|embed)\/([\w]+)/);
  if (lm) return { kind: "embed", src: `https://www.loom.com/embed/${lm[1]}` };
  return /^https:\/\//i.test(v) ? { kind: "embed", src: v } : null;
}
