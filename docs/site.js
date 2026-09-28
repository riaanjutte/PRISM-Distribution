// PRISM website: the vehicle rows, the render slideshow, and everything that follows a release (version, download files,
// checksums, what's new), read from GitHub so the page never needs editing when a release is published.
(() => {
  "use strict";
  const repo = "riaanjutte/PRISM-Distribution";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Two rows of vehicles, a fresh balanced draw from all four collections on every visit, like PRISM's welcome grid.
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  fetch("assets/profiles/index.json").then(r => r.json()).then(collections => {
    const pools = Object.entries(collections).map(([c, names]) => shuffle(names.map(n => `${c}__${n}`)));
    const draw = () => { const row = []; for (let k = 0; k < 4; k++) for (const pool of pools) if (pool.length) row.push(pool.pop()); return shuffle(row); };
    for (const id of ["row1", "row2"]) {
      const row = draw(), html = row.map(n => `<img src="assets/profiles/${n}.webp" alt="" width="320" height="140" loading="lazy">`).join("");
      // The rows scroll by half their width, so each carries its pictures twice; standing still, once is enough.
      $("#" + id).innerHTML = reduced ? html : html + html;
    }
  }).catch(() => { $(".marquee").hidden = true; });

  // The dark card's renders take turns.
  const renders = [...document.querySelectorAll(".renders img")];
  if (!reduced && renders.length > 1) { let i = 0; setInterval(() => { renders[i].classList.remove("on"); i = (i + 1) % renders.length; renders[i].classList.add("on"); }, 5000); }

  // ---- Releases ----------------------------------------------------------------------------------------------------
  // GitHub allows 60 unauthenticated API calls an hour per visitor, so the answer is kept for the session.
  const releases = () => {
    const key = "prism-releases", now = Date.now();
    try { const saved = JSON.parse(sessionStorage.getItem(key) || "null"); if (saved && now - saved.at < 30 * 60 * 1000) return Promise.resolve(saved.list); } catch { }
    return fetch(`https://api.github.com/repos/${repo}/releases?per_page=6`, { headers: { Accept: "application/vnd.github+json" } })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(list => { try { sessionStorage.setItem(key, JSON.stringify({ at: now, list })); } catch { } return list; });
  };
  const plain = s => s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]+/g, "").replace(/\s+/g, " ").trim();
  const clip = (s, n) => s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n)).replace(/[,;:.\s]+$/, "") + "…";
  // Release notes are Markdown: each "##" or "###" section gives a card, with its first point as the text. A section
  // named like the changelog ("v0.2.21 - Tracers in Blender exports") carries its own version.
  const highlights = release => {
    const cards = [], lines = (release.body || "").split(/\r?\n/);
    let current = null;
    const close = () => { if (current && current.text) cards.push(current); current = null; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], heading = line.match(/^#{2,3}\s+(.+)/);
      if (heading) {
        close();
        const title = plain(heading[1]);
        if (/^(highlights|summary|downloads?|checksums?|installation)$/i.test(title)) continue;
        const own = title.match(/^(v\d+\.\d+\.\d+)\s*[-–—:]\s*(.+)$/);
        current = { version: own ? own[1] : release.tag_name, title: own ? own[2] : title, text: "" };
        continue;
      }
      const bullet = line.match(/^\s*[-*]\s+(.+)/);
      if (current && !current.text && bullet) {
        let text = bullet[1];
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*[-*]\s/.test(lines[i + 1])) text += " " + lines[++i].trim();
        current.text = clip(plain(text), 180);
      }
    }
    close();
    return cards;
  };
  const size = bytes => bytes >= 1e6 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  const digest = asset => (asset.digest || "").replace(/^sha256:/, "");

  releases().then(list => {
    const published = list.filter(r => !r.draft && !r.prerelease);
    const latest = published[0];
    if (!latest) return;
    const version = latest.tag_name;
    document.querySelectorAll("[data-version]").forEach(e => e.textContent = version);

    const cards = [];
    for (const release of published) { for (const card of highlights(release)) if (cards.length < 3) cards.push(card); if (cards.length >= 3) break; }
    const chip = $("#chip");
    $("#chip-text").textContent = cards[0] ? cards[0].title : "See what's new";
    chip.hidden = false;
    $("#notes").href = latest.html_url;
    if (cards.length) $("#news").innerHTML = cards.map(c => `<article><span class="v">${esc(c.version)}</span><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p></article>`).join("");

    const assets = latest.assets || [];
    const installer = assets.find(a => /-setup\.exe$/i.test(a.name)), zip = assets.find(a => /\.zip$/i.test(a.name));
    const rows = [];
    const row = (asset, label, icon, primary) => {
      const sha = digest(asset);
      rows.push(`<a class="file" href="${esc(asset.browser_download_url)}"><span class="ic">${icon}</span><div><b>${label}</b><small class="mono">${esc(asset.name)} · ${size(asset.size)}${sha ? ` · sha256 ${sha.slice(0, 8)}…${sha.slice(-6)}` : ""}</small></div><span class="btn ${primary ? "amber" : "line"} small">Download</span></a>`);
    };
    if (installer) row(installer, "Installer", "EXE", true);
    if (zip) row(zip, "Portable zip", "ZIP", !installer);
    if (!rows.length) return;
    const full = [installer, zip].filter(Boolean).map(a => [a.name, digest(a)]).filter(([, d]) => d);
    const sha = full.length ? `<p class="sha mono">SHA-256 checksums${full.map(([n, d], i) => ` <button type="button" data-sha="${d}" title="${esc(n)}: ${d}">Copy ${i === 0 && installer ? "installer" : "zip"}</button>`).join("")} · <a href="${esc(latest.html_url)}">all files</a></p>` : "";
    $("#files").innerHTML = rows.join("") + sha;
    $("#files").addEventListener("click", e => {
      const b = e.target.closest("button[data-sha]"); if (!b) return;
      navigator.clipboard?.writeText(b.dataset.sha).then(() => { const t = b.textContent; b.textContent = "Copied"; setTimeout(() => b.textContent = t, 1500); });
    });
  }).catch(() => { /* The static links to the releases page stay. */ });
})();
