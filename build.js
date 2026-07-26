#!/usr/bin/env node
/**
 * profile-build.js
 * Reads profile.json and outputs:
 *   dist/Kevin_Monsen_Resume.docx   — formatted resume
 *   dist/Kevin_Monsen_Resume.pdf    — PDF via LibreOffice
 *   dist/accordion.html             — accordion snippet (reference copy)
 *   dist/index.html                 — index.html with accordion injected in-place
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
      [new TextRun({ text: `${job.employer}, ${job.location}: `, bold: true, size: 20, font: "Calibri" }),
       new TextRun({ text: `${job.title} (${job.hours_per_week} hours/week)`, size: 20, font: "Calibri" })],
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

// ─── Accordion HTML Builder ────────────────────────────────────────────────────
/**
 * Generates a drop-in HTML snippet for the #my-projects accordion section.
 * Structure matches the pattern observed on kevinmonsen.com:
 *   <details class="project-item"> <summary>[category]</summary>
 *     <div class="project-card"> ... </div>
 *   </details>
 *
 * Grouped by project category.
 * Each project card contains Title, Problem, Approach, Outcome, Relevance + link.
 */
function buildAccordion() {
  // Group projects by category
  const groups = {};
  for (const proj of profile.projects) {
    const cat = proj.category || "Other";
    (groups[cat] = groups[cat] || []).push(proj);
  }

  let html = `<!-- AUTO-GENERATED by build.js — do not edit manually -->
<!-- Paste this block to replace the contents of the #my-projects section -->
<section id="my-projects">
  <h2>My Projects</h2>
  <p>Selected real-world engineering projects demonstrating system design, problem solving, and hands-on implementation. Each project includes technical details and, where applicable, source code.</p>
\n`;

  for (const [category, projects] of Object.entries(groups)) {
    html += `  <details class="project-category">\n`;
    html += `    <summary>${escHtml(category)}</summary>\n\n`;

    for (const proj of projects) {
      const w = proj.website;
      const hasPage = w.page_url && w.page_url !== "TODO";
      const link = hasPage
        ? `\n      <a href="${escHtml(w.page_url.replace("kevinmonsen.com/", ""))}">View project →</a>`
        : "";

      html += `    <div class="project-card">\n`;
      html += `      <strong>Project Title</strong>: ${escHtml(proj.title)}<br>\n`;
      if (proj.sponsor) html += `      <strong>Sponsor</strong>: ${escHtml(proj.sponsor)}<br>\n`;
      html += `      <strong>Problem</strong>: ${escHtml(stripTags(w.problem))}<br>\n`;
      html += `      <strong>Approach</strong>: ${w.approach !== "TODO" ? sanitizeHtml(w.approach) : "TODO"}<br>\n`;
      html += `      <strong>Outcome</strong>: ${escHtml(stripTags(w.outcome))}<br>\n`;
      html += `      <strong>Relevance</strong>: ${escHtml(w.relevance)}${link}\n`;
      html += `    </div>\n\n`;
    }

    html += `  </details>\n\n`;
  }

  html += `</section>\n`;
  return html;
}

// ─── Project Page Builder ──────────────────────────────────────────────────────
/**
 * Generates one standalone HTML project page per project.
 * Matches the structure of existing pages (tracer.html, network.html):
 *   nav → hero image → title → tag pills → essay paragraphs
 *
 * Files are named dist/pages/[id].html
 * If essay/image are TODO, placeholder comments are inserted.
 */
function buildProjectPage(proj) {
  const w = proj.website;
  const hasImage = w.image_path && w.image_path !== "TODO";
  const hasEssay = w.essay && w.essay !== "TODO";

  // Derive tag pills from relevance string
  const tags = w.relevance
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 5); // cap at 5 pills to keep header clean

  const imageSrc    = hasImage ? w.image_path : "";
  const imageCaption = hasImage ? escHtml(w.image_caption) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(proj.title)} — Kevin Monsen Portfolio</title>
  <link rel="canonical" href="https://kevinmonsen.com/${proj.id}.html">
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <nav><a href="index.html">← Return Home</a></nav>

  ${hasImage
    ? `<figure>\n    <img src="${escHtml(imageSrc)}" alt="${escHtml(proj.title)}">\n    <figcaption>${imageCaption}</figcaption>\n  </figure>`
    : `<!-- TODO: Add hero image\n  <figure>\n    <img src="images/${proj.id}.jpg" alt="${escHtml(proj.title)}">\n    <figcaption>Caption here</figcaption>\n  </figure> -->`}

  <article class="project-page">

    <header>
      <h2>${escHtml(proj.title)}</h2>
      <p class="project-meta">${escHtml(proj.sponsor || "")}${proj.date ? ` · ${escHtml(proj.date)}` : ""}</p>
      <div class="tag-list">
        ${tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join("\n        ")}
      </div>
    </header>

    ${hasEssay
      ? `<div class="project-essay">\n      ${w.essay}\n    </div>`
      : `<!-- TODO: Replace this block with your essay paragraphs -->
    <div class="project-essay">
      <p><strong>Problem:</strong> ${escHtml(stripTags(w.problem))}</p>
      <p><strong>Approach:</strong> ${sanitizeHtml(w.approach)}</p>
      <p><strong>Outcome:</strong> ${escHtml(stripTags(w.outcome))}</p>
    </div>`}

  </article>

</body>
</html>
`;
}

// ─── Accordion Injector ───────────────────────────────────────────────────────
/**
 * Reads index.html, replaces everything between the marker comments with the
 * freshly-built accordion HTML, and writes the result to dist/index.html.
 *
 * Markers (add these once to your index.html, never touch again):
 *   <!-- BEGIN:PROJECTS -->
 *   <!-- END:PROJECTS -->
 */
function injectAccordion(accordionHtml) {
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

  // Indent the accordion content to match surrounding HTML (2 spaces)
  const indented = accordionHtml
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
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

  // 3. Accordion snippet + inject into index.html
  console.log("  Building accordion …");
  const accordionHtml = buildAccordion();
  const accordionPath = path.join(DIST, "accordion.html");
  fs.writeFileSync(accordionPath, accordionHtml);
  console.log(`  ✓ dist/accordion.html (reference copy)`);

  process.stdout.write("  Injecting accordion into index.html … ");
  const injected = injectAccordion(accordionHtml);
  if (injected) console.log(`✓ dist/index.html`);

  // 4. Project pages
  console.log("  Building project pages …");
  for (const proj of profile.projects) {
    const pagePath = path.join(PAGES_DIR, `${proj.id}.html`);
    fs.writeFileSync(pagePath, buildProjectPage(proj));
    console.log(`  ✓ ${pagePath}`);
  }

  // 5. Summary
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
