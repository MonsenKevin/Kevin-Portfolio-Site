#!/usr/bin/env node
/**
 * profile-build.js
 * Reads profile.json and outputs:
 *   dist/Kevin_Monsen_Resume.docx   — formatted resume
 *   dist/Kevin_Monsen_Resume.pdf    — PDF via LibreOffice
 *   dist/projects-grid.html         — project grid snippet (reference copy)
 *   dist/index.html                 — index.html with project grid injected in-place
 *   dist/pages/[id].html            — one project page per project
 *
 * index.html injection requires two marker comments in your index.html:
 *   <!-- BEGIN:PROJECTS -->
 *   <!-- END:PROJECTS -->
 * Everything between them is replaced on every build. Add them once; never touch again.
 *
 * Usage:  node build.js [path/to/profile.json]
 * Default profile path: ./profile.json
 */

const fs   = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  LevelFormat, BorderStyle, TabStopType, TabStopPosition,
  PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
  UnderlineType, HeadingLevel,
} = require("docx");

// ─── Config ───────────────────────────────────────────────────────────────────

const PROFILE_PATH = process.argv[2] || path.join(__dirname, "profile.json");
const DIST         = path.join(__dirname, "dist");
const PAGES_DIR    = path.join(DIST, "pages");

[DIST, PAGES_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a string with <strong> tags into an array of TextRun objects */
function parseRuns(str, baseOpts = {}) {
  const runs = [];
  const re = /<strong>(.*?)<\/strong>/g;
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) runs.push(new TextRun({ ...baseOpts, text: str.slice(last, m.index) }));
    runs.push(new TextRun({ ...baseOpts, text: m[1], bold: true }));
    last = re.lastIndex;
  }
  if (last < str.length) runs.push(new TextRun({ ...baseOpts, text: str.slice(last) }));
  return runs;
}

/** Strip all HTML tags for plain-text contexts */
function stripTags(str) {
  return (str || "").replace(/<[^>]+>/g, "");
}

// Resume accent colour (teal) — used for section rule borders
const TEAL = "2C7A7B";

// DXA constants (1 inch = 1440 DXA)
const PAGE_W       = 12240;   // 8.5"
const PAGE_H       = 15840;   // 11"
const MARGIN_TB    = 720;     // 0.5"
const MARGIN_LR    = 900;     // 0.625"
const CONTENT_W    = PAGE_W - MARGIN_LR * 2;   // 10440

// ─── DOCX Builder ─────────────────────────────────────────────────────────────

function buildDocx() {
  const p = profile;
  const children = [];

  // ── Name ──────────────────────────────────────────────────────────────────
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: p.personal.name, bold: true, size: 36, font: "Calibri" })],
  }));

  // ── Contact line ──────────────────────────────────────────────────────────
  const contactParts = [
    p.personal.email,
    p.personal.linkedin,
    p.personal.website,
    p.personal.phone,
  ];
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: contactParts.join(" • "), size: 18, font: "Calibri", color: "444444" })],
  }));

  // ── Section helper ─────────────────────────────────────────────────────────
  function sectionHeading(label) {
    return new Paragraph({
      spacing: { before: 120, after: 40 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 1 } },
      children: [new TextRun({ text: label.toUpperCase(), bold: true, size: 22, font: "Calibri", color: TEAL })],
    });
  }

  // ── Two-column line helper (left text + right-aligned date via tab stop) ───
  function twoCol(leftRuns, rightText, opts = {}) {
    return new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      spacing: { before: opts.before ?? 80, after: opts.after ?? 20 },
      children: [
        ...leftRuns,
        new TextRun({ text: "\t" }),
        new TextRun({ text: rightText || "", size: opts.rightSize ?? 20, font: "Calibri", italics: opts.italics }),
      ],
    });
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  children.push(sectionHeading("Summary"));
  children.push(new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: p.summary, size: 20, font: "Calibri" })],
  }));

  // ── EDUCATION ─────────────────────────────────────────────────────────────
  children.push(sectionHeading("Education"));
  for (const edu of p.education) {
    // Degree + GPA  |  Grad date
    children.push(twoCol(
      [new TextRun({ text: `${edu.degree} (${edu.concentration})`, bold: true, size: 20, font: "Calibri" }),
       new TextRun({ text: `   GPA: ${edu.gpa}`, size: 20, font: "Calibri", color: "555555" })],
      edu.expected_graduation,
      { before: 60, after: 0, rightSize: 20 }
    ));
    // Institution
    children.push(twoCol(
      [new TextRun({ text: edu.institution, size: 20, font: "Calibri", italics: true }),
       new TextRun({ text: `, ${edu.location}`, size: 20, font: "Calibri", italics: true })],
      "",
      { before: 0, after: 40 }
    ));
    // Coursework
    children.push(new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({ text: "Relevant Coursework: ", bold: true, size: 19, font: "Calibri" }),
        new TextRun({ text: edu.relevant_coursework.join(", "), size: 19, font: "Calibri" }),
      ],
    }));
  }

  // ── TECHNICAL SKILLS ──────────────────────────────────────────────────────
  children.push(sectionHeading("Technical Skills"));
  // Group by category
  const catMap = {};
  for (const skill of p.technical_skills) {
    (catMap[skill.category] = catMap[skill.category] || []).push(skill.name);
  }
  for (const [cat, skills] of Object.entries(catMap)) {
    children.push(new Paragraph({
      spacing: { before: 40, after: 30 },
      children: [
        new TextRun({ text: `${cat}: `, bold: true, size: 20, font: "Calibri" }),
        new TextRun({ text: skills.join(", "), size: 20, font: "Calibri" }),
      ],
    }));
  }

  // ── PROJECTS ──────────────────────────────────────────────────────────────
  children.push(sectionHeading("Projects"));
  const topN = p._meta.resume_top_n;
  const resumeProjects = p.projects
    .filter(proj => proj.resume_rank !== null && proj.resume_rank <= topN)
    .sort((a, b) => a.resume_rank - b.resume_rank);

  for (const proj of resumeProjects) {
    // Title + sponsor  |  Date
    children.push(twoCol(
      [new TextRun({ text: proj.title, bold: true, size: 20, font: "Calibri" }),
       new TextRun({ text: proj.sponsor ? ` – ${proj.sponsor}` : "", size: 20, font: "Calibri" })],
      proj.date || "",
      { before: 80, after: 0, rightSize: 20 }
    ));
    // Bullets
    for (const bullet of proj.resume.bullets) {
      children.push(new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { before: 20, after: 20 },
        children: parseRuns(bullet, { size: 20, font: "Calibri" }),
      }));
    }
  }

  // ── WORK EXPERIENCE ───────────────────────────────────────────────────────
  children.push(sectionHeading("Work Experience"));
  for (const job of p.work_experience) {
    children.push(twoCol(
      [new TextRun({ text: `${job.employer}: `, bold: true, size: 20, font: "Calibri" }),
       new TextRun({ text: `${job.title} (${job.hours_per_week} hours/week) - ${job.location}`, size: 20, font: "Calibri" })],
      `${job.start_date} – ${job.end_date}`,
      { before: 80, after: 0, rightSize: 20 }
    ));
    for (const bullet of job.bullets) {
      children.push(new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { before: 20, after: 20 },
        children: parseRuns(bullet, { size: 20, font: "Calibri" }),
      }));
    }
  }

  // ── ADDITIONAL INFORMATION ────────────────────────────────────────────────
  children.push(sectionHeading("Additional Information"));
  const awardLine = p.awards.map(a => a.title).join(", ");
  children.push(new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 20 },
    children: [new TextRun({ text: awardLine, size: 20, font: "Calibri" })],
  }));

  // ── Document assembly ─────────────────────────────────────────────────────
  const doc = new Document({
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 240 } } },
        }],
      }],
    },
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN_TB, right: MARGIN_LR, bottom: MARGIN_TB, left: MARGIN_LR },
        },
      },
      children,
    }],
  });

  return doc;
}

// ─── Project Grid HTML Builder ──────────────────────────────────────────────────
/**
 * Generates a filterable project grid matching kevinmonsen.com's design system.
 *
 *   <div class="project-filters" role="tablist" aria-label="Filter projects by category">
 *     <button class="filter-chip is-active" data-filter="all" ...>All</button>
 *     <button class="filter-chip" data-filter="Cybersecurity" ...>Cybersecurity</button>
 *     ...
 *   </div>
 *   <div class="project-grid">
 *     <a class="project-card" href="./[id].html" data-category="[category]">
 *       <h3 class="project-card__title">[title]</h3>
 *       <p class="project-card__desc">[short description]</p>
 *       <span class="project-card__tag">[category]</span>
 *     </a>
 *     ...
 *   </div>
 *
 * Categories come straight from profile.json (proj.category) — unchanged.
 * The whole block is injected between <!-- BEGIN:PROJECTS --> and
 * <!-- END:PROJECTS --> in index.html. Filtering is handled client-side in main.js.
 */

/** Short card blurb: prefer the website problem statement, fall back to outcome. */
function cardBlurb(proj) {
  const w = proj.website;
  const pick = (w.problem && w.problem !== "TODO") ? w.problem
             : (w.outcome && w.outcome !== "TODO") ? w.outcome
             : "";
  return stripTags(pick);
}

function buildProjectGrid() {
  // Collect projects (website-only + resume) and category order by first appearance.
  const projects   = profile.projects.filter(hasWebsite);
  const categories = [];
  for (const proj of projects) {
    const cat = proj.category || "Other";
    if (!categories.includes(cat)) categories.push(cat);
  }

  let html = `<!-- AUTO-GENERATED by build.js — do not edit manually -->\n`;

  // Filter chips: "All" first, then one per category (in first-seen order).
  html += `<div class="project-filters" role="tablist" aria-label="Filter projects by category">\n`;
  html += `  <button class="filter-chip is-active" type="button" role="tab" aria-selected="true" data-filter="all">All</button>\n`;
  for (const cat of categories) {
    html += `  <button class="filter-chip" type="button" role="tab" aria-selected="false" data-filter="${escAttr(cat)}">${escHtml(cat)}</button>\n`;
  }
  html += `</div>\n`;

  // Card grid.
  html += `<div class="project-grid">\n`;
  for (const proj of projects) {
    const cat  = proj.category || "Other";
    const href = `./${proj.id}.html`;

    html += `  <a class="project-card" href="${escHtml(href)}" data-category="${escAttr(cat)}">\n`;
    html += `    <h3 class="project-card__title">${escHtml(proj.title)}</h3>\n`;
    html += `    <p class="project-card__desc">${escHtml(cardBlurb(proj))}</p>\n`;
    html += `    <span class="project-card__tag">${escHtml(cat)}</span>\n`;
    html += `  </a>\n`;
  }
  html += `</div>`;

  return html;
}

// ─── Project Page Builder ──────────────────────────────────────────────────────
/**
 * Generates one standalone HTML project page per project.
 * Matches the structure of existing pages (ohlone.html, network.html, etc):
 *
 *   .showcase > .problem-solver > .grid
 *     .column  — back link + hero image
 *     .content — h2, chip pills, essay paragraphs, optional CTA button
 *
 * profile.json fields used:
 *   website.image_path    — path to hero image (e.g. ./images/ohlone.png); TODO = omit figure
 *   website.image_caption — figcaption text (screen-reader only via .sr-only)
 *   website.essay         — full HTML for the <p class="intro"> block; TODO = placeholder
 *   website.cta           — { label: "Visit Site", url: "https://..." } or null = no button
 *   website.relevance     — comma-separated tags → .chip pills
 *   id                    — used for the canonical URL and h2 anchor
 */
function buildProjectPage(proj) {
  const w        = proj.website;
  const hasImage = w.image_path && w.image_path !== "TODO";
  const hasEssay = w.essay      && w.essay      !== "TODO";
  const hasCta   = w.cta        && w.cta.url    && w.cta.url !== "TODO";

  // Chip pills from the relevance string (all of them — no cap on project pages)
  const chips = w.relevance
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `                        <span class="chip">${escHtml(t)}</span>`)
    .join("\n");

  // Hero image block
  const imageBlock = hasImage
    ? `                <figure class="leadership-media" aria-hidden="true">
                    <img src="${escHtml(w.image_path)}" alt="" />
                    <figcaption class="sr-only">${escHtml(w.image_caption)}</figcaption>
                </figure>`
    : `                <!-- TODO: add hero image
                <figure class="leadership-media" aria-hidden="true">
                    <img src="./images/${proj.id}.png" alt="" />
                    <figcaption class="sr-only">Caption here</figcaption>
                </figure> -->`;

  // Essay / intro block
  let essayBlock = hasEssay
    ? w.essay
    : `<!-- TODO: replace with your written paragraphs -->
                    <p><strong>Problem:</strong> ${escHtml(stripTags(w.problem))}</p>
                    <p><strong>Approach:</strong> ${sanitizeHtml(w.approach)}</p>
                    <p><strong>Outcome:</strong> ${escHtml(stripTags(w.outcome))}</p>`;
  // Replace newline characters from profile.json with <br> for HTML output
  essayBlock = essayBlock.replace(/\r?\n/g, "<br>");
  // CTA button block
  const ctaBlock = hasCta
    ? `                    <div class="cta-buttons">
                        <a href="${escHtml(w.cta.url)}">${escHtml(w.cta.label)}</a>
                    </div>`
    : `                    <!-- no CTA for this project -->`;

  // ── SEO metadata ────────────────────────────────────────────────────────
  // Build a concise, plain-text meta description from problem + outcome.
  const descParts = [];
  if (w.problem && w.problem !== "TODO") descParts.push(stripTags(w.problem));
  if (w.outcome && w.outcome !== "TODO") descParts.push(stripTags(w.outcome));
  let metaDesc = descParts.join(" ").replace(/\s+/g, " ").trim();
  if (!metaDesc) metaDesc = `${proj.title} — a project by Kevin Monsen.`;
  if (metaDesc.length > 300) metaDesc = metaDesc.slice(0, 297).trimEnd() + "…";
  const metaDescAttr = escAttr(metaDesc);

  const pageUrl  = `https://kevinmonsen.com/${proj.id}.html`;
  const ogImage  = hasImage
    ? `https://kevinmonsen.com/${w.image_path.replace(/^\.\//, "")}`
    : "https://kevinmonsen.com/images/kevin.JPG";
  const keywords = escAttr((w.relevance || "").split(",").map(t => t.trim()).filter(Boolean).join(", "));

  // JSON-LD: CreativeWork nested in a breadcrumb-friendly Person authorship
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": proj.title,
    "headline": proj.title,
    "url": pageUrl,
    "description": metaDesc,
    "author": { "@type": "Person", "name": "Kevin Monsen", "url": "https://kevinmonsen.com/" },
    ...(hasImage ? { "image": ogImage } : {}),
    ...(proj.date ? { "dateCreated": proj.date } : {}),
    ...(keywords ? { "keywords": keywords } : {})
  };
  const jsonLdBlock = JSON.stringify(jsonLd, null, 4)
    .split("\n").map(l => "    " + l).join("\n");

  return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escAttr(proj.title)} | Kevin Monsen Portfolio</title>
    <meta name="description" content="${metaDescAttr}">
    <meta name="author" content="Kevin Monsen">${keywords ? `\n    <meta name="keywords" content="${keywords}">` : ""}
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${pageUrl}">
    <link rel="icon" href="./favicon.svg" type="image/svg+xml">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Kevin Monsen Portfolio">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:title" content="${escAttr(proj.title)} | Kevin Monsen Portfolio">
    <meta property="og:description" content="${metaDescAttr}">
    <meta property="og:image" content="${escAttr(ogImage)}">

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escAttr(proj.title)} | Kevin Monsen Portfolio">
    <meta name="twitter:description" content="${metaDescAttr}">
    <meta name="twitter:image" content="${escAttr(ogImage)}">

    <link rel="stylesheet" href="./style.css">
    <script type="module" src="./main.js"></script>

    <!-- Structured data -->
    <script type="application/ld+json">
${jsonLdBlock}
    </script>
</head>

<body>
    <div class="showcase">
        <section class="problem-solver">
            <div class="grid">
                <div class="column">
                    <a href="./" class="back-btn">← Return Home</a>
${imageBlock}
                </div>

                <!-- Right: content -->
                <div class="content">
                    <h2 id="${proj.id}">${escHtml(proj.title)}</h2>
                    <div class="metrics">
${chips}
                    </div>
                    <p class="intro">
                        ${essayBlock}
                    </p>
${ctaBlock}
                </div>
        </section>
    </div>
</body>

</html>
`;
}

// ─── Project Grid Injector ─────────────────────────────────────────────────────
/**
 * Reads index.html, replaces everything between the marker comments with the
 * freshly-built project grid HTML, and writes the result to dist/index.html.
 *
 * Markers (add these once to your index.html, never touch again):
 *   <!-- BEGIN:PROJECTS -->
 *   <!-- END:PROJECTS -->
 */
function injectProjectGrid(gridHtml) {
  const INDEX_SRC  = path.join(__dirname, "index.html");
  const INDEX_DIST = path.join(DIST, "index.html");
  const BEGIN      = "<!-- BEGIN:PROJECTS -->";
  const END        = "<!-- END:PROJECTS -->";

  if (!fs.existsSync(INDEX_SRC)) {
    console.warn("  ⚠  index.html not found next to build.js — skipping injection.");
    console.warn(`     Place the markers in your index.html:\n     ${BEGIN}\n     ${END}`);
    return false;
  }

  const src    = fs.readFileSync(INDEX_SRC, "utf8");
  const iBegin = src.indexOf(BEGIN);
  const iEnd   = src.indexOf(END);

  if (iBegin === -1 || iEnd === -1) {
    console.warn("  ⚠  Markers not found in index.html — skipping injection.");
    console.warn(`     Add these two lines inside your projects section:\n     ${BEGIN}\n     ${END}`);
    return false;
  }

  if (iEnd <= iBegin) {
    console.warn("  ⚠  END:PROJECTS marker appears before BEGIN:PROJECTS — check your index.html.");
    return false;
  }

  // Indent the grid content to match surrounding HTML (2 spaces)
  const indented = gridHtml
    .split("\n")
    .map(line => line.length ? "  " + line : line)
    .join("\n");

  const injected =
    src.slice(0, iBegin + BEGIN.length) +
    "\n" + indented + "\n  " +
    src.slice(iEnd);

  fs.writeFileSync(INDEX_DIST, injected);
  return true;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, "<br>");
}

/** Escape for use inside an HTML attribute value (no <br> conversion) */
function escAttr(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Allow only <strong> tags through; escape everything else */
function sanitizeHtml(str) {
  if (!str || str === "TODO") return "TODO";
  return str
    .replace(/&/g, "&amp;")
    .replace(/<strong>/g, "\x01OPEN\x01")
    .replace(/<\/strong>/g, "\x01CLOSE\x01")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\x01OPEN\x01/g, "<strong>")
    .replace(/\x01CLOSE\x01/g, "</strong>");
}

function hasWebsite(proj) {
  return proj.website && typeof proj.website === "object";
}

// ─── PDF via LibreOffice ───────────────────────────────────────────────────────

function docxToPdf(docxPath, outDir) {
  const { execSync } = require("child_process");
  try {
    execSync(
      `python3 /home/user/scripts/office/soffice.py --headless --convert-to pdf "${docxPath}" --outdir "${outDir}"`,
      { stdio: "pipe" }
    );
    return true;
  } catch (e) {
    // Fallback: try bare soffice
    try {
      execSync(
        `soffice --headless --convert-to pdf "${docxPath}" --outdir "${outDir}"`,
        { stdio: "pipe" }
      );
      return true;
    } catch (e2) {
      console.warn("  ⚠  LibreOffice not available — PDF skipped. Run manually:");
      console.warn(`     soffice --headless --convert-to pdf "${docxPath}" --outdir "${outDir}"`);
      return false;
    }
  }
}
function writeManifest(pages) {
  fs.writeFileSync(
    path.join(DIST, "generated-pages.json"),
    JSON.stringify({ pages }, null, 2)
  );
}

// ─── Sitemap Builder ───────────────────────────────────────────────────────────
/**
 * Generates sitemap.xml from the same project list used for page generation,
 * so adding a project to profile.json automatically adds it to the sitemap.
 *
 * Static entries (home, resume) are always included. Project pages inherit a
 * priority based on whether they appear on the resume (resume_rank set).
 *
 * Base URL is derived from profile.personal.website; lastmod is the build date.
 */
const SITE_BASE = (() => {
  const raw = (profile.personal && profile.personal.website) || "kevinmonsen.com";
  const host = raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}`;
})();

function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const entries = [
    { loc: `${SITE_BASE}/`,            priority: "1.00", changefreq: "monthly" },
    { loc: `${SITE_BASE}/resume.html`, priority: "0.90", changefreq: "monthly" },
  ];

  for (const proj of profile.projects) {
    if (!hasWebsite(proj)) continue;
    // Resume-ranked projects are the flagship work → higher priority.
    const onResume = proj.resume_rank !== null && proj.resume_rank !== undefined;
    entries.push({
      loc: `${SITE_BASE}/${proj.id}.html`,
      priority: onResume ? "0.80" : "0.60",
      changefreq: "monthly",
    });
  }

  const urlXml = entries.map(e =>
    `  <url>\n` +
    `    <loc>${e.loc}</loc>\n` +
    `    <lastmod>${today}</lastmod>\n` +
    `    <changefreq>${e.changefreq}</changefreq>\n` +
    `    <priority>${e.priority}</priority>\n` +
    `  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urlXml}\n` +
    `</urlset>\n`;
}

function writeSitemap() {
  const xml = buildSitemap();
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), xml);
  return (xml.match(/<url>/g) || []).length;
}
// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📄  Reading profile: ${PROFILE_PATH}`);
  console.log(`📦  Output directory: ${DIST}\n`);

  // 1. Resume DOCX
  console.log("  Building resume.docx …");
  const doc = buildDocx();
  const docxPath = path.join(DIST, "Kevin_Monsen_Resume.docx");
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  console.log(`  ✓ ${docxPath}`);

  // 2. PDF via LibreOffice
  console.log("  Converting to PDF …");
  const pdfOk = docxToPdf(docxPath, DIST);
  if (pdfOk) {
    console.log(`  ✓ ${path.join(DIST, "Kevin_Monsen_Resume.pdf")}`);
  }

  // 3. Project grid snippet + inject into index.html
  console.log("  Building project grid …");
  const gridHtml = buildProjectGrid();
  const gridPath = path.join(DIST, "projects-grid.html");
  fs.writeFileSync(gridPath, gridHtml);
  console.log(`  ✓ dist/projects-grid.html (reference copy)`);

  process.stdout.write("  Injecting project grid into index.html … ");
  const injected = injectProjectGrid(gridHtml);
  if (injected) console.log(`✓ dist/index.html`);

  // 4. Project pages
  console.log("  Building project pages …");
  const generatedPages = [];
  for (const proj of profile.projects) {
    if (!hasWebsite(proj)) continue;
    const pagePath = path.join(PAGES_DIR, `${proj.id}.html`);
    fs.writeFileSync(pagePath, buildProjectPage(proj));
    generatedPages.push(`${proj.id}.html`);
    console.log(`  ✓ ${pagePath}`);
  }
  writeManifest(generatedPages);
  console.log(`  ✓ generated-pages.json (${generatedPages.length} pages tracked)`);

  // 5. Sitemap
  console.log("  Building sitemap …");
  const sitemapCount = writeSitemap();
  console.log(`  ✓ dist/sitemap.xml (${sitemapCount} URLs)`);

  // 6. Summary
  const topN = profile._meta.resume_top_n;
  const resumeCount = profile.projects.filter(p => p.resume_rank !== null && p.resume_rank <= topN).length;
  const todoCount = JSON.stringify(profile).split('"TODO"').length - 1;

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Done.
  resume_top_n : ${topN}
  Resume projects shown : ${resumeCount}
  Total projects : ${profile.projects.length}
  Remaining TODOs in profile.json : ${todoCount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch(err => { console.error(err); process.exit(1); });
