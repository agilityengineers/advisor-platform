import { HERO_VIDEO_DEFAULTS, type SiteContent } from "@workspace/shared";
import { videoEmbed } from "@/lib/video";
import { initials } from "@/lib/utils";

/** Right-hand hero visual: the audit card by default, or the company's video when set and allowed. */
export function HeroMedia({ content, videoAllowed }: { content: SiteContent; videoAllowed: boolean }) {
  const { brand, heroMedia } = content;
  const embed = heroMedia.kind === "video" && videoAllowed ? videoEmbed(heroMedia.url) : null;

  if (embed && heroMedia.kind === "video") {
    const title = heroMedia.title || HERO_VIDEO_DEFAULTS.title;
    const caption = heroMedia.caption || HERO_VIDEO_DEFAULTS.caption;
    return (
      <div className="cs-video">
        <div style={{ aspectRatio: "16/9", width: "100%", position: "relative", background: "var(--navy)" }}>
          {embed.kind === "embed" ? (
            <iframe src={embed.src} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }} />
          ) : (
            <video src={embed.src} controls playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", objectFit: "cover" }} />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {brand.ownerPhoto ? (
            <img src={brand.ownerPhoto} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--blue)", color: "var(--on-primary)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(brand.ownerFullName || brand.ownerName)}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>{title}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#B9CBE0" }}>{caption}</div>
          </div>
        </div>
      </div>
    );
  }

  const rows: { ok: boolean; text: string }[] = [
    { ok: true, text: "Headline positions the niche, not the job title" },
    { ok: true, text: "About section written in your own voice" },
    { ok: false, text: "Keywords the algorithm never sees" },
    { ok: false, text: "No clear next step for an interested buyer" },
  ];
  return (
    <div className="cs-audit">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {brand.iconUrl ? (
          <img src={brand.iconUrl} alt="" style={{ width: 58, height: 58, objectFit: "contain", display: "block" }} />
        ) : (
          <div className="cs-display" style={{ width: 58, height: 58, borderRadius: 14, background: "var(--navy)", color: "#FFFFFF", fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {initials(brand.companyName)}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="cs-display" style={{ fontWeight: 700, fontSize: 16, color: "var(--navy)" }}>
            Profile audit
          </div>
          <div style={{ fontSize: 13, color: "#6A809A", fontWeight: 600 }}>22-section framework</div>
        </div>
        <div style={{ marginLeft: "auto", background: "var(--pale)", color: "var(--blue-deep)", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", padding: "6px 10px", borderRadius: 999 }}>LIVE</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
        {rows.map((r) => (
          <div key={r.text} className={`cs-audit__row ${r.ok ? "cs-audit__row--ok" : "cs-audit__row--warn"}`}>
            <div className="cs-audit__dot" style={{ background: r.ok ? "var(--blue)" : "#E39A2B", fontSize: r.ok ? 12 : 13 }}>
              {r.ok ? "✓" : "!"}
            </div>
            <div style={{ minWidth: 0 }}>{r.text}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px dashed #DDE8F7", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#5A718C", letterSpacing: "0.02em" }}>Sections reviewed</div>
        <div className="cs-display" style={{ fontWeight: 700, fontSize: 15, color: "var(--blue-deep)" }}>
          22 of 22
        </div>
      </div>
    </div>
  );
}
