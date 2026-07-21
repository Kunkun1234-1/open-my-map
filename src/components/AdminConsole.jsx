import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, CircleDot, Database,
  Download, ExternalLink, FileBraces, FileSpreadsheet, Folder, Home, Layers, Map,
  Menu, Plus, RefreshCw, Search, UserPlus, Users, X,
} from 'lucide-react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { useAuth } from '../auth.jsx';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';
import { formatDate } from '../utils.js';

const resourceTabs = [
  ['maps', 'maps', Map],
  ['layers', 'layers', Layers],
  ['features', 'features', CircleDot],
];

const visibilityLabel = { private: '私有', link: '链接可见', public: '公开' };
const roleLabel = { admin: '数据管理员', editor: '普通用户' };

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function safeFileName(value) {
  return String(value || 'data').replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-');
}

function downloadBlob(content, type, fileName) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(value, fileName) {
  downloadBlob(JSON.stringify(value, null, 2), 'application/json;charset=utf-8', fileName);
}

function downloadCsv(rows, fileName) {
  const columns = Array.from(rows.reduce((keys, row) => {
    Object.keys(row).forEach((key) => keys.add(key));
    return keys;
  }, new Set()));
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const body = [columns.map(quote).join(','), ...rows.map((row) => columns.map((column) => quote(row[column])).join(','))].join('\r\n');
  downloadBlob(`\uFEFF${body}`, 'text/csv;charset=utf-8', fileName);
}

function downloadGeoJson(features, fileName) {
  const collection = {
    type: 'FeatureCollection',
    features: features.map((feature) => ({
      type: 'Feature',
      id: feature.id,
      geometry: parseJson(feature.geometry_json, null),
      properties: {
        name: feature.name,
        description: feature.description,
        geometryType: feature.type,
        layerId: feature.layer_id,
        layerName: feature.layer_name,
        mapId: feature.map_id,
        mapName: feature.map_name,
        style: parseJson(feature.style_json, {}),
      },
    })),
  };
  downloadJson(collection, fileName);
}

function displayLabel(value, fallback = '未命名') {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (/^[\uFFFD?？\s]+$/.test(text) || text.includes('\uFFFD')) return fallback;
  return text;
}

function Status({ status, children }) {
  const active = status === 'active' || status === 'public' || status === 'link' || status === true;
  return <span className={active ? 'admin-status is-active' : 'admin-status'}><i />{children}</span>;
}

function EmptyTable({ columns, text }) {
  return <tr><td className="admin-empty-cell" colSpan={columns}>{text}</td></tr>;
}

function AdminLogin({ error, onLogin }) {
  const { t } = useI18n();
  const [key, setKey] = useState('');
  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <div className="login-card-top">
          <span className="admin-login-logo"><Database size={24} /></span>
          <LanguageSwitch />
        </div>
        <div className="admin-login-brand">Open My Map · {t('admin.brand')}</div>
        <h1>{t('admin.overviewTitle')}</h1>
        <p>{t('admin.overviewHint')}</p>
        <form onSubmit={(event) => { event.preventDefault(); onLogin(key); }}>
          <label>{t('login.password')}<input autoFocus required autoComplete="current-password" type="password" value={key} onChange={(event) => setKey(event.target.value)} /></label>
          {error ? <div className="inline-error">{error}</div> : null}
          <button className="admin-primary-button">{t('admin.brand')}</button>
        </form>
        <button className="admin-text-button login-back" onClick={() => navigate('/login')}><ArrowLeft size={16} />{t('login.submitLogin')}</button>
        <button className="admin-text-button login-back" onClick={() => navigate('/')}><ArrowLeft size={16} />{t('admin.backLibrary')}</button>
      </section>
    </main>
  );
}

function DialogShell({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <section className="modal-dialog admin-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
        {children}
      </section>
    </div>
  );
}

function UserDialog({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'editor', status: 'active' });
  return (
    <DialogShell title="添加用户" onClose={onClose}>
      <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onCreate(form); }}>
        <label>姓名<input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>邮箱<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>初始密码<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="可选；留空则暂不可邮箱登录" minLength={6} /></label>
        <label>角色<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="admin">数据管理员</option><option value="editor">普通用户</option></select></label>
        <footer className="dialog-actions"><button type="button" className="admin-text-button" onClick={onClose}>取消</button><button className="admin-primary-button">创建用户</button></footer>
      </form>
    </DialogShell>
  );
}

function ProjectDialog({ users, onClose, onCreate }) {
  const defaultOwner = users.find((user) => user.role === 'admin')?.id || users[0]?.id || '';
  const [form, setForm] = useState({ name: '', description: '', ownerUserId: defaultOwner });
  return (
    <DialogShell title="新建项目" onClose={onClose}>
      <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onCreate(form); }}>
        <label>项目名称<input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：上海周末项目" /></label>
        <label>项目说明<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="项目收录的数据范围和用途" /></label>
        <label>所有者<select value={form.ownerUserId} onChange={(event) => setForm({ ...form, ownerUserId: Number(event.target.value) })}>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>
        <footer className="dialog-actions"><button type="button" className="admin-text-button" onClick={onClose}>取消</button><button className="admin-primary-button">创建项目</button></footer>
      </form>
    </DialogShell>
  );
}

function DownloadMenu({ onDownload, label = '下载' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-download-menu">
      <button className="admin-outline-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Download size={16} />{label}<ChevronDown size={15} /></button>
      {open ? <div className="admin-download-popover">
        <button onClick={() => { onDownload('csv'); setOpen(false); }}><FileSpreadsheet size={16} />CSV</button>
        <button onClick={() => { onDownload('json'); setOpen(false); }}><FileBraces size={16} />JSON</button>
        <button onClick={() => { onDownload('geojson'); setOpen(false); }}><Map size={16} />GeoJSON</button>
      </div> : null}
    </div>
  );
}

function Sidebar({ active, open, onNavigate, onClose }) {
  const { t } = useI18n();
  return <>
    {open ? <button className="admin-sidebar-scrim" aria-label={t('common.close')} onClick={onClose} /> : null}
    <aside className={open ? 'admin-sidebar open' : 'admin-sidebar'}>
      <div className="admin-brand">
        <span className="admin-brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <div><b>Open My Map</b><span>{t('admin.brand')}</span></div>
      </div>
      <nav aria-label={t('admin.brand')}>
        <button className={active === 'overview' ? 'active' : ''} onClick={() => onNavigate('overview')}><Home size={18} />{t('admin.overview')}</button>
        <button className={active === 'users' ? 'active' : ''} onClick={() => onNavigate('users')}><Users size={18} />{t('admin.users')}</button>
        <button className={active === 'projects' ? 'active' : ''} onClick={() => onNavigate('projects')}><Folder size={18} />{t('admin.projects')}</button>
      </nav>
      <div className="admin-sidebar-bottom">
        <span><i />{t('admin.dbOnline')}</span>
        <button type="button" onClick={() => navigate('/')}><ArrowLeft size={16} />{t('admin.backLibrary')}</button>
      </div>
    </aside>
  </>;
}

function Overview({ data, query, onOpenProject, onBackup }) {
  const [showAllActivity, setShowAllActivity] = useState(false);
  const stats = data.stats;
  const metrics = [
    ['用户', stats.users, Users], ['项目', stats.projects, Folder], ['地图', stats.maps, Map], ['图层', stats.layers, Layers], ['元素', stats.features, CircleDot],
  ];
  const dbFile = String(stats.dbPath || '').split(/[\\/]/).pop() || 'open-my-map.sqlite';
  const normalized = query.trim().toLowerCase();
  const visibleProjects = data.projects.filter((project) => {
    if (!normalized) return true;
    const relatedMaps = data.maps.filter((map) => map.project_id === project.id).map((map) => map.name).join(' ');
    const relatedLayers = data.layers.filter((layer) => layer.project_id === project.id).map((layer) => layer.name).join(' ');
    const relatedFeatures = data.features.filter((feature) => feature.project_id === project.id).map((feature) => feature.name).join(' ');
    return `${project.name} ${project.owner_name || ''} ${relatedMaps} ${relatedLayers} ${relatedFeatures}`.toLowerCase().includes(normalized);
  });
  return (
    <div className="admin-overview">
      <section className="admin-metric-row" aria-label="数据统计">
        {metrics.map(([label, value, Icon]) => (
          <div className="admin-metric-card" key={label}>
            <Icon size={18} />
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </section>

      <div className="admin-overview-grid">
        <section className="admin-panel">
          <header><h2>项目结构</h2></header>
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>项目</th><th>所有者</th><th>地图</th><th>图层</th><th>元素</th><th>最近更新</th></tr></thead>
              <tbody>
                {visibleProjects.map((project) => (
                  <tr key={project.id} onClick={() => onOpenProject(project.id)}>
                    <td><button type="button" className="admin-link-button"><ChevronRight size={15} />{displayLabel(project.name, '未命名项目')}</button></td>
                    <td>{displayLabel(project.owner_name, '未分配')}</td>
                    <td>{project.map_count}</td>
                    <td>{project.layer_count}</td>
                    <td>{project.feature_count}</td>
                    <td>{formatDate(project.updated_at)}</td>
                  </tr>
                ))}
                {visibleProjects.length === 0 ? <EmptyTable columns={6} text="没有匹配的数据" /> : null}
              </tbody>
            </table>
          </div>
          <footer>显示 {visibleProjects.length} / {data.projects.length} 个项目</footer>
        </section>

        <section className="admin-panel admin-activity-panel">
          <header><h2>最近活动</h2></header>
          <div>
            {data.audit.slice(0, showAllActivity ? 12 : 5).map((log) => (
              <div className="admin-activity-row" key={log.id}>
                <span className={`activity-icon ${log.action}`}><Activity size={15} /></span>
                <p><b>{log.details || `${log.action} ${log.entity_type}`}</b><small>{log.entity_type} · {log.entity_id}</small></p>
                <time>{formatDate(log.created_at)}</time>
              </div>
            ))}
            {data.audit.length === 0 ? <p className="admin-quiet-empty">暂无活动</p> : null}
          </div>
          <button type="button" className="admin-panel-link" onClick={() => setShowAllActivity((value) => !value)}>
            {showAllActivity ? '收起活动' : '查看全部活动'}
            <ChevronRight size={15} />
          </button>
        </section>
      </div>

      <section className="admin-db-meta">
        <div><span>状态</span><b className="database-ok"><CheckCircle2 size={16} />正常</b></div>
        <div><span>引擎</span><b>SQLite · WAL</b></div>
        <div><span>文件</span><b className="mono" title={stats.dbPath}>{dbFile}</b></div>
        <button type="button" className="admin-text-button" onClick={onBackup}><Download size={15} />备份</button>
      </section>
    </div>
  );
}

function DirectoryRail({ data, mode, selectedProjectId, selectedUserId, onSelectProject, onSelectUser, query }) {
  const normalized = query.trim().toLowerCase();
  const projects = data.projects.filter((project) => !normalized || `${project.name} ${project.owner_name || ''}`.toLowerCase().includes(normalized));
  const users = data.users.filter((user) => !normalized || `${user.name} ${user.email}`.toLowerCase().includes(normalized));
  const isProjects = mode === 'projects';
  return (
    <aside className="admin-directory-rail">
      <div className="admin-directory-rail-head">
        <span>{isProjects ? '项目' : '用户'}</span>
        <b>{isProjects ? data.projects.length : data.users.length}</b>
      </div>
      <div className="admin-directory-list">
        {isProjects ? projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className={selectedProjectId === project.id ? 'selected' : ''}
            onClick={() => onSelectProject(project.id)}
          >
            <span className="admin-list-title">{displayLabel(project.name, '未命名项目')}</span>
            <span className="admin-list-meta">{displayLabel(project.owner_name, '未分配')} · {project.map_count} 地图</span>
            <Status status={project.status}>{project.status === 'active' ? '活跃' : '归档'}</Status>
          </button>
        )) : null}
        {!isProjects ? users.map((user) => (
          <button
            key={user.id}
            type="button"
            className={selectedUserId === user.id ? 'selected' : ''}
            onClick={() => onSelectUser(user.id)}
          >
            <span className="admin-user-avatar">{displayLabel(user.name, '?').slice(0, 1)}</span>
            <span className="admin-list-copy">
              <span className="admin-list-title">{displayLabel(user.name, user.email)}</span>
              <span className="admin-list-meta">{user.email}</span>
            </span>
            <Status status={user.status}>{user.status === 'active' ? '启用' : '停用'}</Status>
          </button>
        )) : null}
        {isProjects && projects.length === 0 ? <p className="admin-quiet-empty">没有匹配的项目</p> : null}
        {!isProjects && users.length === 0 ? <p className="admin-quiet-empty">没有匹配的用户</p> : null}
      </div>
    </aside>
  );
}

function ResourceTable({ tab, rows, onOpenMap }) {
  if (tab === 'maps') return <table><thead><tr><th>ID</th><th>地图名称</th><th>所有者</th><th>可见性</th><th>图层</th><th>元素</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((map) => <tr key={map.id}><td className="mono">map_{String(map.id).padStart(3, '0')}</td><td><button className="admin-primary-link" onClick={() => onOpenMap(map.id)}>{map.name}</button></td><td>{map.owner}</td><td><Status status={map.visibility}>{visibilityLabel[map.visibility] || map.visibility}</Status></td><td>{map.layer_count}</td><td>{map.feature_count}</td><td>{formatDate(map.updated_at)}</td><td><button className="admin-row-button" onClick={() => onOpenMap(map.id)}>打开<ExternalLink size={14} /></button></td></tr>)}{rows.length === 0 ? <EmptyTable columns={8} text="这个项目还没有地图" /> : null}</tbody></table>;
  if (tab === 'layers') return <table><thead><tr><th>ID</th><th>图层名称</th><th>所属地图</th><th>状态</th><th>顺序</th><th>元素</th><th>更新时间</th></tr></thead><tbody>{rows.map((layer) => <tr key={layer.id}><td className="mono">layer_{String(layer.id).padStart(3, '0')}</td><td><span className="admin-table-icon"><Layers size={15} /></span><b>{layer.name}</b></td><td><button className="admin-primary-link" onClick={() => onOpenMap(layer.map_id)}>{layer.map_name}</button></td><td><Status status={Boolean(layer.visible)}>{layer.visible ? '显示' : '隐藏'}</Status></td><td>{Number(layer.position) + 1}</td><td>{layer.feature_count}</td><td>{formatDate(layer.updated_at)}</td></tr>)}{rows.length === 0 ? <EmptyTable columns={7} text="这个项目还没有图层" /> : null}</tbody></table>;
  return <table><thead><tr><th>ID</th><th>元素名称</th><th>几何类型</th><th>图层</th><th>地图</th><th>附件</th><th>说明</th><th>更新时间</th></tr></thead><tbody>{rows.map((feature) => <tr key={feature.id}><td className="mono">feature_{String(feature.id).padStart(3, '0')}</td><td><b>{feature.name}</b></td><td>{feature.type}</td><td>{feature.layer_name}</td><td><button className="admin-primary-link" onClick={() => onOpenMap(feature.map_id)}>{feature.map_name}</button></td><td>{feature.attachment_count || 0}</td><td className="admin-truncate">{feature.description || '—'}</td><td>{formatDate(feature.updated_at)}</td></tr>)}{rows.length === 0 ? <EmptyTable columns={8} text="这个项目还没有空间元素" /> : null}</tbody></table>;
}

function ProjectDetail({ project, data, onCreateMap, onToast }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('maps');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const projectMaps = useMemo(() => data.maps.filter((map) => map.project_id === project?.id), [data.maps, project]);
  const projectLayers = useMemo(() => data.layers.filter((layer) => layer.project_id === project?.id), [data.layers, project]);
  const projectFeatures = useMemo(() => data.features.filter((feature) => feature.project_id === project?.id), [data.features, project]);

  useEffect(() => { setQuery(''); setFilter('all'); setTab('maps'); }, [project?.id]);
  useEffect(() => { setFilter('all'); }, [tab]);
  if (!project) return <section className="admin-detail-empty"><Folder size={32} /><h2>{t('admin.projectsTitle')}</h2><p>{t('admin.projectsHint')}</p></section>;

  const source = tab === 'maps' ? projectMaps : tab === 'layers' ? projectLayers : projectFeatures;
  const normalized = query.trim().toLowerCase();
  const rows = source.filter((row) => {
    const matchesQuery = !normalized || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(normalized));
    if (!matchesQuery || filter === 'all') return matchesQuery;
    if (tab === 'maps') return row.visibility === filter;
    if (tab === 'layers') return filter === 'visible' ? Boolean(row.visible) : !row.visible;
    return row.type === filter;
  });
  const filterOptions = tab === 'maps'
    ? [['all', '全部可见性'], ['private', '私有'], ['link', '链接可见'], ['public', '公开']]
    : tab === 'layers'
      ? [['all', '全部状态'], ['visible', '显示'], ['hidden', '隐藏']]
      : [['all', '全部类型'], ['Point', 'Point'], ['LineString', 'LineString'], ['Polygon', 'Polygon']];
  const exportResource = (format) => {
    const prefix = safeFileName(`${project.name}-${tab}`);
    if (format === 'geojson') downloadGeoJson(projectFeatures, `${safeFileName(project.name)}.geojson`);
    else if (format === 'csv') downloadCsv(rows, `${prefix}.csv`);
    else downloadJson({ exportedAt: new Date().toISOString(), project, resource: tab, rows }, `${prefix}.json`);
    onToast(`已导出 ${format.toUpperCase()}`);
  };
  const exportProject = () => {
    downloadJson({ exportedAt: new Date().toISOString(), project, maps: projectMaps, layers: projectLayers, features: projectFeatures }, `${safeFileName(project.name)}.json`);
    onToast('项目数据已下载');
  };
  const firstMap = projectMaps[0];

  return (
    <section className="admin-project-detail">
      <header className="admin-detail-header">
        <div>
          <h2>{displayLabel(project.name, '未命名项目')}</h2>
          <p>
            {displayLabel(project.owner_name, '未分配所有者')}
            <span>·</span>
            <Status status={project.status}>{project.status === 'active' ? '活跃' : '归档'}</Status>
            <span>·</span>
            {project.member_count || 0} 名成员
            <span>·</span>
            更新于 {formatDate(project.updated_at)}
          </p>
        </div>
        <div className="admin-detail-actions">
          <button type="button" className="admin-primary-button" disabled={!firstMap} onClick={() => firstMap && navigate(`/maps/${firstMap.id}`)}>
            <ExternalLink size={15} />打开地图
          </button>
          <button type="button" className="admin-outline-button" onClick={exportProject}>
            <Download size={15} />导出
          </button>
        </div>
      </header>

      <div className="admin-resource-tabs" role="tablist">
        {resourceTabs.map(([key, , Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            <Icon size={15} />{key === 'maps' ? t('library.maps') : key === 'layers' ? t('library.layers') : t('library.features')}
            <span>{key === 'maps' ? projectMaps.length : key === 'layers' ? projectLayers.length : projectFeatures.length}</span>
          </button>
        ))}
      </div>

      <div className="admin-resource-toolbar">
        <label className="admin-inline-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('common.search')} />
        </label>
        <label className="admin-filter-select">
          <select aria-label="筛选" value={filter} onChange={(event) => setFilter(event.target.value)}>
            {filterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <span className="admin-toolbar-spacer" />
        {tab === 'maps' ? (
          <button type="button" className="admin-outline-button" onClick={() => onCreateMap(project)}>
            <Plus size={15} />新建地图
          </button>
        ) : null}
        <DownloadMenu onDownload={exportResource} label="下载" />
      </div>

      <div className="admin-resource-table">
        <ResourceTable tab={tab} rows={rows} onOpenMap={(mapId) => navigate(`/maps/${mapId}`)} />
        <footer>
          <span>{rows.length} 条结果</span>
          <span>SQLite 实时数据</span>
        </footer>
      </div>
    </section>
  );
}

function UserDetail({ user, data, onOpenProject, onToggleUser }) {
  if (!user) return <section className="admin-detail-empty"><Users size={32} /><h2>选择一个用户</h2><p>从左侧列表选择账号查看详情。</p></section>;
  const projects = data.projects.filter((project) => project.owner_user_id === user.id);
  const mapCount = projects.reduce((sum, project) => sum + Number(project.map_count || 0), 0);
  const featureCount = projects.reduce((sum, project) => sum + Number(project.feature_count || 0), 0);
  return (
    <section className="admin-user-detail">
      <header className="admin-detail-header">
        <span className="admin-user-avatar large">{displayLabel(user.name, '?').slice(0, 1)}</span>
        <div>
          <h2>{displayLabel(user.name, user.email)}</h2>
          <p>{user.email} · {roleLabel[user.role] || '普通用户'} · 最近活动 {formatDate(user.last_seen)}</p>
        </div>
        <Status status={user.status}>{user.status === 'active' ? '已启用' : '已停用'}</Status>
        <button type="button" className="admin-outline-button" onClick={() => onToggleUser(user)}>
          {user.status === 'active' ? '停用账号' : '启用账号'}
        </button>
      </header>

      <section className="admin-metric-row compact">
        <div className="admin-metric-card"><span>负责项目</span><b>{projects.length}</b></div>
        <div className="admin-metric-card"><span>地图</span><b>{mapCount}</b></div>
        <div className="admin-metric-card"><span>元素</span><b>{featureCount}</b></div>
      </section>

      <section className="admin-panel">
        <header><h2>负责的项目</h2></header>
        <div className="admin-table-wrap">
          <table>
            <thead><tr><th>项目</th><th>状态</th><th>地图</th><th>图层</th><th>元素</th><th>最近更新</th><th /></tr></thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td><button type="button" className="admin-primary-link" onClick={() => onOpenProject(project.id)}>{displayLabel(project.name, '未命名项目')}</button></td>
                  <td><Status status={project.status}>{project.status === 'active' ? '活跃' : '归档'}</Status></td>
                  <td>{project.map_count}</td>
                  <td>{project.layer_count}</td>
                  <td>{project.feature_count}</td>
                  <td>{formatDate(project.updated_at)}</td>
                  <td><button type="button" className="admin-row-button" onClick={() => onOpenProject(project.id)}>查看</button></td>
                </tr>
              ))}
              {projects.length === 0 ? <EmptyTable columns={7} text="该用户还没有负责项目" /> : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function DirectoryView({ data, mode, selectedProjectId, selectedUserId, onSelectProject, onSelectUser, query, onCreateMap, onToast, onToggleUser }) {
  const project = data.projects.find((item) => item.id === selectedProjectId);
  const user = data.users.find((item) => item.id === selectedUserId);
  return (
    <div className="admin-directory-layout">
      <DirectoryRail data={data} mode={mode} selectedProjectId={selectedProjectId} selectedUserId={selectedUserId} onSelectProject={onSelectProject} onSelectUser={onSelectUser} query={query} />
      <main className="admin-directory-detail">{mode === 'projects' ? <ProjectDetail project={project} data={data} onCreateMap={onCreateMap} onToast={onToast} /> : <UserDetail user={user} data={data} onOpenProject={onSelectProject} onToggleUser={onToggleUser} />}</main>
    </div>
  );
}

export default function AdminConsole() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [adminKey, setAdminKey] = useState(() => window.sessionStorage.getItem('open-my-map-admin-key') || '');
  const [loginError, setLoginError] = useState('');
  const [active, setActive] = useState('overview');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [data, setData] = useState({ stats: null, projects: [], maps: [], layers: [], features: [], attachments: [], imports: [], users: [], audit: [] });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDialog, setUserDialog] = useState(false);
  const [projectDialog, setProjectDialog] = useState(false);
  const [toast, setToast] = useState('');
  // 已登录的数据管理员可直接进入；否则回退到管理口令（仅引导/应急）。
  const authorized = Boolean(adminKey) || user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, projects, maps, layers, features, attachments, imports, users, audit] = await Promise.all([
        api.admin.stats(), api.admin.projects(), api.admin.maps(), api.admin.layers(), api.admin.features(), api.admin.attachments(), api.admin.imports(), api.admin.users(), api.admin.audit(),
      ]);
      setData({ stats, projects, maps, layers, features, attachments, imports, users, audit });
      setError('');
    } catch (requestError) {
      if (requestError.status === 401) {
        window.sessionStorage.removeItem('open-my-map-admin-key');
        setLoginError(requestError.message);
        setAdminKey('');
        setError('');
      } else setError(requestError.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authorized) load(); }, [authorized, load]);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (data.projects.length && !data.projects.some((project) => project.id === selectedProjectId)) setSelectedProjectId(data.projects[0].id);
    if (data.users.length && !data.users.some((user) => user.id === selectedUserId)) setSelectedUserId(data.users[0].id);
  }, [data.projects, data.users, selectedProjectId, selectedUserId]);

  const openProject = (projectId) => { setActive('projects'); setSelectedProjectId(projectId); setQuery(''); setSidebarOpen(false); };
  const selectUser = (userId) => { setActive('users'); setSelectedUserId(userId); setSidebarOpen(false); };
  const createUser = async (form) => { try { await api.admin.createUser(form); setUserDialog(false); setToast('用户已创建'); await load(); } catch (requestError) { setToast(requestError.message); } };
  const createProject = async (form) => { try { await api.admin.createProject(form); setProjectDialog(false); setToast('项目已创建'); await load(); } catch (requestError) { setToast(requestError.message); } };
  const toggleUser = async (user) => { try { await api.admin.updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }); setToast(user.status === 'active' ? '用户已停用' : '用户已启用'); await load(); } catch (requestError) { setToast(requestError.message); } };
  const createMap = async (project) => { try { const map = await api.createMap({ name: '未命名地图', projectId: project.id, owner: project.owner_name || '地图管理员' }); navigate(`/maps/${map.id}`); } catch (requestError) { setToast(requestError.message); } };
  const backup = async () => { try { await api.admin.backup(); setToast('完整备份已下载'); } catch (requestError) { setToast(requestError.message); } };

  if (!authorized) return <AdminLogin error={loginError} onLogin={(key) => { window.sessionStorage.setItem('open-my-map-admin-key', key); setLoginError(''); setAdminKey(key); }} />;

  return (
    <main className="admin-page">
      <Sidebar active={active} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(next) => { setActive(next); setQuery(''); setSidebarOpen(false); }} />
      <section className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="icon-button admin-menu-button" onClick={() => setSidebarOpen((value) => !value)} aria-label={t('library.menu')}><Menu size={20} /></button>
          <div className="admin-topbar-copy">
            <h1>{active === 'overview' ? t('admin.overviewTitle') : active === 'users' ? t('admin.usersTitle') : t('admin.projectsTitle')}</h1>
            <p>{active === 'overview' ? t('admin.overviewHint') : active === 'users' ? t('admin.usersHint') : t('admin.projectsHint')}</p>
          </div>
          <label className="admin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={active === 'overview' ? t('admin.searchOverview') : active === 'users' ? t('admin.searchUsers') : t('admin.searchProjects')}
            />
          </label>
          <LanguageSwitch className="admin-lang-switch" />
          <button type="button" className="admin-square-button" onClick={load} aria-label={t('admin.refresh')}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
          {active === 'users' ? <button type="button" className="admin-primary-button" onClick={() => setUserDialog(true)}><UserPlus size={15} />{t('admin.addUser')}</button> : null}
          {active === 'projects' ? <button type="button" className="admin-primary-button" onClick={() => setProjectDialog(true)}><Plus size={15} />{t('admin.newProject')}</button> : null}
          {active === 'overview' ? <button type="button" className="admin-primary-button" onClick={backup}><Download size={15} />{t('admin.backup')}</button> : null}
          <button
            type="button"
            className="admin-account"
            title={t('admin.exitAdmin')}
            onClick={() => { window.sessionStorage.removeItem('open-my-map-admin-key'); setAdminKey(''); navigate('/me'); }}
          >
            <span>{(user?.displayName || user?.name || '?').slice(0, 1)}</span>
          </button>
        </header>

        {error ? <div className="inline-error admin-error">{error}</div> : null}
        {loading && !data.stats ? <div className="admin-loading">{t('common.loading')}</div> : null}
        {active === 'overview' && data.stats ? <Overview data={data} query={query} onOpenProject={openProject} onBackup={backup} /> : null}
        {(active === 'users' || active === 'projects') && data.stats ? (
          <DirectoryView
            data={data}
            mode={active}
            selectedProjectId={selectedProjectId}
            selectedUserId={selectedUserId}
            onSelectProject={openProject}
            onSelectUser={selectUser}
            query={query}
            onCreateMap={createMap}
            onToast={setToast}
            onToggleUser={toggleUser}
          />
        ) : null}
      </section>
      {userDialog ? <UserDialog onClose={() => setUserDialog(false)} onCreate={createUser} /> : null}
      {projectDialog ? <ProjectDialog users={data.users} onClose={() => setProjectDialog(false)} onCreate={createProject} /> : null}
      {toast ? <div className="toast admin-toast">{toast}</div> : null}
    </main>
  );
}
