import { PAGE } from '../scene/Notebook.js';

/*
 * The notebook as a real book.
 *
 * All the content lives in one long flowing <article id="book-source">. CSS columns cut that
 * flow into page-sized columns (the browser does the line breaking), and each page you see is
 * a window onto one column. Every size here is in "design pixels": one page is 500 wide, the
 * same units as the 3D ruled lines, and NotebookUI scales the whole thing onto the 3D pages.
 *
 * Turning pages: a "leaf" (front = this page, back = the next) rotates over the spine in CSS 3D.
 * Jumping to a far page riffles through quick blank-ish leaves and lands on the real one.
 */
export const LINE = 36; // ruled line spacing (Notebook.js LINE_UNITS)
export const PAGE_W = 500;
export const PAGE_H = (PAGE_W * 2 * PAGE.halfD) / PAGE.x1;
const TEXT_TOP = 2 * LINE; // first text row sits on the 2nd ruled line
const ROWS = Math.floor((PAGE_H - TEXT_TOP - LINE) / LINE); // text rows per page
const TEXT_H = ROWS * LINE;
const PAD_L = 54;
const PAD_R = 30;
const TEXT_W = PAGE_W - PAD_L - PAD_R;
const MAX_IMG_ROWS = 10;

const TURN_MS = 560; // one page turn
const RIFFLE_LEAF_MS = 380; // each leaf in a fast-forward
const RIFFLE_MAX_LEAVES = 12;
const STEPS = 14; // the turn is drawn in 14 frames: a slightly stepped, hand-animated feel
const STRIPS = 10; // segments across a turning page: more = smoother curve
const STRIP_W = PAGE_W / STRIPS;
const CURL_DEG = 50; // how far the free edge trails behind mid-turn (keep under ~55 or it dips into the page)

const css = document.documentElement.style;
css.setProperty('--page-w', `${PAGE_W}px`);
css.setProperty('--page-h', `${PAGE_H}px`);
css.setProperty('--line', `${LINE}px`);
css.setProperty('--text-top', `${TEXT_TOP}px`);
css.setProperty('--text-h', `${TEXT_H}px`);
css.setProperty('--text-w', `${TEXT_W}px`);
css.setProperty('--pad-l', `${PAD_L}px`);

// Scribbled pages for the riffle: ruled paper with lines of "writing" too fast to read
function ghostPage(seed) {
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const rules = [];
  for (let y = LINE; y < PAGE_H; y += LINE) rules.push(`<rect x="0" y="${y - 2}" width="${PAGE_W}" height="2" fill="#bcc8e0"/>`);
  const ink = [];
  for (let row = 0; row < ROWS; row++) {
    if (rand() < 0.14) continue; // paragraph gap
    const y = TEXT_TOP + row * LINE + 14;
    const w = row % 5 === 4 ? TEXT_W * (0.3 + rand() * 0.4) : TEXT_W * (0.82 + rand() * 0.18);
    ink.push(`<rect x="${PAD_L}" y="${y}" width="${w.toFixed(0)}" height="8" fill="#52618a" opacity="0.35"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H.toFixed(0)}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#eef1f7"/>${rules.join('')}<rect x="36" y="0" width="2" height="100%" fill="#c8424f"/>${ink.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
for (let i = 0; i < 3; i++) css.setProperty(`--ghost-${i}`, ghostPage(i + 1));

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Book {
  constructor(root, source, { reducedMotion = false } = {}) {
    this.root = root;
    this.source = source;
    this.spread = root.querySelector('.spread');
    this.bookmarks = [...root.querySelectorAll('.bookmark')];
    this.reducedMotion = reducedMotion;
    this.sourceHTML = source.innerHTML;
    source.setAttribute('aria-hidden', 'true');
    source.inert = true;

    this.portrait = false;
    this.start = 0; // first visible column
    this.target = 0;
    this.animating = false;
    this.interactive = false;
    this.leaves = [];
    this.lastFlip = 0;

    this.build();
    // Page breaks depend on the font: lay out again once the web fonts have arrived
    document.fonts?.ready.then(() => this.build());
    this.bindInput();
  }

  get perView() { return this.portrait ? 1 : 2; }
  get lastStart() {
    const last = Math.max(0, this.count - 1);
    return this.portrait ? last : last - (last % 2);
  }
  align(col) {
    col = Math.max(0, Math.min(col, this.count - 1));
    return this.portrait ? col : col - (col % 2);
  }

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------
  build() {
    const src = this.source;
    const keepId = this.currentAnchor();
    src.innerHTML = this.sourceHTML;

    // 1. Sizes that must land on the ruled lines, measured as a single column
    src.classList.add('is-measuring');
    for (const img of src.querySelectorAll('img.figure')) {
      const w = +img.getAttribute('width') || 4;
      const h = +img.getAttribute('height') || 3;
      const rows = Math.max(2, Math.min(MAX_IMG_ROWS, Math.round((TEXT_W * h) / w / LINE)));
      img.style.height = `${rows * LINE}px`;
      img.style.width = `${Math.min(TEXT_W, (rows * LINE * w) / h)}px`;
    }
    for (const pre of src.querySelectorAll('pre')) {
      // code uses half-line spacing: pad odd blocks by half a line so what follows is back on the grid
      const halves = Math.round(pre.offsetHeight / (LINE / 2));
      if (halves % 2) pre.style.paddingBottom = `${parseFloat(getComputedStyle(pre).paddingBottom) + LINE / 2}px`;
    }
    src.classList.remove('is-measuring');

    // 2. Every chapter starts on a fresh page
    const origin = () => src.getBoundingClientRect();
    const chapters = [...src.querySelectorAll('.chapter')];
    for (const ch of chapters.slice(1)) {
      const first = ch.firstElementChild || ch;
      const o = origin();
      const y = first.getBoundingClientRect().top - o.top;
      if (y > 1) {
        const spacer = document.createElement('div');
        spacer.className = 'page-spacer';
        spacer.style.height = `${TEXT_H - y}px`;
        ch.before(spacer);
      }
    }

    // 3. Where everything landed
    const o = origin();
    const colOf = (el) => Math.max(0, Math.floor((el.getBoundingClientRect().left - o.left + 1) / PAGE_W));
    this.anchors = new Map();
    for (const el of src.querySelectorAll('[id]')) {
      this.anchors.set(el.id, colOf(el.classList.contains('chapter') ? el.firstElementChild || el : el));
    }
    const all = src.querySelectorAll('*');
    this.count = colOf(all[all.length - 1]) + 1;
    this.chapterStarts = chapters.map((ch) => ({
      col: this.anchors.get(ch.id), title: ch.dataset.title || '', id: ch.id,
    }));
    for (const span of src.querySelectorAll('[data-page-of]')) {
      const col = this.anchors.get(span.dataset.pageOf);
      span.textContent = col === undefined ? '' : String(col + 1);
    }

    // 4. Each page gets its own small snippet: just the blocks that reach onto it, preceded by a
    //    spacer that puts the first one exactly where it sat in the full flow. Re-laid out on its
    //    own, the snippet breaks into columns the same way, so page c is its column (c - base).
    this.snippets = this.cutSnippets(o);

    this.makeViews();
    const col = keepId ? this.anchors.get(keepId) ?? 0 : 0;
    this.start = this.target = this.align(col);
    this.showBase();
  }

  cutSnippets(o) {
    const src = this.source;
    const colAt = (x) => Math.max(0, Math.floor((x - o.left + 1) / PAGE_W));
    // Blocks in reading order: children of chapters, plus the spacers between chapters
    const blocks = [];
    for (const child of src.children) {
      const parent = child.classList.contains('chapter') ? child : null;
      for (const el of parent ? parent.children : [child]) {
        const rects = el.getClientRects(); // one rect per column the block reaches
        if (!rects.length) continue;
        const first = rects[0];
        const last = rects[rects.length - 1];
        blocks.push({
          el, parent,
          startCol: colAt(first.left),
          endCol: colAt(last.left),
          y: first.top - o.top,
        });
      }
    }
    const clean = (el) => {
      const c = el.cloneNode(true);
      c.removeAttribute('id');
      for (const d of c.querySelectorAll('[id]')) d.removeAttribute('id');
      return c.outerHTML;
    };
    const html = blocks.map((b) => clean(b.el));
    const shell = (parent) => `<section class="${parent.className}">`;

    const snippets = [];
    let i0 = 0;
    for (let c = 0; c < this.count; c++) {
      while (i0 < blocks.length && blocks[i0].endCol < c) i0++;
      if (i0 >= blocks.length) break;
      let i1 = i0;
      while (i1 + 1 < blocks.length && blocks[i1 + 1].startCol <= c) i1++;
      i1 = Math.min(blocks.length - 1, i1 + 3); // a few blocks past the page: "keep heading with next" decides the same way
      const first = blocks[i0];
      let out = first.y > 0.5 ? `<div class="page-spacer" style="height:${first.y.toFixed(2)}px"></div>` : '';
      let open = null;
      for (let i = i0; i <= i1; i++) {
        const b = blocks[i];
        if (b.parent !== open) {
          if (open) out += '</section>';
          if (b.parent) out += shell(b.parent);
          open = b.parent;
        }
        out += html[i];
      }
      if (open) out += '</section>';
      snippets[c] = { base: first.startCol, html: out };
    }
    return snippets;
  }

  /** The chapter on screen, so a re-layout (fonts, rotation) keeps your place */
  currentAnchor() {
    if (!this.chapterStarts) return null;
    let id = null;
    for (const c of this.chapterStarts) if (c.col <= this.start) id = c.id;
    return id;
  }

  chapterAt(col) {
    let found = null;
    for (const c of this.chapterStarts) if (c.col <= col) found = c;
    return found;
  }

  // ---------------------------------------------------------------------------
  // Page views
  // ---------------------------------------------------------------------------
  makeViews() {
    this.cancelLeaves();
    this.spread.querySelectorAll('.pv').forEach((el) => el.remove());
    this.left = this.makePage();
    this.right = this.makePage();
    this.left.el.classList.add('pv--left');
    this.right.el.classList.add('pv--right');
    this.spread.append(this.left.el, this.right.el);
    // Two reusable leaves with real content (the first and last of a riffle)
    this.realLeaves = [this.makeLeaf(true), this.makeLeaf(true)];
  }

  makePage(real = true) {
    const el = document.createElement('div');
    el.className = real ? 'pv' : 'pv pv--ghost';
    el.innerHTML = '<div class="pv__head"></div><div class="pv__body"></div><div class="pv__foot"><span class="pv__num"></span></div><div class="pv__shade"></div>';
    const page = {
      el,
      head: el.querySelector('.pv__head'),
      num: el.querySelector('.pv__num'),
      shade: el.querySelector('.pv__shade'),
      flow: null,
    };
    if (real) {
      page.flow = document.createElement('div');
      page.flow.className = 'book-flow';
      el.querySelector('.pv__body').append(page.flow);
    }
    return page;
  }

  /** Point a page view at column `col` (out of range = blank paper) */
  setPage(page, col, side) {
    const { el } = page;
    el.classList.toggle('pv--left', side === 'left');
    el.classList.toggle('pv--right', side === 'right');
    const blank = col < 0 || col >= this.count;
    el.classList.toggle('is-blank', blank);
    if (page.flow && page.col !== col) {
      const snip = blank ? null : this.snippets[col];
      page.flow.innerHTML = snip ? snip.html : '';
      page.flow.style.transform = snip ? `translateX(${-(col - snip.base) * PAGE_W}px)` : '';
    }
    page.col = col;
    page.num.textContent = blank ? '' : String(col + 1);
    const ch = blank ? null : this.chapterAt(col);
    // Running head: the chapter's name, except on its first page
    page.head.textContent = ch && ch.col !== col ? ch.title : '';
  }

  showBase() {
    if (this.portrait) {
      this.left.el.hidden = true;
      this.setPage(this.right, this.start, 'right');
    } else {
      this.left.el.hidden = false;
      this.setPage(this.left, this.start, 'left');
      this.setPage(this.right, this.start + 1, 'right');
    }
    this.updateChrome();
  }

  updateChrome() {
    const visibleEnd = this.target + this.perView - 1;
    // Bookmark of the section you're in
    let active = null;
    for (const b of this.bookmarks) {
      const col = this.anchors.get(b.hash.slice(1));
      if (col !== undefined && col <= visibleEnd) active = b;
    }
    for (const b of this.bookmarks) b.classList.toggle('is-active', b === active);
    this.root.classList.toggle('at-start', this.target === 0);
    this.root.classList.toggle('at-end', this.target >= this.lastStart);
    // Visible pages are the readable ones; the copies on leaves are decoration
    this.left.el.setAttribute('aria-hidden', String(this.portrait));
  }

  // ---------------------------------------------------------------------------
  // Turning
  // ---------------------------------------------------------------------------
  next() { this.goTo(this.target + this.perView); }
  prev() { this.goTo(this.target - this.perView); }

  goToId(id) {
    const col = this.anchors.get(id);
    if (col !== undefined) this.goTo(col);
  }

  goTo(col) {
    this.target = Math.max(0, Math.min(this.align(col), this.lastStart));
    this.updateChrome();
    if (!this.animating) this.run();
  }

  async run() {
    this.animating = true;
    while (this.start !== this.target) {
      const to = this.target;
      await this.turn(this.start, to);
      this.start = to;
    }
    this.animating = false;
    this.updateChrome();
  }

  /*
   * A leaf is a chain of STRIPS vertical strips, each hinged on the previous one, so the page
   * can bend as it turns. Every strip has a front and a back face showing its slice of the page.
   */
  makeLeaf(real) {
    const el = document.createElement('div');
    el.className = 'leaf';
    const front = [];
    const back = [];
    const strips = [];
    let parent = el;
    for (let i = 0; i < STRIPS; i++) {
      const strip = document.createElement('div');
      strip.className = 'leaf__strip';
      strip.style.left = i === 0 ? '0px' : `${STRIP_W}px`;
      const ff = document.createElement('div');
      ff.className = 'leaf__face';
      const fp = this.makePage(real);
      fp.el.style.left = `${-i * STRIP_W}px`;
      ff.append(fp.el);
      // The back face is turned over, so it shows the mirror-image slice of the back page
      const bf = document.createElement('div');
      bf.className = 'leaf__face leaf__face--back';
      const bp = this.makePage(real);
      bp.el.style.left = `${-(PAGE_W - (i + 1) * STRIP_W)}px`;
      bf.append(bp.el);
      strip.append(ff, bf);
      parent.append(strip);
      parent = strip;
      front.push(fp);
      back.push(bp);
      strips.push({ el: strip, shades: [fp.shade, bp.shade] });
    }
    return { el, front, back, strips, real };
  }

  ghostLeaf() {
    const leaf = this.makeLeaf(false);
    // A few different scribble patterns so the riffle doesn't look like one repeated sheet
    const f = String(Math.floor(Math.random() * 3));
    const b = String(Math.floor(Math.random() * 3));
    leaf.front.forEach((p) => { p.el.dataset.ghost = f; p.el.classList.add('pv--right'); });
    leaf.back.forEach((p) => { p.el.dataset.ghost = b; p.el.classList.add('pv--left'); });
    return leaf;
  }

  /** Show column `col` on every strip of one side of a leaf (-1 = scribbles flicking past) */
  setFace(pages, col, side) {
    for (const p of pages) {
      this.setPage(p, col, side);
      p.el.classList.toggle('is-ghosted', col < 0);
    }
  }

  /** Animate from spread `from` to spread `to`; resolves when the pages have landed */
  turn(from, to) {
    const dir = Math.sign(to - from);
    const turns = Math.abs(to - from) / this.perView;
    const n = Math.min(turns, RIFFLE_MAX_LEAVES);
    const landscape = !this.portrait;

    if (this.reducedMotion) {
      this.start = to;
      this.showBase();
      return Promise.resolve();
    }

    // Which real pages sit underneath during the turn
    if (dir > 0) this.setPage(this.right, to + (landscape ? 1 : 0), 'right');
    else if (landscape) this.setPage(this.left, to, 'left');

    // Build the leaves. Forward: front = the page lifting off the right, back = what lands on the left.
    const leaves = [];
    for (let i = 0; i < n; i++) {
      const first = i === 0;
      const last = i === n - 1;
      const leaf = first || last ? this.realLeaves[first ? 0 : 1] : this.ghostLeaf();
      if (leaf.real) {
        if (dir > 0) {
          this.setFace(leaf.front, first ? from + (landscape ? 1 : 0) : -1, 'right');
          this.setFace(leaf.back, last && landscape ? to : -1, 'left');
        } else {
          // backward: back shows the current left page, front the page arriving on the right
          this.setFace(leaf.back, first && landscape ? from : -1, 'left');
          this.setFace(leaf.front, last ? to + (landscape ? 1 : 0) : -1, 'right');
        }
      }
      leaf.index = i;
      leaves.push(leaf);
      this.spread.append(leaf.el);
    }
    this.leaves = leaves;

    // Timing: one turn, or a riffle that speeds up in the middle and settles at the end
    const span = n > 1 ? Math.min(1300, 110 * (n - 1)) : 0;
    const dur = n > 1 ? RIFFLE_LEAF_MS : TURN_MS;
    leaves.forEach((leaf, i) => {
      leaf.delay = n > 1 ? span * easeInOut(i / (n - 1)) : 0;
    });
    const t0 = performance.now();
    const total = span + dur;

    return new Promise((resolve) => {
      this.finishTurn = () => {
        for (const leaf of leaves) leaf.el.remove();
        this.leaves = [];
        this.finishTurn = null;
        this.start = to;
        this.showBase();
        this.lastFlip = performance.now();
        resolve();
      };
      const frame = (now) => {
        if (!this.finishTurn) return; // cancelled (re-layout)
        const elapsed = now - t0;
        for (const leaf of leaves) {
          let p = Math.max(0, Math.min(1, (elapsed - leaf.delay) / dur));
          p = Math.floor(p * STEPS) / STEPS; // stepped
          this.poseLeaf(leaf, dir > 0 ? easeInOut(p) : 1 - easeInOut(p), n, dir);
        }
        if (elapsed >= total) this.finishTurn();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  /**
   * a: 0 = flat on the right page, 1 = flat on the left page.
   * The spine end leads and the free edge trails behind, more so mid-turn: that's the curl.
   */
  poseLeaf(leaf, a, n, dir) {
    const curl = CURL_DEG * Math.sin(Math.PI * a) * dir;
    let prev = 0;
    for (let i = 0; i < STRIPS; i++) {
      const t = (i + 0.5) / STRIPS;
      const angle = 180 * a - curl * t * t; // this strip's angle off the right page
      leaf.strips[i].el.style.transform = `rotateY(${(prev - angle).toFixed(2)}deg)`;
      prev = angle;
      // Light from above: each strip darkens as it stands up, in hard steps
      const shade = (Math.round(Math.sin((angle * Math.PI) / 180) * 3) * 0.1).toFixed(2);
      for (const s of leaf.strips[i].shades) s.style.opacity = shade;
    }
    // Stacking: on each side, the leaf that moves first is the one on top of the pile
    const onLeft = a > 0.5;
    const i = dir > 0 ? leaf.index : n - 1 - leaf.index;
    leaf.el.style.zIndex = String(onLeft ? 10 + i : 10 + n - i);
  }

  cancelLeaves() {
    if (this.finishTurn) this.finishTurn();
    this.leaves.forEach((l) => l.el.remove());
    this.leaves = [];
  }

  // ---------------------------------------------------------------------------
  // Layout + input
  // ---------------------------------------------------------------------------
  setPortrait(portrait) {
    if (portrait === this.portrait) return;
    this.cancelLeaves();
    this.portrait = portrait;
    this.root.classList.toggle('is-portrait', portrait);
    this.start = this.target = this.align(this.start);
    this.animating = false;
    this.showBase();
  }

  setInteractive(on) {
    if (on && !this.interactive) this.becameInteractive = performance.now();
    this.interactive = on;
  }

  bindInput() {
    const { root } = this;

    // Links to #ids turn to that page (riffling if it's far)
    root.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (a) {
        e.preventDefault();
        this.goToId(a.getAttribute('href').slice(1));
        return;
      }
      const turn = e.target.closest('[data-turn]');
      if (turn) turn.dataset.turn === 'next' ? this.next() : this.prev();
    });

    // Wheel over the book turns pages. On the first spread, scrolling up falls through to the
    // page scroll, which closes the book.
    let acc = 0;
    let lastWheel = 0;
    root.addEventListener('wheel', (e) => {
      if (!this.interactive) return;
      const now = performance.now();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const settling = now - (this.becameInteractive || 0) < 600; // still the scroll that opened the book
      const justTurned = now - this.lastFlip < 500;
      if (dy < 0 && this.target === 0 && !this.animating && !justTurned && !settling) return;
      e.preventDefault();
      e.stopPropagation();
      if (settling) return;
      if (now - lastWheel > 250 || Math.sign(dy) !== Math.sign(acc)) acc = 0;
      lastWheel = now;
      acc += dy;
      // One turn per notch/flick; holding the scroll keeps turning, a page at a time
      if (Math.abs(acc) > 40 && now - (this.wheelTurn || 0) > 420) {
        this.wheelTurn = now;
        acc = 0;
        dy > 0 ? this.next() : this.prev();
      }
    }, { passive: false });

    addEventListener('keydown', (e) => {
      if (!this.interactive || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown' || (k === 'ArrowDown' && !this.portrait)) { e.preventDefault(); this.next(); }
      else if (k === 'ArrowLeft' || k === 'PageUp' || (k === 'ArrowUp' && this.target > 0 && !this.portrait)) { e.preventDefault(); this.prev(); }
      else if (k === 'Home') { e.preventDefault(); this.goTo(0); }
      else if (k === 'End') { e.preventDefault(); this.goTo(this.lastStart); }
    });

    // Swipe sideways to turn (vertical swipes still scroll, which closes the book)
    let down = null;
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') down = { x: e.clientX, y: e.clientY };
    });
    root.addEventListener('pointerup', (e) => {
      if (!down || !this.interactive) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) dx < 0 ? this.next() : this.prev();
    });
    root.addEventListener('pointercancel', () => { down = null; });
  }
}
