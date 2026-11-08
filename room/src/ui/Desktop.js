/**
 * "sid-os": the desktop shown on the monitor.
 *   Projects folder → one file per project → a window with the summary, links and full write-up
 *   Blog            → a little browser listing every post, opening each one in place
 *   readme.txt      → a hello
 * Content comes from the page: project entries in #project-data, posts in #posts-data
 * (rendered from content/posts/*.md at build time).
 */
const ICONS = {
  folder: '<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#b9862f" d="M1 3h5l1 1h8v10H1z"/><path fill="#f7c948" d="M1 6h14v8H1z"/><path fill="#ffe08a" d="M2 7h12v1H2z"/></svg>',
  blog: '<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#1e2742" d="M1 2h14v12H1z"/><path fill="#4fd2f0" d="M2 5h12v8H2z"/><path fill="#ef4b58" d="M2 3h2v1H2z"/><path fill="#f7c948" d="M5 3h2v1H5z"/><path fill="#6fdb6f" d="M8 3h2v1H8z"/><path fill="#eef1f7" d="M3 7h8v1H3zM3 9h10v1H3zM3 11h6v1H3z"/></svg>',
  text: '<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#eef1f7" d="M3 1h7l3 3v11H3z"/><path fill="#93a3c6" d="M10 1v3h3"/><path fill="#52618a" d="M5 6h6v1H5zM5 8h6v1H5zM5 10h4v1H5z"/></svg>',
  file: '<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#eef1f7" d="M3 1h7l3 3v11H3z"/><path fill="#93a3c6" d="M10 1v3h3"/><path fill="#f7c948" d="M5 6h6v4H5z"/><path fill="#52618a" d="M5 11h6v1H5z"/></svg>',
};

const W = 960;
const H = 544;
const BAR = 30; // taskbar height

export class Desktop {
  constructor(root) {
    this.root = root;
    this.windows = new Map();
    this.z = 10;
    this.scale = 1; // design px → screen px (kept up to date by main.js)
    this.posts = new Map(
      [...document.querySelectorAll('#posts-data > article')].map((a) => [a.dataset.post, {
        id: a.dataset.post, title: a.dataset.title, date: a.dataset.date, url: a.dataset.url, html: a.innerHTML,
      }]),
    );
    this.projects = [...document.querySelectorAll('#project-data > li')].map((li) => ({
      id: li.dataset.id, title: li.dataset.title, file: li.dataset.file, post: li.dataset.post,
      code: li.dataset.code, codeLabel: li.dataset.codeLabel || 'code', summary: li.innerHTML,
    }));

    root.innerHTML = `
      <div class="os-icons">
        <button class="os-icon" data-open="projects">${ICONS.folder}<span>Projects</span></button>
        <button class="os-icon" data-open="blog">${ICONS.blog}<span>Blog</span></button>
        <button class="os-icon" data-open="readme">${ICONS.text}<span>readme.txt</span></button>
      </div>
      <div class="os-windows"></div>
      <footer class="os-bar">
        <span class="os-start">◆ sid-os</span>
        <span class="os-tasks"></span>
        <span class="os-clock"></span>
      </footer>`;
    this.layer = root.querySelector('.os-windows');
    this.tasks = root.querySelector('.os-tasks');
    this.clock = root.querySelector('.os-clock');
    root.addEventListener('click', (e) => {
      const open = e.target.closest('[data-open]');
      if (open) this.open(open.dataset.open, open.dataset.arg);
    });
    this.tick();
    setInterval(() => this.tick(), 20000);
  }

  tick() {
    this.clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /** First visit: open the Projects folder so the screen isn't empty */
  onShow() {
    if (!this.shown) {
      this.shown = true;
      this.open('projects');
    }
  }

  open(kind, arg) {
    if (kind === 'projects') {
      this.window('projects', 'Projects', ICONS.folder, () => {
        const grid = document.createElement('div');
        grid.className = 'os-folder';
        grid.innerHTML = this.projects.map((p) => `
          <button class="os-file" data-open="project" data-arg="${p.id}">${ICONS.file}<span>${p.file}</span></button>`).join('');
        return grid;
      }, { x: 150, y: 36, w: 470, h: 250 });
    } else if (kind === 'project') {
      const p = this.projects.find((x) => x.id === arg);
      if (!p) return;
      const post = this.posts.get(p.post);
      this.window(`project-${p.id}`, p.file, ICONS.file, () => {
        const doc = document.createElement('div');
        doc.className = 'os-doc';
        const links = [
          p.code ? `<a href="${p.code}" target="_blank" rel="noopener">${p.codeLabel} ↗</a>` : '',
        ].filter(Boolean).join(' · ');
        doc.innerHTML = `
          <h1>${p.title}</h1>
          <div class="os-doc__summary">${p.summary}</div>
          <p class="os-doc__links">${links}</p>
          ${post ? `<hr><p class="os-doc__meta">write-up · ${post.date}</p><article class="os-post">${post.html}</article>` : ''}`;
        return doc;
      }, { x: 230 + (this.windows.size % 3) * 24, y: 20 + (this.windows.size % 3) * 18, w: 620, h: 470, read: post?.url });
    } else if (kind === 'blog') {
      this.window('blog', 'Blog — sid-38.github.io', ICONS.blog, () => this.browser(), { x: 170, y: 24, w: 680, h: 470 });
    } else if (kind === 'readme') {
      this.window('readme', 'readme.txt', ICONS.text, () => {
        const t = document.createElement('div');
        t.className = 'os-text';
        t.innerHTML = `<p>hi, I'm Sidharth.</p>
          <p><b>Projects</b> has the things I've built, each with its write-up.<br><b>Blog</b> has everything I've written.</p>
          <p>Esc or "back to the room" to look around.</p>`;
        return t;
      }, { x: 560, y: 300, w: 360, h: 180 });
    }
  }

  /** The blog app: a list of posts, each opening in place */
  browser() {
    const el = document.createElement('div');
    el.className = 'os-browser';
    el.innerHTML = `
      <div class="os-browser__bar"><button class="os-browser__back" type="button" aria-label="Back to all posts">←</button><span class="os-browser__url"></span></div>
      <div class="os-browser__page"></div>`;
    const page = el.querySelector('.os-browser__page');
    const url = el.querySelector('.os-browser__url');
    const back = el.querySelector('.os-browser__back');
    const showList = () => {
      url.textContent = 'sid-38.github.io';
      back.disabled = true;
      this.setRead('blog', null);
      page.innerHTML = `<h1>Sidharth's blog</h1><ul class="os-postlist">${[...this.posts.values()].map((p) => `
        <li><button type="button" data-post="${p.id}"><span>${p.title}</span><span class="os-date">${p.date}</span></button></li>`).join('')}</ul>`;
      page.scrollTop = 0;
    };
    const showPost = (id) => {
      const p = this.posts.get(id);
      url.textContent = p.url.replace('https://', '');
      back.disabled = false;
      this.setRead('blog', p.url);
      page.innerHTML = `<h1>${p.title}</h1><p class="os-doc__meta">${p.date}</p><article class="os-post">${p.html}</article>`;
      page.scrollTop = 0;
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-post]');
      if (b) showPost(b.dataset.post);
      else if (e.target.closest('.os-browser__back')) showList();
    });
    showList();
    return el;
  }

  /**
   * A window. `read`: the article's page on the plain site, linked from the title bar
   * ("un-pixelate") so it can be read in proper fonts in a new tab.
   */
  window(id, title, icon, build, { x, y, w, h, read = null }) {
    let win = this.windows.get(id);
    if (!win) {
      const el = document.createElement('section');
      el.className = 'os-win';
      el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${Math.min(h, H - BAR - y - 4)}px`;
      el.innerHTML = `
        <header class="os-win__bar"><span class="os-win__icon">${icon}</span><span class="os-win__title"></span>
          <a class="os-win__read" target="_blank" rel="noopener" hidden title="Read this in a new tab, in normal fonts">un-pixelate <span aria-hidden="true">↗</span></a>
          <button class="os-win__btn" type="button" aria-label="Close">×</button></header>
        <div class="os-win__body"></div>`;
      el.querySelector('.os-win__title').textContent = title;
      el.querySelector('.os-win__body').append(build());
      const task = document.createElement('button');
      task.className = 'os-task';
      task.type = 'button';
      task.innerHTML = `${icon}<span></span>`;
      task.querySelector('span').textContent = title;
      win = { el, task };
      this.windows.set(id, win);
      this.setRead(id, read);
      this.layer.append(el);
      this.tasks.append(task);
      el.querySelector('.os-win__btn').addEventListener('click', () => this.close(id));
      el.addEventListener('pointerdown', () => this.raise(id));
      task.addEventListener('click', () => this.raise(id));
      this.makeDraggable(el);
    }
    this.raise(id);
  }

  /** Show the title bar's "un-pixelate" link for this url, or hide it (null) */
  setRead(id, url) {
    const link = this.windows.get(id)?.el.querySelector('.os-win__read');
    if (!link) return;
    link.hidden = !url;
    if (url) link.href = url;
  }

  raise(id) {
    const win = this.windows.get(id);
    if (!win) return;
    win.el.style.zIndex = String(++this.z);
    for (const [k, w] of this.windows) {
      w.el.classList.toggle('is-active', k === id);
      w.task.classList.toggle('is-active', k === id);
    }
  }

  close(id) {
    const win = this.windows.get(id);
    if (!win) return;
    win.el.remove();
    win.task.remove();
    this.windows.delete(id);
  }

  makeDraggable(el) {
    const bar = el.querySelector('.os-win__bar');
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, a') || this.root.classList.contains('is-compact')) return;
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop };
      const move = (ev) => {
        const dx = (ev.clientX - start.x) / this.scale;
        const dy = (ev.clientY - start.y) / this.scale;
        el.style.left = `${Math.max(-el.offsetWidth + 60, Math.min(W - 60, start.left + dx))}px`;
        el.style.top = `${Math.max(0, Math.min(H - BAR - 24, start.top + dy))}px`;
      };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
  }
}

export const DESKTOP_SIZE = { W, H };
