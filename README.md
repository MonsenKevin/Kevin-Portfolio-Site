# My Portfolio Site

This is the source for my personal portfolio at [kevinmonsen.com](https://kevinmonsen.com). I built it from scratch with plain HTML, CSS, and JavaScript. No frameworks, no build tools, just code I wrote myself.

## What's on the site

The site is organized around three things I care about: leadership, engineering, and problem solving. Each section covers real experiences. This includes running multi-lodge scouting events and lifeguard teams, to building networks, doing incident response, and shipping software. There's also a projects section with dedicated write-ups for each project I've worked on.

## Pages

| File | Description |
|---|---|
| `index.html` | Main page — leader, engineer, problem solver, projects |
| `resume.html` | My resume |
| `tracer.html` | Tracer FIRE cybersecurity incident response (Sandia National Labs) |
| `network.html` | Home network infrastructure upgrade |
| `fse.html` | AI vision assistance device (Raspberry Pi + Gemini API) |
| `gpu.html` | GPU thermal optimization |
| `site.html` | This portfolio site, as a project write-up |
| `ohlone.html` | Lodge WordPress site I built and maintained |
| `stm.html` | Scottsdale Technology Management design exercise |
| `essay.html` | AI essay feedback tool built at a hackathon |
| `email.html` | Email infrastructure migration |
| `pc.html` | Custom PC build |

## How it's built

- Plain **HTML, CSS, and JavaScript** — I didn't want to add complexity where it wasn't needed
- Hosted on **GitHub Pages** with a custom domain via **NameCheap**
- Uses **Jekyll** only for the sitemap plugin — every page is static HTML

## Structure

```
/
├── index.html          # Main page
├── style.css           # All styles
├── main.js             # Accordion, nav indicator, and other interactions
├── images/             # Photos, diagrams, and my resume PDF
├── *.html              # Project detail pages
├── _config.yml         # Jekyll/GitHub Pages config
├── sitemap.xml
├── robots.txt
└── CNAME               # kevinmonsen.com
```

## Running locally

No build step needed. Just open a file in your browser or spin up a quick local server:

```bash
npx serve .
```

## Deployment

Pushing to main deploys automatically through GitHub Pages. Domain is wired up via `CNAME` and Cloudflare DNS.
