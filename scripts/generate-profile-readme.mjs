import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "featured.json");
const readmePath = path.join(root, "profile", "README.md");
const token = process.env.ORG_READ_TOKEN || process.env.GITHUB_TOKEN;
const badgeColor = "003087";
const startMark = "<!-- FEATURED:START -->";
const endMark = "<!-- FEATURED:END -->";

if (!token) {
  console.error("Defina ORG_READ_TOKEN ou GITHUB_TOKEN.");
  process.exit(1);
}

function github(apiPath) {
  const forceIp = process.env.GITHUB_API_IP;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: forceIp || "api.github.com",
        servername: "api.github.com",
        path: apiPath,
        method: "GET",
        headers: {
          Host: "api.github.com",
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "egov-profile-readme",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 204) {
            resolve({ body: [], link: "" });
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub ${res.statusCode} em ${apiPath}: ${raw.slice(0, 280)}`));
            return;
          }
          resolve({
            body: raw ? JSON.parse(raw) : [],
            link: res.headers.link || "",
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function nextPath(link) {
  const part = link.split(",").find((item) => item.includes('rel="next"'));
  if (!part) return "";
  const url = part.match(/<([^>]+)>/)?.[1];
  if (!url) return "";
  return url.replace("https://api.github.com", "");
}

async function contributorsForRepo(repo) {
  const people = new Map();
  let apiPath = `/repos/EGOV-DEVS/${encodeURIComponent(repo)}/contributors?per_page=100`;
  while (apiPath) {
    const { body, link } = await github(apiPath);
    const list = Array.isArray(body) ? body : [];
    for (const person of list) {
      if (!person.login) continue;
      const previous = people.get(person.login);
      people.set(person.login, {
        login: person.login,
        contributions: (previous?.contributions || 0) + (person.contributions || 0),
      });
    }
    apiPath = nextPath(link);
  }
  return people;
}

async function contributorsForProject(repos) {
  const people = new Map();
  for (const repo of repos) {
    const batch = await contributorsForRepo(repo);
    for (const person of batch.values()) {
      const previous = people.get(person.login);
      people.set(person.login, {
        login: person.login,
        contributions: (previous?.contributions || 0) + person.contributions,
      });
    }
  }
  return [...people.values()].sort(
    (a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login),
  );
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shield(label, color) {
  return `https://img.shields.io/badge/${encodeURIComponent(label)}-${color}?style=for-the-badge`;
}

function tabBar(group) {
  const links = group.projects
    .map((project) => {
      const label = project.badgeLabel || project.title;
      const src = shield(label, badgeColor);
      return `<a href="#${project.id}"><img alt="${esc(project.title)}" src="${src}"></a>`;
    })
    .join("\n  ");
  return `<p align="center"><b>${esc(group.label)}</b></p>\n\n<p align="center">\n  ${links}\n</p>`;
}

function avatars(people) {
  if (people.length === 0) {
    return "<p>Nenhum contribuidor listado pela API.</p>";
  }
  const images = people
    .map((person) => {
      const login = esc(person.login);
      return `<a href="https://github.com/${login}"><img src="https://github.com/${login}.png?size=80" width="40" height="40" alt="${login}" title="${login}"></a>`;
    })
    .join("\n");
  return `<p>\n${images}\n</p>`;
}

function card(project, people) {
  const lines = [
    `<a id="${project.id}"></a>`,
    "",
    `### ${project.title}`,
    "",
    project.blurb,
    "",
  ];
  const meta = [];
  if (project.stack) meta.push(`\`${project.stack}\``);
  if (project.badge) {
    const src = `https://img.shields.io/badge/${encodeURIComponent(project.badge)}-9A6B00?style=flat-square`;
    meta.push(`<img alt="${esc(project.badge)}" src="${src}">`);
  }
  if (meta.length > 0) {
    lines.push(meta.join(" · "), "");
  }
  if (project.note) {
    lines.push(project.note, "");
  }
  lines.push("**Contribuidores**", "", avatars(people), "");
  return lines.join("\n");
}

function render(config, peopleById) {
  const bars = config.groups.map((group) => tabBar(group)).join("\n\n");
  const cards = config.groups
    .flatMap((group) => group.projects)
    .map((project) => card(project, peopleById.get(project.id)))
    .join("\n");
  return ["## Projetos", "", bars, "", "---", "", cards].join("\n").trimEnd() + "\n";
}

function writeReadme(block) {
  const wrapped = `${startMark}\n${block}${endMark}\n`;
  if (!fs.existsSync(readmePath)) {
    throw new Error(`Arquivo ausente: ${readmePath}`);
  }
  const current = fs.readFileSync(readmePath, "utf8");
  const start = current.indexOf(startMark);
  const end = current.indexOf(endMark);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Marcadores FEATURED ausentes em profile/README.md.");
  }
  const next = current.slice(0, start) + wrapped + current.slice(end + endMark.length).replace(/^\n/, "\n");
  fs.writeFileSync(readmePath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const peopleById = new Map();
for (const group of config.groups) {
  for (const project of group.projects) {
    if (!project.repos?.length) {
      throw new Error(`Projeto sem repos: ${project.id}`);
    }
    peopleById.set(project.id, await contributorsForProject(project.repos));
    const names = peopleById.get(project.id).map((person) => person.login).join(", ");
    console.log(`${project.id}: ${names || "(nenhum)"}`);
  }
}

writeReadme(render(config, peopleById));
console.log("profile/README.md atualizado.");
