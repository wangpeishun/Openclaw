/* ================================================================
   OpenClaw Guide — 前端交互脚本 v2
   架构：数据驱动，所有动态内容从 data.json 读取后渲染
   更新流程：自动化任务 → 写入 data.json → 前端重新渲染
================================================================ */

// ================================================================
// 入口：加载数据后初始化全站
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await fetchData();
    initNavbar();
    initTabs();
    renderStats(data.stats);
    renderSkills(data.skills);
    renderNews(data.news);
    renderTimeline(data.timeline);
    renderTopRank(data.topSkillsRank);
    renderLastUpdated(data._meta.lastUpdated);
    initFilters(data.skills);
    initCounters();
    initCopyButtons();
    initScrollReveal();
    initHamburger();
    initActiveNavLink();
  } catch (err) {
    console.error('[OpenClaw Guide] 数据加载失败，使用内嵌备用数据', err);
    initWithFallback();
  }
});

// ================================================================
// 加载 data.json（带缓存破坏，确保每次拿到最新版本）
// ================================================================
async function fetchData() {
  const url = `./data.json?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ================================================================
// 渲染：统计数字（Hero 区域）
// ================================================================
function renderStats(stats) {
  const map = {
    githubStars: stats.githubStars,
    builtinSkills: stats.builtinSkills,
    latestBugFixes: stats.latestBugFixes,
    archLayers: stats.archLayers
  };
  document.querySelectorAll('.stat-num[data-key]').forEach(el => {
    const key = el.dataset.key;
    if (key in map) {
      el.dataset.target = map[key];
      el.textContent = '0';
    }
  });
}

// ================================================================
// 渲染：最新动态新闻卡片
// ================================================================
function renderNews(newsItems) {
  const container = document.getElementById('newsMain');
  if (!container) return;

  const typeClassMap = { hot: 'hot', report: '', ecosystem: 'ecosystem' };

  container.innerHTML = newsItems.map(item => {
    const highlightsHTML = item.highlights.length
      ? `<div class="news-highlights">
          ${item.highlights.map(h => `<div class="highlight-item">✅ ${h}</div>`).join('')}
         </div>`
      : '';

    return `
      <div class="news-card${item.featured ? ' featured' : ''} reveal">
        <div class="news-meta">
          <span class="news-tag ${typeClassMap[item.type] || ''}">${item.typeLabel}</span>
          <span class="news-date">${item.date}</span>
        </div>
        <h3 class="news-title">${item.title}</h3>
        <p class="news-content">${item.content}</p>
        ${highlightsHTML}
      </div>
    `;
  }).join('');
}

// ================================================================
// 渲染：版本时间线
// ================================================================
function renderTimeline(timeline) {
  const container = document.getElementById('timelineList');
  if (!container) return;

  container.innerHTML = timeline.map(item => `
    <div class="tl-item${item.active ? ' active' : ''}">
      <span class="tl-dot"></span>
      <div class="tl-content">
        <span class="tl-version">${item.version}</span>
        <span class="tl-date">${item.date}</span>
        <span class="tl-desc">${item.desc}</span>
      </div>
    </div>
  `).join('');
}

// ================================================================
// 渲染：技能下载量排行
// ================================================================
function renderTopRank(rankItems) {
  const container = document.getElementById('topRankList');
  if (!container) return;

  container.innerHTML = rankItems.map(item => `
    <div class="rank-item">
      <span class="rank-num">${item.rank}</span>
      <span class="rank-name">${item.name}</span>
      <span class="rank-stat">${item.stat}</span>
    </div>
  `).join('');
}

// ================================================================
// 渲染：最后更新时间 + 更新徽章
// ================================================================
function renderLastUpdated(isoTime) {
  const el = document.getElementById('lastUpdateTime');
  if (!el) return;

  const date = new Date(isoTime);
  el.textContent = date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  // 若数据在 48h 内更新过，显示"内容已更新"徽章
  const badge = document.getElementById('updateBadge');
  if (badge) {
    const age = Date.now() - date.getTime();
    badge.style.display = age < 48 * 3600 * 1000 ? 'flex' : 'none';
  }
}

// ================================================================
// 渲染：技能卡片网格
// ================================================================
function renderSkills(skills, filter = 'all') {
  const grid = document.getElementById('skillsGrid');
  if (!grid) return;

  const filtered = filter === 'all'
    ? skills
    : skills.filter(s => s.category === filter);

  grid.innerHTML = filtered.map(skill => `
    <div class="skill-card reveal" data-category="${skill.category}">
      <div class="skill-card-header">
        <span class="skill-emoji">${skill.emoji}</span>
        <span class="skill-rank">#${skill.rank}</span>
      </div>
      <div class="skill-name">${skill.name}</div>
      <div class="skill-desc">${skill.desc}</div>
      <code class="skill-install">${skill.install}</code>
      <div class="skill-meta">
        <span class="skill-category cat-${skill.category}">${skill.categoryLabel}</span>
        <span class="skill-downloads">↓ ${skill.downloads}</span>
      </div>
    </div>
  `).join('');

  // 入场动画
  requestAnimationFrame(() => {
    grid.querySelectorAll('.reveal').forEach((el, i) => {
      setTimeout(() => el.classList.add('visible'), i * 55);
    });
  });
}

// ================================================================
// 技能过滤器（需持有 skills 数组引用）
// ================================================================
function initFilters(skills) {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSkills(skills, btn.dataset.filter);
      // 渲染后重新注册 reveal 观察
      requestAnimationFrame(initScrollReveal);
    });
  });
}

// ================================================================
// 数字滚动计数器（读取 data-target 属性）
// ================================================================
function initCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.stat-num[data-target]').forEach(el => observer.observe(el));
}

function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  if (isNaN(target)) return;
  const duration = 1800;
  const start = performance.now();

  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.floor(eased * target);
    el.textContent = target >= 1000
      ? (val / 1000).toFixed(1) + 'W+'
      : val;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target >= 1000 ? (target / 1000).toFixed(1) + 'W+' : target;
  };
  requestAnimationFrame(tick);
}

// ================================================================
// 导航栏滚动
// ================================================================
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
}

// ================================================================
// 导航高亮（滚动联动）
// ================================================================
function initActiveNavLink() {
  const sections = document.querySelectorAll('section[id]');
  const links = document.querySelectorAll('.nav-link');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const a = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
        if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(s => observer.observe(s));
}

// ================================================================
// 标签页切换
// ================================================================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(`tab-${btn.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });
}

// ================================================================
// 滚动入场动画
// ================================================================
function initScrollReveal() {
  const selector = '.deploy-card, .step-card, .tip-item, .news-card, .security-card, .sidebar-widget, .commands-section';
  document.querySelectorAll(selector).forEach(el => el.classList.add('reveal'));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal:not(.visible)').forEach(el => observer.observe(el));
}

// ================================================================
// 复制代码
// ================================================================
function initCopyButtons() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const code = btn.dataset.code
      || btn.closest('.code-block')?.querySelector('pre code')?.textContent
      || '';
    if (!code.trim()) return;
    try {
      await navigator.clipboard.writeText(code.trim());
      btn.textContent = '✓ 已复制';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
    } catch {
      btn.textContent = '❌ 失败';
      setTimeout(() => { btn.textContent = '复制'; }, 2000);
    }
  });
}

// ================================================================
// 移动端汉堡菜单
// ================================================================
function initHamburger() {
  const btn = document.getElementById('hamburger');
  const links = document.querySelector('.nav-links');
  if (!btn || !links) return;

  let open = false;
  const apply = () => {
    if (open) {
      Object.assign(links.style, {
        display: 'flex', flexDirection: 'column',
        position: 'absolute', top: '68px', left: '0', right: '0',
        background: 'rgba(10,10,15,0.98)', backdropFilter: 'blur(16px)',
        padding: '16px 24px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        zIndex: '999'
      });
    } else {
      links.style.cssText = '';
    }
  };

  btn.addEventListener('click', () => { open = !open; apply(); });
  links.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', () => { open = false; apply(); }));
}

// ================================================================
// 平滑滚动
// ================================================================
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href === '#') return;
  const target = document.querySelector(href);
  if (target) {
    e.preventDefault();
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  }
});

// ================================================================
// nav active 补充样式
// ================================================================
document.head.insertAdjacentHTML('beforeend',
  `<style>.nav-link.active{color:var(--text)!important;background:rgba(249,115,22,.1)!important}</style>`
);

// ================================================================
// 降级方案：data.json 加载失败时使用内嵌数据
// ================================================================
function initWithFallback() {
  // 仅保证基本交互可用，数字与内容使用 HTML 中已有的静态值
  initNavbar();
  initTabs();
  initCounters();
  initCopyButtons();
  initScrollReveal();
  initHamburger();
  initActiveNavLink();
  console.warn('[OpenClaw Guide] 已进入降级模式，动态内容不可用');
}
