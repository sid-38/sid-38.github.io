import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';

/**
 * Turns the blog posts in content/posts/*.md (Jekyll format, copied from sid-38.github.io)
 * into HTML at build time. In index.html, <!-- book:posts --> becomes one
 * <article data-post="post-…"> per post, which the computer's Blog app and project windows read.
 * To add a post: drop the .md file into content/posts/ (newest first by filename date).
 */
const BLOG = 'https://sid-38.github.io';

export function bookContent({ dir = 'content/posts', publicDir = 'public' } = {}) {
  let root = process.cwd();
  return {
    name: 'book-content',
    configResolved(config) { root = config.root; },
    configureServer(server) {
      const abs = path.resolve(root, dir);
      server.watcher.add(abs);
      server.watcher.on('change', (file) => {
        if (file.startsWith(abs)) server.ws.send({ type: 'full-reload' });
      });
    },
    transformIndexHtml(html) {
      const posts = readPosts(path.resolve(root, dir), path.resolve(root, publicDir));
      return html.replace('<!-- book:posts -->', posts.map(article).join('\n'));
    },
  };
}

function readPosts(dir, publicDir) {
  return fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d\d-\d\d-.+\.md$/.test(f))
    .sort()
    .reverse()
    .map((file) => {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      const [, y, m, d, name] = file.match(/^(\d{4})-(\d\d)-(\d\d)-(.+)\.md$/);
      const { front, body } = frontMatter(src);
      return {
        id: `post-${name.toLowerCase()}`,
        title: front.title || name,
        date: new Date(Date.UTC(+y, +m - 1, +d)),
        url: `${BLOG}/${name}/`,
        html: renderMarkdown(jekyllToMarkdown(body), publicDir),
      };
    });
}

function frontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { front: {}, body: src };
  const front = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) front[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { front, body: src.slice(m[0].length) };
}

/** Liquid bits Jekyll would have handled → plain markdown */
function jekyllToMarkdown(body) {
  return body
    .replace(/\{%-?\s*(raw|endraw)\s*-?%\}\r?\n?/g, '')
    .replace(/\{%\s*highlight\s+(\w+)\s*%\}\r?\n?([\s\S]*?)\{%\s*endhighlight\s*%\}/g,
      (_, lang, code) => `\`\`\`${lang}\n${code.replace(/\s+$/, '')}\n\`\`\``)
    .replace(/<!--more-->/g, '');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderMarkdown(md, publicDir) {
  const marked = new Marked({
    gfm: true,
    renderer: {
      // Post titles are h2 on the page; headings inside a post sit below them
      heading({ tokens, depth }) {
        const tag = depth <= 2 ? 'h3' : 'h4';
        return `<${tag}>${this.parser.parseInline(tokens)}</${tag}>\n`;
      },
      link({ href, title, tokens }) {
        if (href.startsWith('/')) href = BLOG + href;
        const t = title ? ` title="${esc(title)}"` : '';
        return `<a href="${esc(href)}"${t} target="_blank" rel="noopener">${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, text }) {
        const size = imageSize(publicDir, href);
        const wh = size ? ` width="${size.w}" height="${size.h}"` : '';
        return `<img class="figure" src="${esc(href)}" alt="${esc(text)}"${wh} />`;
      },
      code({ text, lang }) {
        const l = lang ? ` data-lang="${esc(lang)}"` : '';
        return `<pre class="code"${l}><code>${esc(text)}</code></pre>\n`;
      },
    },
  });
  return marked.parse(md);
}

/** Pixel size of a PNG or JPEG in public/, so the layout knows image heights before they load */
function imageSize(publicDir, href) {
  try {
    const buf = fs.readFileSync(path.join(publicDir, href.replace(/^\//, '')));
    if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch { /* missing image: no size */ }
  return null;
}

const fmtDate = (d) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

function article(p) {
  return `<article data-post="${p.id}" data-title="${esc(p.title)}" data-date="${fmtDate(p.date)}" data-url="${p.url}">
${p.html}
</article>`;
}
