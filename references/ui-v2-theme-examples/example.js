const params = new URLSearchParams(window.location.search);
const initialTheme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = initialTheme;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  });
  document.querySelectorAll('[data-example-link]').forEach((link) => {
    const next = new URL(link.href);
    next.searchParams.set('theme', theme);
    link.href = next.href;
  });
  const url = new URL(window.location.href);
  url.searchParams.set('theme', theme);
  history.replaceState(null, '', url);
}

document.querySelectorAll('[data-theme-choice]').forEach((button) => {
  button.addEventListener('click', () => setTheme(button.dataset.themeChoice));
});
setTheme(initialTheme);

const listForm = document.getElementById('list-filters');
if (listForm) {
  const rows = [...document.querySelectorAll('[data-record]')];
  const count = document.getElementById('result-count');
  const filterButton = document.getElementById('filter-list');
  const filterCount = document.getElementById('filter-count');
  const setPanelOpen = (open, restoreFocus = true) => {
    listForm.hidden = !open;
    filterButton.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(() => document.getElementById('keyword').focus());
    else if (restoreFocus) requestAnimationFrame(() => filterButton.focus());
  };
  const runQuery = () => {
    const data = new FormData(listForm);
    const active = ['keyword', 'owner', 'usage', 'risk'].filter((key) => String(data.get(key) || '').trim()).length;
    filterCount.textContent = String(active);
    filterCount.hidden = active === 0;
    let visible = 0;
    rows.forEach((row) => {
      const match = (!data.get('keyword') || row.dataset.keyword.includes(String(data.get('keyword')).trim().toLowerCase()))
        && (!data.get('owner') || row.dataset.owner === data.get('owner'))
        && (!data.get('usage') || row.dataset.usage === data.get('usage'))
        && (!data.get('risk') || row.dataset.risk === data.get('risk'));
      row.hidden = !match;
      if (match) visible += 1;
    });
    count.textContent = String(visible);
    document.getElementById('empty-row').hidden = visible !== 0;
  };
  filterButton.addEventListener('click', () => setPanelOpen(listForm.hidden, false));
  document.getElementById('clear-filters').addEventListener('click', () => { listForm.reset(); runQuery(); });
  listForm.addEventListener('submit', (event) => { event.preventDefault(); runQuery(); setPanelOpen(false); });
  listForm.addEventListener('reset', () => requestAnimationFrame(runQuery));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !listForm.hidden) setPanelOpen(false); });
  document.addEventListener('pointerdown', (event) => {
    if (!listForm.hidden && !listForm.contains(event.target) && !filterButton.contains(event.target)) setPanelOpen(false);
  });
  document.getElementById('refresh-list').addEventListener('click', runQuery);
  document.getElementById('density-list').addEventListener('click', (event) => {
    const panel = document.querySelector('.table-panel');
    const next = panel.dataset.density === 'compact' ? 'loose' : 'compact';
    panel.dataset.density = next;
    event.currentTarget.setAttribute('aria-pressed', String(next === 'compact'));
    event.currentTarget.title = next === 'compact' ? '密度：紧凑' : '密度：宽松';
  });
  document.getElementById('columns-list').addEventListener('click', (event) => {
    const hidden = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    document.querySelectorAll('[data-optional-column]').forEach((cell) => { cell.hidden = hidden; });
    event.currentTarget.setAttribute('aria-pressed', String(hidden));
    event.currentTarget.title = hidden ? '列设置：显示车型' : '列设置：隐藏车型';
  });
  runQuery();
}

const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
  document.getElementById('return-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  const values = [...settingsForm.elements].filter((element) => element.name);
  const initial = Object.fromEntries(values.map((element) => [element.name, element.value]));
  const state = document.getElementById('save-state');
  const update = () => {
    const dirty = values.some((element) => element.value !== initial[element.name]);
    state.textContent = dirty ? '有未保存的示例修改' : '当前显示示例默认值';
    document.getElementById('review-impact').textContent = settingsForm.elements.reviewMode.value === 'manual'
      ? '新记录需人工复核；既有记录保持原状态'
      : '新记录按规则自动复核；异常仍进入人工队列';
    document.getElementById('review-pill').textContent = settingsForm.elements.reviewMode.value === 'manual' ? '人工复核' : '自动复核';
    document.getElementById('review-pill').className = `pill ${settingsForm.elements.reviewMode.value === 'manual' ? 'warn' : 'ok'}`;
  };
  settingsForm.addEventListener('input', update);
  settingsForm.addEventListener('change', update);
  document.getElementById('restore-settings').addEventListener('click', () => { settingsForm.reset(); update(); });
  settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.textContent = '设计示例不会写入业务数据';
  });
  update();
}
