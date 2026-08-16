// ==================== 地理位置搜索模块 ====================

// ==================== 卡片折叠模块 ====================

function toggleCard(header) {
  const card = header.closest('.card');
  const pinned = !card.classList.contains('pinned');
  card.classList.toggle('pinned', pinned);
  card.classList.toggle('collapsed', !pinned);
}

// ==================== 三主题系统模块 ====================

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  const themeBtns = document.querySelectorAll('.theme-selector-btn');
  
  applyTheme(savedTheme);
  
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      localStorage.setItem('theme', theme);
    });
  });
}

function applyTheme(theme) {
  const themeBtns = document.querySelectorAll('.theme-selector-btn');
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  
  document.documentElement.setAttribute('data-theme', theme);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initParamsAccordion();
  loadAnnouncements();
});

function initParamsAccordion() {
  const toggle = document.getElementById('paramsAccordionToggle');
  const body = document.getElementById('paramsAccordionBody');
  if (!toggle || !body) return;
  toggle.addEventListener('click', () => {
    const open = toggle.classList.toggle('open');
    body.classList.toggle('collapsed', !open);
  });
}

// ==================== 公告栏模块 ====================

const ANNOUNCE_URL = 'https://gist.githubusercontent.com/HOG-StarWatch/315e7eebc6a25b14d6a982d075906907/raw/FitAnnouncement.txt';

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeUrl(url) {
  const trimmed = String(url).trim();
  if (/^(https?:\/\/|mailto:|#|\.{1,2}\/|\/)/i.test(trimmed)) return trimmed;
  return '#';
}

function inlineMd(raw) {
  return escapeHtml(raw)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => `<a href="${safeUrl(url)}" target="_blank" rel="noopener">${text}</a>`);
}

function renderSimpleMarkdown(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const n = heading[1].length;
      html += `<h${n}>${inlineMd(heading[2])}</h${n}>`;
      i++;
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) { html += '<hr>'; i++; continue; }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(inlineMd(lines[i].replace(/^>\s?/, ''))); i++; }
      html += '<blockquote>' + buf.join('<br>') + '</blockquote>';
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      const buf = [];
      while (i < lines.length) {
        const m = lines[i].match(/^[-*]\s+(.*)$/);
        if (!m) break;
        buf.push('<li>' + inlineMd(m[1]) + '</li>');
        i++;
      }
      html += '<ul>' + buf.join('') + '</ul>';
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      const buf = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\d+\.\s+(.*)$/);
        if (!m) break;
        buf.push('<li>' + inlineMd(m[1]) + '</li>');
        i++;
      }
      html += '<ol>' + buf.join('') + '</ol>';
      continue;
    }

    const paragraph = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s|^[-*]\s|^\d+\.\s|^>\s|-{3,}$/.test(lines[i].trim())) {
      paragraph.push(lines[i].trim());
      i++;
    }
    html += '<p>' + inlineMd(paragraph.join(' ')) + '</p>';
  }

  return html;
}

async function loadAnnouncements() {
  const el = document.getElementById('announceContent');
  if (!el) return;
  el.innerHTML = '加载中…';

  let text = '';
  const sources = [];
  if (ANNOUNCE_URL) sources.push(ANNOUNCE_URL);
  sources.push('./FitAnnouncement.txt');

  for (const url of sources) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const raw = await res.text();
      if (raw.trim()) { text = raw; break; }
    } catch (e) { }
  }

  el.innerHTML = text ? renderSimpleMarkdown(text) : '<p style="text-align:center;color:var(--text-dim)">暂无公告</p>';
}

function openNoticeWindow() {
  const w = document.getElementById('noticeWindow');
  if (w) w.classList.add('open');
}

function closeNoticeWindow() {
  const w = document.getElementById('noticeWindow');
  if (w) w.classList.remove('open');
}

function toggleNoticeWindow(e) {
  if (e) e.stopPropagation();
  const w = document.getElementById('noticeWindow');
  if (!w) return;
  w.classList.toggle('open');
}

function stopProp(e) { e.stopPropagation(); }

document.getElementById('noticeFab')?.addEventListener('click', toggleNoticeWindow);
['wheel','dblclick','mousedown','touchstart'].forEach(ev => {
  document.getElementById('noticeFab')?.addEventListener(ev, stopProp);
  document.getElementById('noticeWindow')?.addEventListener(ev, stopProp);
});
document.getElementById('noticeWindow')?.addEventListener('click', stopProp);

let searchMarker = null;

async function searchLocation() {
  const input = document.getElementById('searchInput');
  const resultDiv = document.getElementById('searchResult');
  const query = input.value.trim();
  
  if (!query) {
    resultDiv.innerHTML = '<span style="color: #ef4444;">请输入搜索内容</span>';
    return;
  }
  
  resultDiv.innerHTML = '<span style="color: #3b82f6;">搜索中...</span>';
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=zh-CN`
    );
    
    if (!response.ok) throw new Error('搜索失败');
    const results = await response.json();
    
    if (results.length === 0) {
      resultDiv.innerHTML = '<span style="color: #ef4444;">未找到相关位置</span>';
      return;
    }
    
    const location = results[0];
    const lat = parseFloat(location.lat);
    const lon = parseFloat(location.lon);
    
    if (searchMarker) map.removeLayer(searchMarker);
    
    searchMarker = L.marker([lat, lon]).addTo(map)
      .bindPopup(`<b>${escapeHtml(location.display_name)}</b>`)
      .openPopup();
    
    map.flyTo([lat, lon], 15, { duration: 1.5 });
    resultDiv.innerHTML = `<span style="color: #10b981;">已定位：${escapeHtml(location.display_name.split(',')[0])}</span>`;
    
    setTimeout(() => {
      if (resultDiv.innerHTML.includes('已定位')) resultDiv.innerHTML = '';
    }, 5000);
    
  } catch (error) {
    resultDiv.innerHTML = '<span style="color: #ef4444;">搜索出错，请重试</span>';
  }
}

// ==================== 统一坐标转换管理器 ====================

const CoordTransform = {
  PI: 3.1415926535897932384626,
  a: 6378245.0,
  ee: 0.00669342162296594323,
  x_PI: 3.14159265358979324 * 3000.0 / 180.0,

  /**
   * 判断坐标是否在中国境外（无需偏移）
   */
  isOutOfChina(lng, lat) {
    return (lng < 72.004 || lng > 137.8347) || (lat < 0.8293 || lat > 55.8271);
  },

  /**
   * WGS84 转 GCJ02 (火星坐标系)
   */
  WGS84_TO_GCJ02(lng, lat) {
    if (this.isOutOfChina(lng, lat)) {
      return [lng, lat];
    }
    let dlat = this.transformLat(lng - 105.0, lat - 35.0);
    let dlng = this.transformLng(lng - 105.0, lat - 35.0);
    const radlat = lat / 180.0 * this.PI;
    let magic = Math.sin(radlat);
    magic = 1 - this.ee * magic * magic;
    const sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / ((this.a * (1 - this.ee)) / (magic * sqrtmagic) * this.PI);
    dlng = (dlng * 180.0) / ((this.a / sqrtmagic) * Math.cos(radlat) * this.PI);
    return [lng + dlng, lat + dlat];
  },

  /**
   * GCJ02 转 WGS84
   */
  GCJ02_TO_WGS84(lng, lat) {
    if (this.isOutOfChina(lng, lat)) {
      return [lng, lat];
    }
    let dlat = this.transformLat(lng - 105.0, lat - 35.0);
    let dlng = this.transformLng(lng - 105.0, lat - 35.0);
    const radlat = lat / 180.0 * this.PI;
    let magic = Math.sin(radlat);
    magic = 1 - this.ee * magic * magic;
    const sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / ((this.a * (1 - this.ee)) / (magic * sqrtmagic) * this.PI);
    dlng = (dlng * 180.0) / ((this.a / sqrtmagic) * Math.cos(radlat) * this.PI);
    return [lng - dlng, lat - dlat];
  },

  /**
   * GCJ02 转 BD09 (百度坐标系)
   */
  GCJ02_TO_BD09(lng, lat) {
    let z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * this.x_PI);
    let theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * this.x_PI);
    return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
  },

  /**
   * BD09 转 GCJ02
   */
  BD09_TO_GCJ02(lng, lat) {
    let x = lng - 0.0065;
    let y = lat - 0.006;
    let z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * this.x_PI);
    let theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * this.x_PI);
    return [z * Math.cos(theta), z * Math.sin(theta)];
  },

  /**
   * WGS84 转 BD09
   */
  WGS84_TO_BD09(lng, lat) {
    const [gcjLng, gcjLat] = this.WGS84_TO_GCJ02(lng, lat);
    return this.GCJ02_TO_BD09(gcjLng, gcjLat);
  },

  /**
   * BD09 转 WGS84
   */
  BD09_TO_WGS84(lng, lat) {
    const [gcjLng, gcjLat] = this.BD09_TO_GCJ02(lng, lat);
    return this.GCJ02_TO_WGS84(gcjLng, gcjLat);
  },

  transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * this.PI) + 20.0 * Math.sin(2.0 * x * this.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * this.PI) + 40.0 * Math.sin(y / 3.0 * this.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * this.PI) + 320 * Math.sin(y * this.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  },

  transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * this.PI) + 20.0 * Math.sin(2.0 * x * this.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * this.PI) + 40.0 * Math.sin(x / 3.0 * this.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * this.PI) + 300.0 * Math.sin(x / 30.0 * this.PI)) * 2.0 / 3.0;
    return ret;
  }
};

const CoordSys = {
  WGS84: 'wgs84',
  GCJ02: 'gcj02',
  BD09: 'bd09'
};

const MAP_SOURCE_CONFIG = {
  wgs84: ['osm', 'osmde', 'osmfr', 'osm_cn', 'cyclOSM', 'wikimedia', 'arcgis_street', 'arcgis_satellite', 'esri_satellite', 'cartodb', 'cartodb_dark', 'stamen_water', 'stamen_terrain'],
  gcj02: ['gaode_vec', 'gaode_img', 'gaode_rel', 'tencent_vec', 'tencent_sat', 'tianditu', 'satellite'],
  bd09: ['baidu_vec', 'baidu_img']
};

function getMapCoordSys(sourceType) {
  for (const [sys, sources] of Object.entries(MAP_SOURCE_CONFIG)) {
    if (sources.includes(sourceType)) return sys;
  }
  return CoordSys.WGS84;
}

function getCurrentCoordSys() {
  const sourceType = document.getElementById('mapSourceSelect')?.value || 'gaode_vec';
  return getMapCoordSys(sourceType);
}

const CoordManager = {
  /**
   * 将当前地图坐标系的坐标转换为 WGS84
   * @param {number} lng - 经度
   * @param {number} lat - 纬度
   * @returns {[number, number]} [lng, lat] WGS84坐标
   */
  toWGS84(lng, lat) {
    const sys = getCurrentCoordSys();
    if (sys === CoordSys.GCJ02) {
      return CoordTransform.GCJ02_TO_WGS84(lng, lat);
    } else if (sys === CoordSys.BD09) {
      return CoordTransform.BD09_TO_WGS84(lng, lat);
    }
    return [lng, lat];
  },

  /**
   * 将 WGS84 坐标转换为当前地图坐标系
   * @param {number} lng - 经度
   * @param {number} lat - 纬度
   * @returns {[number, number]} [lng, lat] 当前地图坐标系坐标
   */
  fromWGS84(lng, lat) {
    const sys = getCurrentCoordSys();
    if (sys === CoordSys.GCJ02) {
      return CoordTransform.WGS84_TO_GCJ02(lng, lat);
    } else if (sys === CoordSys.BD09) {
      return CoordTransform.WGS84_TO_BD09(lng, lat);
    }
    return [lng, lat];
  },

  /**
   * 将当前地图坐标系的坐标点转换为 WGS84 点对象
   * @param {number} lng - 经度
   * @param {number} lat - 纬度
   * @returns {{lng: number, lat: number}} WGS84点对象
   */
  toWGS84Point(lng, lat) {
    const [newLng, newLat] = this.toWGS84(lng, lat);
    return { lng: newLng, lat: newLat };
  },

  /**
   * 将 WGS84 点对象转换为当前地图坐标系点对象
   * @param {number} lng - 经度
   * @param {number} lat - 纬度
   * @returns {{lng: number, lat: number}} 当前地图坐标系点对象
   */
  fromWGS84Point(lng, lat) {
    const [newLng, newLat] = this.fromWGS84(lng, lat);
    return { lng: newLng, lat: newLat };
  },

  /**
   * 将点数组从当前地图坐标系转换为 WGS84
   * @param {Array<{lng: number, lat: number}>} points - 点数组
   * @returns {Array<{lng: number, lat: number}>} WGS84点数组
   */
  toWGS84Array(points) {
    return points.map(p => this.toWGS84Point(p.lng, p.lat));
  },

  /**
   * 将点数组从 WGS84 转换为当前地图坐标系
   * @param {Array<{lng: number, lat: number}>} points - WGS84点数组
   * @returns {Array<{lng: number, lat: number}>} 当前地图坐标系点数组
   */
  fromWGS84Array(points) {
    return points.map(p => this.fromWGS84Point(p.lng, p.lat));
  },

  /**
   * 解析地图点击事件的坐标（Leaflet返回的是 {lat, lng}）
   * @param {number} lat - 纬度（Leaflet格式）
   * @param {number} lng - 经度（Leaflet格式）
   * @returns {{lng: number, lat: number}} WGS84点对象
   */
  parseMapClick(lat, lng) {
    return this.toWGS84Point(lng, lat);
  },

  /**
   * 将 WGS84 点转换为地图显示格式 [lat, lng]（Leaflet格式）
   * @param {{lng: number, lat: number}} wgs84Point - WGS84点对象
   * @returns {[number, number]} [lat, lng] Leaflet格式坐标数组
   */
  toMapDisplay(wgs84Point) {
    const converted = this.fromWGS84Point(wgs84Point.lng, wgs84Point.lat);
    return [converted.lat, converted.lng];
  },

  /**
   * 将 WGS84 点数组转换为地图显示格式 [[lat, lng], ...]
   * @param {Array<{lng: number, lat: number}>} wgs84Points - WGS84点数组
   * @returns {Array<[number, number]>} Leaflet格式坐标数组
   */
  toMapDisplayArray(wgs84Points) {
    return wgs84Points.map(p => this.toMapDisplay(p));
  }
};

// ==================== 地图源管理模块 ====================

const DEFAULT_TIANDITU_KEY = 'fc97d01c0e3e98289295da844e1f2dad';

function updateTiandituKeyVisibility(sourceType) {
  const container = document.getElementById('tiandituKeyContainer');
  if (container) {
    container.style.display = (sourceType === 'tianditu' || sourceType === 'satellite') ? 'flex' : 'none';
  }
}

function getTiandituKey() {
  const input = document.getElementById('tiandituKeyInput');
  const val = input ? input.value.trim() : '';
  return val || DEFAULT_TIANDITU_KEY;
}

const mapSources = {
  osmde: L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; OpenStreetMap DE' }),
  cyclOSM: L.tileLayer("https://{s}.tile.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", { subdomains: ['a', 'b', 'c'], maxZoom: 20, attribution: '&copy; CyclOSM' }),
  osmfr: L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", { subdomains: ['a', 'b', 'c'], maxZoom: 20, attribution: '&copy; OpenStreetMap France' }),
  arcgis_street: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }),
  arcgis_satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }),
  cartodb: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: ['a', 'b', 'c', 'd'], maxZoom: 20, attribution: '&copy; CartoDB' }),
  cartodb_dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: ['a', 'b', 'c', 'd'], maxZoom: 20, attribution: '&copy; CartoDB' }),
  wikimedia: L.tileLayer("https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png", { subdomains: ['a', 'b', 'c'], maxZoom: 19, attribution: '&copy; Wikimedia' }),
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { subdomains: ['a', 'b', 'c'], maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
  esri_satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }),
  gaode_vec: L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', { subdomains: ['1', '2', '3', '4'], maxZoom: 19, attribution: '&copy; 高德地图' }),
  gaode_img: L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}', { subdomains: ['1', '2', '3', '4'], maxZoom: 18, attribution: '&copy; 高德地图' }),
  gaode_rel: L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=10&x={x}&y={y}&z={z}', { subdomains: ['1', '2', '3', '4'], maxZoom: 16, attribution: '&copy; 高德地图' }),
  tencent_vec: L.tileLayer('https://rt0{s}.map.gtimg.com/tile?z={z}&x={x}&y={y}&styleid=2', { subdomains: ['1', '2', '3'], maxZoom: 18, attribution: '&copy; 腾讯地图' }),
  tencent_sat: L.tileLayer('https://rt0{s}.map.gtimg.com/tile?z={z}&x={x}&y={y}&styleid=0', { subdomains: ['1', '2', '3'], maxZoom: 18, attribution: '&copy; 腾讯地图' }),
  baidu_vec: L.tileLayer('https://maponline.bdimg.com/tile/?qt=tile&x={x}&y={y}&z={z}&styles=pl&scaler=1', { maxZoom: 19, attribution: '&copy; 百度地图' }),
  baidu_img: L.tileLayer('https://maponline.bdimg.com/tile/?qt=tile&x={x}&y={y}&z={z}&styles=sl&scaler=1', { maxZoom: 19, attribution: '&copy; 百度地图' }),
  osm_cn: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { subdomains: ['a', 'b', 'c'], maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
  stamen_water: L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg', { subdomains: ['a', 'b', 'c', 'd'], maxZoom: 18, attribution: '&copy; Stamen/Stadia' }),
  stamen_terrain: L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png', { subdomains: ['a', 'b', 'c', 'd'], maxZoom: 18, attribution: '&copy; Stamen/Stadia' })
};

let activeBaseLayer = null;
let activeLabelLayer = null;

const map = L.map("map", {
  attributionControl: true,
  zoomControl: true,
  dragging: true,
  tap: true,
  touchZoom: true,
  doubleClickZoom: false
}).setView([39.9042, 116.4074], 13);

activeBaseLayer = mapSources.gaode_vec;
activeBaseLayer.addTo(map);

function switchMapSource(sourceType) {
  updateTiandituKeyVisibility(sourceType);
  const tk = getTiandituKey();

  const currentCenter = map.getCenter();
  const currentZoom = map.getZoom();
  const selectEl = document.getElementById('mapSourceSelect');
  // change 事件触发时 select.value 已是新值，必须用 data-prev 里保存的旧源计算旧坐标系
  const oldCoordSys = getMapCoordSys(selectEl?.dataset.prev || 'gaode_vec');

  // 保存当前地图中心点的 WGS84 坐标
  let wgsCenter;
  if (oldCoordSys === CoordSys.WGS84) {
    wgsCenter = { lng: currentCenter.lng, lat: currentCenter.lat };
  } else if (oldCoordSys === CoordSys.GCJ02) {
    const [lng, lat] = CoordTransform.GCJ02_TO_WGS84(currentCenter.lng, currentCenter.lat);
    wgsCenter = { lng, lat };
  } else if (oldCoordSys === CoordSys.BD09) {
    const [lng, lat] = CoordTransform.BD09_TO_WGS84(currentCenter.lng, currentCenter.lat);
    wgsCenter = { lng, lat };
  }

  if (activeBaseLayer) map.removeLayer(activeBaseLayer);
  if (activeLabelLayer) { map.removeLayer(activeLabelLayer); activeLabelLayer = null; }

  switch(sourceType) {
    case 'osm': case 'osmde': case 'cyclOSM': case 'osmfr':
    case 'arcgis_street': case 'arcgis_satellite':
    case 'cartodb': case 'cartodb_dark': case 'wikimedia':
    case 'gaode_vec': case 'gaode_img': case 'gaode_rel':
    case 'tencent_vec': case 'tencent_sat':
    case 'baidu_vec': case 'baidu_img':
    case 'osm_cn':
    case 'stamen_water': case 'stamen_terrain':
      activeBaseLayer = mapSources[sourceType];
      activeBaseLayer.addTo(map);
      break;
    case 'esri_satellite':
      activeBaseLayer = mapSources.esri_satellite;
      activeBaseLayer.addTo(map);
      break;
    case 'tianditu':
      activeBaseLayer = L.tileLayer(`https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`, { subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], minZoom: 5, maxZoom: 20, maxNativeZoom: 18, attribution: '&copy; 天地图' });
      activeLabelLayer = L.tileLayer(`https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`, { subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], minZoom: 5, maxZoom: 20, maxNativeZoom: 17 });
      activeBaseLayer.addTo(map);
      activeLabelLayer.addTo(map);
      break;
    case 'satellite':
      activeBaseLayer = L.tileLayer(`https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`, { subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], minZoom: 5, maxZoom: 20, maxNativeZoom: 18, attribution: '&copy; 天地图' });
      activeLabelLayer = L.tileLayer(`https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`, { subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], minZoom: 5, maxZoom: 20, maxNativeZoom: 17 });
      activeBaseLayer.addTo(map);
      activeLabelLayer.addTo(map);
      break;
  }

  // 将 WGS84 中心点转换为新地图源的坐标系
  const newCoordSys = getMapCoordSys(sourceType);
  let newCenter;
  if (newCoordSys === CoordSys.WGS84) {
    newCenter = [wgsCenter.lat, wgsCenter.lng];
  } else if (newCoordSys === CoordSys.GCJ02) {
    const [lng, lat] = CoordTransform.WGS84_TO_GCJ02(wgsCenter.lng, wgsCenter.lat);
    newCenter = [lat, lng];
  } else if (newCoordSys === CoordSys.BD09) {
    const [lng, lat] = CoordTransform.WGS84_TO_BD09(wgsCenter.lng, wgsCenter.lat);
    newCenter = [lat, lng];
  }

  map.setView(newCenter, currentZoom);

  // 更新当前位置标记
  if (savedGpsWGS84) {
    const displayPoint = CoordManager.fromWGS84Point(savedGpsWGS84.lng, savedGpsWGS84.lat);
    if (currentLocationMarker) map.removeLayer(currentLocationMarker);
    currentLocationMarker = L.marker([displayPoint.lat, displayPoint.lng], {
      icon: L.divIcon({
        className: 'current-location-marker',
        html: '<div class="location-pulse"></div>',
        iconSize: [20, 20]
      })
    }).addTo(map);
  } else if (currentLocationMarker) {
    map.removeLayer(currentLocationMarker);
    currentLocationMarker = null;
  }

  // 刷新轨迹显示
  refreshRouteDisplay();

  const select = document.getElementById('mapSourceSelect');
  if (select) {
    select.dataset.prev = sourceType;
    updateMessage(`已切换到 ${select.options[select.selectedIndex].text}`);
  }
}

function refreshRouteDisplay() {
  if (routePoints.length < 2) return;

  // 将 WGS84 轨迹点转换为当前地图坐标系显示
  const displayPoints = CoordManager.toMapDisplayArray(routePoints);

  if (polyline) {
    polyline.setLatLngs(displayPoints);
  }

  if (smoothedPoints && smoothedPoints.length >= 2) {
    const smoothDisplayPoints = CoordManager.toMapDisplayArray(smoothedPoints);
    if (smoothPolyline) smoothPolyline.setLatLngs(smoothDisplayPoints);
    else smoothPolyline = L.polyline(smoothDisplayPoints, {
      color: '#3b82f6',
      weight: 3,
      opacity: 0.7,
      dashArray: '8, 4'
    }).addTo(map);
  }

  if (routeEditor.active) {
    routeEditor.renderMarkers();
  }

  if (shapeManipulator.isActive()) {
    shapeManipulator.redraw();
  }
}

document.getElementById('mapSourceSelect')?.addEventListener('change', function() {
  if (this.value === 'baidu_vec' || this.value === 'baidu_img') {
    updateMessage('百度瓦片使用 BD09MC 投影，与 XYZ 切片不兼容，已取消切换', true);
    this.value = this.dataset.prev || 'gaode_vec';
    return;
  }
  switchMapSource(this.value);
});
document.getElementById('tiandituKeyInput')?.addEventListener('input', function() {
  const select = document.getElementById('mapSourceSelect');
  if (select && (select.value === 'tianditu' || select.value === 'satellite')) switchMapSource(select.value);
});

// ==================== 当前位置获取模块 ====================

let currentLocationMarker = null;
let savedGpsWGS84 = null;

document.getElementById('getLocationBtn')?.addEventListener('click', () => {
  const btn = document.getElementById('getLocationBtn');
  btn.disabled = true;
  btn.textContent = '定位中...';
  updateMessage('正在获取您的位置...');
  
  if (!navigator.geolocation) {
    updateMessage('您的浏览器不支持定位功能', true);
    btn.disabled = false;
    btn.textContent = '获取位置';
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const wgsLat = position.coords.latitude;
      const wgsLng = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      
      savedGpsWGS84 = { lng: wgsLng, lat: wgsLat };
      const displayPoint = CoordManager.fromWGS84Point(wgsLng, wgsLat);
      
      if (currentLocationMarker) map.removeLayer(currentLocationMarker);
      
      currentLocationMarker = L.marker([displayPoint.lat, displayPoint.lng], {
        icon: L.divIcon({
          className: 'current-location-marker',
          html: '<div class="location-pulse"></div>',
          iconSize: [20, 20]
        })
      }).addTo(map);
      
      currentLocationMarker.bindPopup(`<b>您的位置</b><br>WGS84纬度：${wgsLat.toFixed(6)}<br>WGS84经度：${wgsLng.toFixed(6)}<br>精度：±${accuracy.toFixed(0)}米`).openPopup();
      map.setView([displayPoint.lat, displayPoint.lng], 15);
      btn.disabled = false;
      btn.textContent = '获取位置';
      updateMessage(`定位成功！精度约 ${accuracy.toFixed(0)} 米`);
    },
    (error) => {
      let errorMsg = '定位失败，请手动选择';
      if (error.code === error.PERMISSION_DENIED) errorMsg = '定位失败：您拒绝了位置权限请求';
      else if (error.code === error.POSITION_UNAVAILABLE) errorMsg = '定位失败：位置信息不可用';
      else if (error.code === error.TIMEOUT) errorMsg = '定位失败：请求超时';
      
      updateMessage(errorMsg, true);
      alert(errorMsg + '\n\n请在地图上手动点击选择您的位置');
      btn.disabled = false;
      btn.textContent = '获取位置';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

// ==================== 用户偏好设置模块 ====================

const weightInput = document.getElementById("weightInput");
if (weightInput) {
  const savedWeight = localStorage.getItem("fit_weight");
  weightInput.value = savedWeight ? savedWeight : 65;
  weightInput.addEventListener("change", () => localStorage.setItem("fit_weight", weightInput.value));
}

// ==================== 路线绘制模式模块 ====================

let currentDrawMode = 'free';
let isEditMode = false;

function switchDrawMode(mode) {
  const freeDrawBtn = document.getElementById('freeDrawMode');
  const shapeDrawBtn = document.getElementById('shapeDrawMode');
  const editBtn = document.getElementById('editModeBtn');
  const shapePanel = document.getElementById('shapeGenerationPanel');
  
  if (mode === 'free') {
    currentDrawMode = 'free';
    isEditMode = false;
    if (freeDrawBtn) freeDrawBtn.classList.add('active');
    if (shapeDrawBtn) shapeDrawBtn.classList.remove('active');
    if (editBtn) editBtn.classList.remove('active');
    if (shapePanel) shapePanel.style.display = 'none';
    shapeManipulator.deactivate();
    routeEditor.disable();
  } else if (mode === 'shape') {
    currentDrawMode = 'shape';
    isEditMode = false;
    if (shapeDrawBtn) shapeDrawBtn.classList.add('active');
    if (freeDrawBtn) freeDrawBtn.classList.remove('active');
    if (editBtn) editBtn.classList.remove('active');
    if (shapePanel) shapePanel.style.display = 'block';
    routeEditor.disable();
  } else if (mode === 'edit') {
    if (routePoints.length < 2) {
      updateMessage('请先绘制至少2个轨迹点，再进入编辑模式', true);
      return;
    }
    currentDrawMode = 'free';
    isEditMode = true;
    if (editBtn) editBtn.classList.add('active');
    if (freeDrawBtn) freeDrawBtn.classList.remove('active');
    if (shapeDrawBtn) shapeDrawBtn.classList.remove('active');
    if (shapePanel) shapePanel.style.display = 'none';
    shapeManipulator.deactivate();
    routeEditor.enable();
  }
}

document.getElementById('freeDrawMode')?.addEventListener('click', () => {
  if (isEditMode) {
    routeEditor.disable();
    isEditMode = false;
  }
  switchDrawMode('free');
});
document.getElementById('shapeDrawMode')?.addEventListener('click', () => {
  if (isEditMode) {
    routeEditor.disable();
    isEditMode = false;
  }
  switchDrawMode('shape');
});
document.getElementById('editModeBtn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (isEditMode) {
    routeEditor.disable();
    isEditMode = false;
    btn.classList.remove('active');
    updateMessage('已退出编辑模式');
  } else {
    switchDrawMode('edit');
  }
});

const rotationSlider = document.getElementById('rotationSlider');
const rotationInput = document.getElementById('rotationInput');
const offsetLatInput = document.getElementById('offsetLatInput');
const offsetLngInput = document.getElementById('offsetLngInput');

if (rotationSlider && rotationInput) {
  rotationSlider.addEventListener('input', () => {
    rotationInput.value = rotationSlider.value;
    if (shapeManipulator?.isActive()) shapeManipulator.setRotation(parseInt(rotationSlider.value));
  });
  rotationInput.addEventListener('input', () => {
    let value = parseInt(rotationInput.value) || 0;
    value = Math.max(0, Math.min(360, value));
    rotationSlider.value = value;
    if (shapeManipulator?.isActive()) shapeManipulator.setRotation(value);
  });
}

document.getElementById('offsetLatInput')?.addEventListener('input', () => {
  if (shapeManipulator?.isActive()) {
    shapeManipulator.setOffset(
      parseFloat(document.getElementById('offsetLatInput').value) || 0,
      parseFloat(document.getElementById('offsetLngInput').value) || 0
    );
  }
});
document.getElementById('offsetLngInput')?.addEventListener('input', () => {
  if (shapeManipulator?.isActive()) {
    shapeManipulator.setOffset(
      parseFloat(document.getElementById('offsetLatInput').value) || 0,
      parseFloat(document.getElementById('offsetLngInput').value) || 0
    );
  }
});

// ==================== 形状操作器模块 ====================

const ICON_MOVE = `<div style="
  width: 28px;
  height: 28px;
  background: #2563eb;
  border: 3px solid white;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
    <path d="M12 2L12 22M2 12L22 12M7 7L7 17M17 7L17 17M4 7L4 17M20 7L20 17M7 4L17 4M7 20L17 20" stroke="white" stroke-width="2" stroke-linecap="round"/>
  </svg>
</div>`;

const ICON_ROTATE = `<div style="
  width: 24px;
  height: 24px;
  background: #ff5722;
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
    <path d="M21 12a9 9 0 11-2.64-6.36"/>
    <path d="M21 3v6h-6"/>
  </svg>
</div>`;

class ShapeManipulator {
  constructor() {
    this.polyline = null;
    this.moveMarker = null;
    this.rotateMarker = null;
    this.active = false;
    this.currentRotation = 0;
    this.currentOffset = { lat: 0, lng: 0 };
    this.shapeType = '400m';
    this.mapCenter = null;
    this.shapeCenter = null;
    this.isDraggingMove = false;
    this.isDraggingRotate = false;
    this.dragStartAngle = 0;
    this.dragStartRotation = 0;
    this.dragStartOffset = { lat: 0, lng: 0 };
    this.dragStartShapeCenter = null;
  }

  generateShape(center, shapeType, rotation, offsetLat = 0, offsetLng = 0) {
    const points = [];
    const rotationRad = (rotation * Math.PI) / 180;
    
    let radius, straightLength;
    switch(shapeType) {
      case '400m': radius = 36.5; straightLength = 84.39; break;
      case '300m': radius = 23.17; straightLength = 68.04; break;
      case '200m': radius = 15.0; straightLength = 50.91; break;
      default: radius = 36.5; straightLength = 84.39;
    }
    
    const latPerMeter = 1 / 111320;
    const lonPerMeter = 1 / (111320 * Math.cos(center.lat * Math.PI / 180));
    const curvePoints = 32;
    
    for (let i = 0; i <= curvePoints; i++) {
      const angle = -Math.PI * (i / curvePoints);
      const x = radius * Math.cos(angle);
      const y = -straightLength / 2 + radius * Math.sin(angle);
      const rx = x * Math.cos(rotationRad) - y * Math.sin(rotationRad);
      const ry = x * Math.sin(rotationRad) + y * Math.cos(rotationRad);
      points.push({ lat: center.lat + ry * latPerMeter + offsetLat, lng: center.lng + rx * lonPerMeter + offsetLng });
    }
    
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const y = -straightLength / 2 + straightLength * t;
      const x = -radius;
      const rx = x * Math.cos(rotationRad) - y * Math.sin(rotationRad);
      const ry = x * Math.sin(rotationRad) + y * Math.cos(rotationRad);
      points.push({ lat: center.lat + ry * latPerMeter + offsetLat, lng: center.lng + rx * lonPerMeter + offsetLng });
    }
    
    for (let i = 0; i <= curvePoints; i++) {
      const angle = Math.PI - Math.PI * (i / curvePoints);
      const x = radius * Math.cos(angle);
      const y = straightLength / 2 + radius * Math.sin(angle);
      const rx = x * Math.cos(rotationRad) - y * Math.sin(rotationRad);
      const ry = x * Math.sin(rotationRad) + y * Math.cos(rotationRad);
      points.push({ lat: center.lat + ry * latPerMeter + offsetLat, lng: center.lng + rx * lonPerMeter + offsetLng });
    }
    
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const y = straightLength / 2 - straightLength * t;
      const x = radius;
      const rx = x * Math.cos(rotationRad) - y * Math.sin(rotationRad);
      const ry = x * Math.sin(rotationRad) + y * Math.cos(rotationRad);
      points.push({ lat: center.lat + ry * latPerMeter + offsetLat, lng: center.lng + rx * lonPerMeter + offsetLng });
    }
    
    return points;
  }

  activate(center, shapeType, rotation = 0, offsetLat = 0, offsetLng = 0) {
    this.deactivate();
    this.active = true;
    this.currentRotation = rotation;
    this.currentOffset = { lat: offsetLat, lng: offsetLng };
    this.shapeType = shapeType;
    // mapCenter 统一存 WGS84，重绘/拖拽时再转当前显示坐标系，避免跨坐标系切换后跳变
    this.mapCenter = { lat: center.lat, lng: center.lng };
    const displayCenter = CoordManager.fromWGS84Point(this.mapCenter.lng, this.mapCenter.lat);

    // generateShape 生成的是地图坐标系的点
    const points = this.generateShape(displayCenter, shapeType, rotation, offsetLat, offsetLng);
    
    // 将生成的点转换为 WGS84 保存到 routePoints
    routePoints = CoordManager.toWGS84Array(points);
    
    // 将 WGS84 点转换回地图坐标系显示
    const displayPoints = CoordManager.toMapDisplayArray(routePoints);
    
    this.polyline = L.polyline(displayPoints, { color: "#ff5722", weight: 4, opacity: 0.9 }).addTo(map);
    
    const bounds = this.polyline.getBounds();
    const centerPoint = bounds.getCenter();
    this.shapeCenter = { lat: centerPoint.lat, lng: centerPoint.lng };
    
    const moveIcon = L.divIcon({
      html: ICON_MOVE,
      className: 'shape-handle',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    
    this.moveMarker = L.marker(centerPoint, { icon: moveIcon, draggable: true }).addTo(map);
    
    this.moveMarker.on('dragstart', (e) => {
      this.isDraggingMove = true;
      this.dragStartOffset = { ...this.currentOffset };
      const markerPos = this.moveMarker.getLatLng();
      this.dragStartShapeCenter = { lat: markerPos.lat, lng: markerPos.lng };
      pushHistory();
    });
    
    this.moveMarker.on('drag', (e) => {
      if (!this.isDraggingMove) return;
      const newCenter = e.target.getLatLng();
      // 仅更新中心点，currentOffset 保持用户设置的偏移，避免双倍偏移；
      // 拖拽回调拿到的是显示坐标，统一转 WGS84 存储
      this.mapCenter = CoordManager.toWGS84Point(newCenter.lng, newCenter.lat);
      this.redraw();
    });
    
    this.moveMarker.on('dragend', () => {
      this.isDraggingMove = false;
    });
    
    const topCenter = bounds.getNorthWest();
    const rotateIcon = L.divIcon({
      html: ICON_ROTATE,
      className: 'shape-handle',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    this.rotateMarker = L.marker(topCenter, { icon: rotateIcon, draggable: true }).addTo(map);
    
    this.rotateMarker.on('dragstart', (e) => {
      this.isDraggingRotate = true;
      this.dragStartRotation = this.currentRotation;
      const markerPos = e.target.getLatLng();
      const centerPos = this.moveMarker.getLatLng();
      this.dragStartAngle = Math.atan2(markerPos.lat - centerPos.lat, markerPos.lng - centerPos.lng);
      pushHistory();
    });
    
    this.rotateMarker.on('drag', (e) => {
      if (!this.isDraggingRotate) return;
      const markerPos = e.target.getLatLng();
      const centerPos = this.moveMarker.getLatLng();
      const currentAngle = Math.atan2(markerPos.lat - centerPos.lat, markerPos.lng - centerPos.lng);
      const angleDiff = currentAngle - this.dragStartAngle;
      let newRotation = this.dragStartRotation + (angleDiff * 180 / Math.PI);
      newRotation = ((newRotation % 360) + 360) % 360;
      this.currentRotation = newRotation;
      if (rotationSlider) rotationSlider.value = Math.round(newRotation);
      if (rotationInput) rotationInput.value = Math.round(newRotation);
      this.redraw();
    });
    
    this.rotateMarker.on('dragend', () => {
      this.isDraggingRotate = false;
    });
    
    this.updateRoutePoints();
  }

  deactivate() {
    this.active = false;
    if (this.polyline) { map.removeLayer(this.polyline); this.polyline = null; }
    if (this.moveMarker) { map.removeLayer(this.moveMarker); this.moveMarker = null; }
    if (this.rotateMarker) { map.removeLayer(this.rotateMarker); this.rotateMarker = null; }
  }

  isActive() { return this.active; }

  setRotation(rotation) {
    this.currentRotation = rotation;
    this.redraw();
  }

  setOffset(offsetLat, offsetLng) {
    this.currentOffset = { lat: offsetLat, lng: offsetLng };
    this.redraw();
  }

  redraw() {
    if (!this.active || !this.mapCenter) return;
    // mapCenter 存的是 WGS84，生成前先转当前显示坐标系
    const displayCenter = CoordManager.fromWGS84Point(this.mapCenter.lng, this.mapCenter.lat);
    const points = this.generateShape(displayCenter, this.shapeType, this.currentRotation, this.currentOffset.lat, this.currentOffset.lng);

    // 将生成的点（当前地图坐标系）转换为 WGS84 保存
    routePoints = CoordManager.toWGS84Array(points);

    // 将 WGS84 点转换回当前地图坐标系显示
    const displayPoints = CoordManager.toMapDisplayArray(routePoints);

    if (this.polyline) this.polyline.setLatLngs(displayPoints);

    const bounds = this.polyline.getBounds();
    const centerPoint = bounds.getCenter();
    if (this.moveMarker) this.moveMarker.setLatLng(centerPoint);
    if (this.rotateMarker && this.polyline) {
      const topCenter = this.polyline.getBounds().getNorthWest();
      this.rotateMarker.setLatLng(topCenter);
    }
    updateDistanceInfo();
    updateRouteStatus();
    updateRouteHash();
  }

  updateRoutePoints() {
    if (!this.active || !this.polyline) return;
    // 从 polyline 获取的是当前地图坐标系的点，需要转换为 WGS84
    const rawLatLngs = this.polyline.getLatLngs();
    routePoints = rawLatLngs.map(p => CoordManager.toWGS84Point(p.lng, p.lat));
    updateRouteHash();
  }
}

const shapeManipulator = new ShapeManipulator();

document.getElementById('generateShapeBtn')?.addEventListener('click', () => {
  const rawCenter = map.getCenter();
  const center = CoordManager.parseMapClick(rawCenter.lat, rawCenter.lng);
  const shapeType = document.getElementById('shapeType')?.value || '400m';
  const rotation = parseInt(rotationInput?.value) || 0;
  const offsetLat = parseFloat(document.getElementById('offsetLatInput')?.value) || 0;
  const offsetLng = parseFloat(document.getElementById('offsetLngInput')?.value) || 0;
  
  pushHistory();
  shapeManipulator.activate(center, shapeType, rotation, offsetLat, offsetLng);
  updateMessage(`已生成${shapeType}跑道，拖动中心点可移动`);
  updateDistanceInfo();
  updateRouteStatus();
});

// ==================== 路线编辑模块 ====================

class RouteEditor {
  constructor() {
    this.markers = [];
    this.active = false;
  }

  enable() {
    if (routePoints.length < 2) {
      updateMessage('请先绘制至少2个轨迹点', true);
      return;
    }
    if (routePoints.length > 500) {
      updateMessage('轨迹点超过 500 个，暂不支持逐点编辑，请先平滑或简化路线', true);
      return;
    }
    this.active = true;
    this.renderMarkers();
  }

  disable() {
    this.active = false;
    this.clearMarkers();
  }

  renderMarkers() {
    this.clearMarkers();
    routePoints.forEach((point, index) => {
      const displayLatLng = CoordManager.toMapDisplay(point);
      const marker = L.marker(displayLatLng, {
        draggable: true,
        zIndexOffset: 10000
      }).addTo(map);

      marker.on('drag', () => {
        const newLatLng = marker.getLatLng();
        const wgsPoint = CoordManager.toWGS84Point(newLatLng.lng, newLatLng.lat);
        routePoints[index] = wgsPoint;
        // 编辑拖拽会使平滑预览失效
        smoothedPoints = null;
        if (smoothPolyline) { map.removeLayer(smoothPolyline); smoothPolyline = null; }
        const displayPoints = CoordManager.toMapDisplayArray(routePoints);
        if (polyline) polyline.setLatLngs(displayPoints);
        updateDistanceInfo();
      });

      marker.on('dragend', () => {
        pushHistory();
        updateRouteHash();
      });

      this.markers.push(marker);
    });
  }

  clearMarkers() {
    this.markers.forEach(m => {
      if (m.dragging) m.dragging.disable();
      map.removeLayer(m);
    });
    this.markers = [];
  }
}

const routeEditor = new RouteEditor();

// ==================== 路线平滑模块（优化版）====================

function geoChord(p1, p2) {
  const o = (p1.lat + p2.lat) * Math.PI / 360;
  const l = (p2.lng - p1.lng) * Math.cos(o);
  const c = p2.lat - p1.lat;
  return Math.sqrt(l * l + c * c) || 1e-12;
}

function lerpByT(p1, p2, t1, t2, t) {
  const s = t2 - t1;
  if (Math.abs(s) < 1e-12) return { lat: p1.lat, lng: p1.lng };
  const r = (t - t1) / s;
  return {
    lat: p1.lat + (p2.lat - p1.lat) * r,
    lng: p1.lng + (p2.lng - p1.lng) * r
  };
}

function crPointCentripetal(p0, p1, p2, p3, t, alpha = 0.5) {
  const d0 = Math.pow(geoChord(p0, p1), alpha);
  const d1 = Math.pow(geoChord(p1, p2), alpha);
  const d2 = Math.pow(geoChord(p2, p3), alpha);

  const t0 = 0;
  const t1 = t0 + d0;
  const t2 = t1 + d1;
  const t3 = t2 + d2;

  const tt = t1 + (t2 - t1) * t;

  const a1 = lerpByT(p0, p1, t0, t1, tt);
  const a2 = lerpByT(p1, p2, t1, t2, tt);
  const a3 = lerpByT(p2, p3, t2, t3, tt);

  const b1 = lerpByT(a1, a2, t0, t2, tt);
  const b2 = lerpByT(a2, a3, t1, t3, tt);

  return lerpByT(b1, b2, t1, t2, tt);
}

function smoothRouteCatmullRom(points, isLooped = false, density = 9) {
  if (!points || points.length < 2) return points;
  const pts = points.map(p => ({ lat: p.lat, lng: p.lng }));
  if (pts.length < 3) return pts;

  let controlPoints;
  if (isLooped && pts.length >= 3) {
    controlPoints = [pts[pts.length - 1], ...pts, pts[0], pts[1]];
  } else {
    controlPoints = [pts[0], ...pts, pts[pts.length - 1]];
  }

  const result = [];
  const segmentCount = isLooped ? pts.length : pts.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];

    const distance = haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    const numPoints = Math.max(8, Math.min(40, Math.round(distance / Math.max(1.2, 30 / density))));

    const cpIndex = i + 1;
    const p0 = controlPoints[cpIndex - 1];
    const cp1 = controlPoints[cpIndex];
    const cp2 = controlPoints[cpIndex + 1];
    const p3 = controlPoints[cpIndex + 2];

    for (let j = 0; j < numPoints; j++) {
      const t = j / numPoints;
      result.push(crPointCentripetal(p0, cp1, cp2, p3, t));
    }
  }

  if (isLooped) {
    result.push({ lat: pts[0].lat, lng: pts[0].lng });
  } else {
    result.push({ lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng });
  }

  return result;
}

function simplifyRoute(points, tolerance = 0.00001) {
  if (!points || points.length < 3) return points;

  const perpendicularDistance = (p, p1, p2) => {
    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    if (dx === 0 && dy === 0) return Math.sqrt((p.lng - p1.lng) ** 2 + (p.lat - p1.lat) ** 2);
    const t = ((p.lng - p1.lng) * dx + (p.lat - p1.lat) * dy) / (dx * dx + dy * dy);
    const nearX = p1.lng + t * dx;
    const nearY = p1.lat + t * dy;
    return Math.sqrt((p.lng - nearX) ** 2 + (p.lat - nearY) ** 2);
  };

  // 迭代版 Douglas-Peucker，避免大路线递归栈溢出
  const pts = [...points];
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop();
    if (end - start <= 1) continue;
    let maxDist = 0;
    let maxIndex = -1;
    const p1 = pts[start];
    const p2 = pts[end];
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(pts[i], p1, p2);
      if (dist > maxDist) { maxDist = dist; maxIndex = i; }
    }
    if (maxDist > tolerance && maxIndex !== -1) {
      keep[maxIndex] = true;
      stack.push([start, maxIndex]);
      stack.push([maxIndex, end]);
    }
  }

  return pts.filter((_, i) => keep[i]);
}

function getActivePoints() {
  return smoothedPoints && smoothedPoints.length > 0 ? smoothedPoints : routePoints;
}

function applySmoothing() {
  if (routePoints.length < 3) {
    updateMessage('轨迹点太少，无需平滑', true);
    return;
  }

  if (smoothedPoints && smoothedPoints.length > 0) {
    smoothedPoints = null;
    if (smoothPolyline) {
      map.removeLayer(smoothPolyline);
      smoothPolyline = null;
    }
    const displayPoints = CoordManager.toMapDisplayArray(routePoints);
    if (polyline) polyline.setLatLngs(displayPoints);
    updateMessage('已取消平滑预览');
    updateDistanceInfo();
    return;
  }

  const simplified = simplifyRoute(routePoints, 0.000005);
  smoothedPoints = smoothRouteCatmullRom(simplified, false, 9);

  if (smoothedPoints.length < 3) {
    updateMessage('平滑后轨迹点太少', true);
    smoothedPoints = null;
    return;
  }

  const displayPoints = CoordManager.toMapDisplayArray(smoothedPoints);
  if (smoothPolyline) {
    smoothPolyline.setLatLngs(displayPoints);
  } else {
    smoothPolyline = L.polyline(displayPoints, {
      color: '#3b82f6',
      weight: 3,
      opacity: 0.7,
      dashArray: '8, 4'
    }).addTo(map);
  }

  updateMessage(`平滑预览：${routePoints.length} 控制点 → ${smoothedPoints.length} 平滑点（再次点击取消）`);
  updateDistanceInfo();
}

// ==================== 操作历史记录模块 ====================

const MAX_HISTORY = 50;
let historyStack = [];

function pushHistory() {
  if (routePoints.length === 0) return;
  historyStack.push(JSON.stringify(routePoints));
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
}

function undo() {
  if (historyStack.length === 0) {
    updateMessage('没有可撤销的操作', true);
    return;
  }
  
  routePoints = JSON.parse(historyStack.pop());
  smoothedPoints = null;
  if (smoothPolyline) { map.removeLayer(smoothPolyline); smoothPolyline = null; }
  
  if (polyline) {
    map.removeLayer(polyline);
    const displayPoints = CoordManager.toMapDisplayArray(routePoints);
    polyline = L.polyline(displayPoints, { color: "#ff5722" }).addTo(map);
  } else if (routePoints.length >= 2) {
    const displayPoints = CoordManager.toMapDisplayArray(routePoints);
    polyline = L.polyline(displayPoints, { color: "#ff5722" }).addTo(map);
  }
  
  if (routeEditor.active) routeEditor.renderMarkers();
  if (shapeManipulator.isActive()) shapeManipulator.deactivate();
  
  updateMessage(`已撤销，剩余 ${historyStack.length} 步操作`);
  updateDistanceInfo();
  updateRouteStatus();
  updateRouteHash();
}

// ==================== 路径保存加载模块 ====================

function safeJSONParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

function safeLocalStorageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn('localStorage 写入失败：', e);
    return false;
  }
}

function loadSavedRoutes() {
  const routes = safeJSONParse(localStorage.getItem('savedRoutes') || '{}', {});
  return routes && typeof routes === 'object' && !Array.isArray(routes) ? routes : {};
}

function saveRoute() {
  if (routePoints.length < 2) {
    updateMessage('请先绘制或生成路径', true);
    return;
  }
  
  const routeName = prompt('请输入路径名称：', `路径_${new Date().toLocaleDateString().replace(/\//g, '-')}`);
  if (!routeName) return;
  
  const routes = loadSavedRoutes();
  routes[routeName] = { points: routePoints, savedAt: new Date().toISOString() };
  if (!safeLocalStorageSetItem('savedRoutes', JSON.stringify(routes))) {
    updateMessage('保存失败：浏览器存储空间不足，请删除部分已存路径', true);
    return;
  }
  
  updateMessage(`路径 "${routeName}" 已保存`);
  updateSavedRoutesList();
}

function loadRoute(routeName) {
  const routes = loadSavedRoutes();
  if (!routes[routeName] || !isValidRoutePoints(routes[routeName].points)) {
    updateMessage('路径不存在或数据已损坏', true);
    return;
  }

  pushHistory();
  // 保存的路径点是 WGS84 格式
  routePoints = routes[routeName].points;
  smoothedPoints = null;
  if (smoothPolyline) { map.removeLayer(smoothPolyline); smoothPolyline = null; }

  if (polyline) map.removeLayer(polyline);
  // 将 WGS84 点转换为当前地图坐标系显示
  const displayPoints = CoordManager.toMapDisplayArray(routePoints);
  polyline = L.polyline(displayPoints, { color: "#ff5722" }).addTo(map);
  map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

  shapeManipulator.deactivate();
  routeEditor.disable();
  switchDrawMode('free');

  updateMessage(`已加载路径 "${routeName}"`);
  updateDistanceInfo();
  updateRouteStatus();
  updateRouteHash();
}

function deleteRoute(routeName) {
  if (!confirm(`确定要删除路径 "${routeName}" 吗？`)) return;
  
  const routes = loadSavedRoutes();
  delete routes[routeName];
  if (!safeLocalStorageSetItem('savedRoutes', JSON.stringify(routes))) {
    updateMessage('删除失败：浏览器存储写入失败', true);
    return;
  }
  
  updateMessage(`路径 "${routeName}" 已删除`);
  updateSavedRoutesList();
}

function updateSavedRoutesList() {
  const container = document.getElementById('savedRoutesList');
  if (!container) return;
  
  const routes = loadSavedRoutes();
  const routeNames = Object.keys(routes);
  
  if (routeNames.length === 0) {
    container.innerHTML = '<div style="font-size: 12px; color: #9ca3af; text-align: center; padding: 8px;">暂无保存的路径</div>';
    container.style.border = '1px dashed #e5e7eb';
    return;
  }
  
  container.style.border = 'none';
  container.innerHTML = '';

  for (const name of routeNames) {
    const date = new Date(routes[name].savedAt).toLocaleDateString();
    const item = document.createElement('div');
    item.className = 'saved-route-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'route-name';
    nameSpan.textContent = name;
    nameSpan.addEventListener('click', () => loadRoute(name));
    
    const dateSpan = document.createElement('span');
    dateSpan.className = 'route-date';
    dateSpan.textContent = date;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'route-delete-btn';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', () => deleteRoute(name));
    
    item.appendChild(nameSpan);
    item.appendChild(dateSpan);
    item.appendChild(deleteBtn);
    container.appendChild(item);
  }
}

document.getElementById('saveRouteBtn')?.addEventListener('click', saveRoute);
updateSavedRoutesList();

// ==================== 路线数据模块 ====================

let routePoints = [];
let polyline = null;
let smoothedPoints = null;
let smoothPolyline = null;
let paceChart = null;
let hrChart = null;
let altChart = null;

function updateMessage(text, isError = false) {
  const el = document.getElementById("message");
  el.textContent = text || "";
  el.className = "message" + (isError ? " error" : "");
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDistanceMeters(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng);
  }
  return total;
}

function fitText(el) {
  const maxWidth = (el.parentElement ? el.parentElement.clientWidth - 24 : 260) || 200;
  const curSize = parseFloat(getComputedStyle(el).fontSize) || 22;
  if (maxWidth <= 16) return;
  const testSize = curSize;
  el.style.fontSize = testSize + 'px';
  if (el.scrollWidth > maxWidth) {
    const ratio = Math.min(0.92, (maxWidth / el.scrollWidth) * 0.92);
    el.style.fontSize = Math.max(9, Math.round(testSize * ratio)) + 'px';
  } else {
    el.style.fontSize = '';
  }
}

function updateDistanceInfo() {
  const el = document.getElementById("distanceInfo");
  if (!el) return;
  if (!routePoints || routePoints.length < 2) {
    el.textContent = "总距离约：0 公里";
    fitText(el);
    return;
  }
  const baseMeters = computeDistanceMeters(routePoints);
  const baseKm = baseMeters / 1000;
  const lapInput = document.getElementById("lapCount");
  const laps = Math.max(0.1, parseFloat(lapInput?.value) || 1);
  const totalKm = baseKm * laps;

  let smoothInfo = '';
  if (smoothedPoints && smoothedPoints.length > 0) {
    const smoothMeters = computeDistanceMeters(smoothedPoints);
    const smoothKm = smoothMeters / 1000;
    smoothInfo = ` | 平滑：${smoothKm.toFixed(2)} km`;
  }

  el.textContent = laps > 1
    ? `总距离约：${totalKm.toFixed(2)} 公里（基础：${baseKm.toFixed(2)} km × ${laps} 圈）${smoothInfo}`
    : `总距离约：${baseKm.toFixed(2)} 公里${smoothInfo}`;
  fitText(el);
}

map.on("click", (e) => {
  if (currentDrawMode === 'shape' || shapeManipulator.isActive()) return;

  if (isEditMode) {
    return;
  }

  if (routeEditor.active) {
    return;
  }

  if (routePoints.length > 0) pushHistory();

  // 地图点击加点会使平滑预览失效
  smoothedPoints = null;
  if (smoothPolyline) { map.removeLayer(smoothPolyline); smoothPolyline = null; }

  // 将地图点击坐标（当前地图坐标系）转换为 WGS84 保存
  const wgsPoint = CoordManager.parseMapClick(e.latlng.lat, e.latlng.lng);
  routePoints.push(wgsPoint);

  updateRouteDisplay();
  updateMessage(`已添加点数：${routePoints.length}`);
});

function updateRouteStatus() {
  const statusEl = document.getElementById('routeStatus');
  if (!statusEl) return;
  
  if (routePoints.length < 2) {
    statusEl.textContent = '路线状态：未闭合';
    return;
  }
  
  const first = routePoints[0];
  const last = routePoints[routePoints.length - 1];
  const distance = haversineDistance(first.lat, first.lng, last.lat, last.lng);
  
  statusEl.textContent = distance < 5
    ? `路线状态：已闭合（${routePoints.length}个点）`
    : `路线状态：未闭合（${routePoints.length}个点）`;
}

function clearRoute() {
  if (routePoints.length === 0) return;
  if (!confirm('确定要清空当前路线吗？')) return;
  pushHistory();
  smoothedPoints = null;
  if (smoothPolyline) { map.removeLayer(smoothPolyline); smoothPolyline = null; }
  routePoints = [];
  if (polyline) { map.removeLayer(polyline); polyline = null; }
  shapeManipulator.deactivate();
  routeEditor.disable();
  updateMessage("轨迹已清空，可点击撤销恢复");
  updateDistanceInfo();
  updateRouteStatus();
  updateRouteHash();
}

function updateRouteDisplay() {
  const displayPoints = CoordManager.toMapDisplayArray(routePoints);
  if (polyline) {
    polyline.setLatLngs(displayPoints);
  } else {
    polyline = L.polyline(displayPoints, { color: "#ff5722" }).addTo(map);
  }
  updateDistanceInfo();
  updateRouteStatus();
  updateRouteHash();
}

function closeRoute() {
  if (routePoints.length < 2) { updateMessage('至少需要两个点才能闭合', true); return; }
  const first = routePoints[0];
  const last = routePoints[routePoints.length - 1];
  const d = haversineDistance(first.lat, first.lng, last.lat, last.lng);
  if (d < 5) { updateMessage('路线已经闭合'); return; }
  pushHistory();
  routePoints.push({ lat: first.lat, lng: first.lng });
  updateMessage('路线已闭合');
  updateRouteDisplay();
}

function fitRouteToMap() {
  if (routePoints.length < 2 || !polyline) {
    updateMessage('当前没有路线', true);
    return;
  }
  map.fitBounds(polyline.getBounds().pad(0.1));
}

function reverseRoute() {
  if (routePoints.length < 2) { updateMessage('至少需要两个点才能反跑', true); return; }
  pushHistory();
  routePoints.reverse();
  smoothedPoints = null;
  if (smoothPolyline) { map.removeLayer(smoothPolyline); smoothPolyline = null; }
  updateMessage('路线方向已反转');
  updateRouteDisplay();
}

function encodePolylineValue(v) {
  if (v < 0) { v = ~(v << 1); }
  else { v = v << 1; }
  let result = '';
  while (v >= 0x20) {
    result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  result += String.fromCharCode(v + 63);
  return result;
}

function encodePolyline(points) {
  let result = '';
  let prevLat = 0, prevLng = 0;
  for (const p of points) {
    const dLat = Math.round(p.lat * 1e6) - prevLat;
    const dLng = Math.round(p.lng * 1e6) - prevLng;
    prevLat += dLat;
    prevLng += dLng;
    result += encodePolylineValue(dLat);
    result += encodePolylineValue(dLng);
  }
  return 'E' + result;
}

function decodePolyline(encoded) {
  const points = [];
  let index = 1;
  let prevLat = 0, prevLng = 0;
  const len = encoded.length;
  while (index < len) {
    let shift = 0, byte = 0, result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    let lat = (result & 1) ? ~(result >> 1) : (result >> 1);
    prevLat += lat;

    shift = 0; byte = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    let lng = (result & 1) ? ~(result >> 1) : (result >> 1);
    prevLng += lng;

    points.push({ lat: prevLat / 1e6, lng: prevLng / 1e6 });
  }
  return points;
}

function updateRouteHash() {
  if (routePoints.length > 0) {
    history.replaceState(null, '', '#' + encodePolyline(routePoints));
  } else if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function isValidRoutePoints(points) {
  if (!Array.isArray(points) || points.length < 2) return false;
  for (const p of points) {
    if (!p || typeof p !== 'object') return false;
    if (typeof p.lat !== 'number' || !Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90) return false;
    if (typeof p.lng !== 'number' || !Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180) return false;
  }
  return true;
}

function loadRouteFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  try {
    let points;
    if (hash[0] === 'E') {
      points = decodePolyline(hash);
    } else {
      points = JSON.parse(atob(hash));
    }
    if (isValidRoutePoints(points)) {
      routePoints = points;
      smoothedPoints = null;
      if (smoothPolyline) { map.removeLayer(smoothPolyline); smoothPolyline = null; }
      const displayPoints = CoordManager.toMapDisplayArray(routePoints);
      if (polyline) polyline.setLatLngs(displayPoints);
      else polyline = L.polyline(displayPoints, { color: "#ff5722" }).addTo(map);
      map.fitBounds(polyline.getBounds().pad(0.1));
      updateMessage(`已加载 URL 中的路线（${points.length} 个点）`);
      updateDistanceInfo();
      updateRouteStatus();
    }
  } catch (e) { /* ignore invalid hash */ }
}

let isGenerating = false;

function exportGPX() {
  const points = getActivePoints();
  if (points.length < 2) { updateMessage('请先绘制路线', true); return; }
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk><name>FitTool Route</name><trkseg>\n';
  for (const p of points) {
    xml += `    <trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>\n`;
  }
  xml += '  </trkseg></trk>\n</gpx>';
  const blob = new Blob([xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'route.gpx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  updateMessage('路线已导出为 GPX');
}

function importGPX(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(e.target.result, 'text/xml');
      const parseError = xml.querySelector('parsererror');
      if (parseError) { updateMessage('GPX 文件解析失败', true); return; }
      const trkpts = xml.querySelectorAll('trkpt');
      if (!trkpts.length) { updateMessage('GPX 文件中未找到轨迹点', true); return; }
      const points = [];
      trkpts.forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) points.push({ lat, lng: lon });
      });
      if (points.length < 2) { updateMessage(`GPX 文件有效轨迹点不足（${points.length}）`, true); return; }
      pushHistory();
      routePoints = points;
      smoothedPoints = null;
      if (smoothPolyline) { map.removeLayer(smoothPolyline); smoothPolyline = null; }
      const displayPoints = CoordManager.toMapDisplayArray(routePoints);
      if (polyline) polyline.setLatLngs(displayPoints);
      else polyline = L.polyline(displayPoints, { color: "#ff5722" }).addTo(map);
      map.fitBounds(polyline.getBounds().pad(0.1));
      updateMessage(`已导入 ${points.length} 个轨迹点`);
      updateDistanceInfo();
      updateRouteStatus();
      updateRouteHash();
    } catch (err) {
      updateMessage('导入 GPX 失败: ' + err.message, true);
    }
  };
  reader.onerror = () => updateMessage('文件读取失败', true);
  reader.readAsText(file);
}

function calculateLapsByDistance() {
  if (routePoints.length < 2) {
    updateMessage("请先绘制路线", true);
    return;
  }
  
  const baseMeters = computeDistanceMeters(routePoints);
  const baseKm = baseMeters / 1000;
  const targetDistance = parseFloat(document.getElementById('targetDistance')?.value);
  
  if (isNaN(targetDistance) || targetDistance <= 0) {
    updateMessage("请输入有效的目标距离", true);
    return;
  }
  if (!Number.isFinite(baseKm) || baseKm <= 0) {
    updateMessage("当前路线距离为 0，无法计算圈数", true);
    return;
  }
  
  const requiredLaps = targetDistance / baseKm;
  const lapEl = document.getElementById('lapCount');
  if (lapEl) lapEl.value = requiredLaps.toFixed(2);
  
  updateMessage(`按目标距离 ${targetDistance} 公里计算，需要 ${requiredLaps.toFixed(2)} 圈`);
  updateDistanceInfo();
}

document.getElementById('undoBtn')?.addEventListener('click', undo);
document.getElementById('fitBtn')?.addEventListener('click', fitRouteToMap);
document.getElementById('clearRoute')?.addEventListener('click', clearRoute);
document.getElementById('closeRouteBtn')?.addEventListener('click', closeRoute);
document.getElementById('reverseBtn')?.addEventListener('click', reverseRoute);
document.getElementById('calculateLapsBtn')?.addEventListener('click', calculateLapsByDistance);
document.getElementById('smoothBtn')?.addEventListener('click', applySmoothing);
document.getElementById('lapCount')?.addEventListener('input', updateDistanceInfo);
document.getElementById('exportGpxBtn')?.addEventListener('click', exportGPX);
document.getElementById('importGpxBtn')?.addEventListener('click', () => document.getElementById('gpxFileInput')?.click());
document.getElementById('gpxFileInput')?.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) { importGPX(e.target.files[0]); e.target.value = ''; }
});

function dateToLocalInputValue(d) {
  const tzOffset = d.getTimezoneOffset();
  return new Date(d.getTime() - tzOffset * 60000).toISOString().slice(0, 16);
}

function rebuildExportTimes() {
  const container = document.getElementById("exportTimes");
  const exportInput = document.getElementById("exportCount");
  if (!container || !exportInput) return;
  
  const count = Math.max(1, Math.min(10, parseInt(exportInput.value, 10) || 1));
  const now = new Date();
  container.innerHTML = "";
  
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "export-time-row";
    row.innerHTML = `
      <div class="export-row-1">
        <span>第 ${i + 1} 份</span>
        <input type="datetime-local" class="export-time-input" data-index="${i}" value="${dateToLocalInputValue(new Date(now.getTime() + i * 24 * 60 * 60 * 1000))}">
      </div>
      <div class="export-row-2">
        <span class="pace-label">配速:</span>
        <input type="number" class="export-pace-min" min="0" step="0.1" value="5">
        <span>分</span>
        <input type="number" class="export-pace-sec" min="0" max="59.9" step="0.1" value="10">
        <span>秒/km</span>
      </div>
    `;
    container.appendChild(row);
  }
}

// ==================== 运动类型 / 训练模式 UI 联动 ====================

const SPORT_NAME_PREFIXES = {
  '户外跑步': 'outdoor-run',
  '室内跑步': 'indoor-run',
  '跑步机': 'treadmill',
  '越野跑': 'trail-run',
  '操场跑': 'track-run',
  '障碍跑': 'obstacle-run',
  '虚拟跑步': 'virtual-run',
  '健走': 'walk',
};

const OFFICIAL_MANUFACTURERS = [
  [1, 'GARMIN'], [2, 'GARMIN_FR405_ANTFS'], [3, 'ZEPHYR'], [4, 'DAYTON'], [5, 'IDT'], [6, 'SRM'],
  [7, 'QUARQ'], [8, 'IBIKE'], [9, 'SARIS'], [10, 'SPARK_HK'], [11, 'TANITA'], [12, 'ECHOWELL'],
  [13, 'DYNASTREAM_OEM'], [14, 'NAUTILUS'], [15, 'DYNASTREAM'], [16, 'TIMEX'], [17, 'METRIGEAR'],
  [18, 'XELIC'], [19, 'BEURER'], [20, 'CARDIOSPORT'], [21, 'A_AND_D'], [22, 'HMM'], [23, 'SUUNTO'],
  [24, 'THITA_ELEKTRONIK'], [25, 'GPULSE'], [26, 'CLEAN_MOBILE'], [27, 'PEDAL_BRAIN'], [28, 'PEAKSWARE'],
  [29, 'SAXONAR'], [30, 'LEMOND_FITNESS'], [31, 'DEXCOM'], [32, 'WAHOO_FITNESS'], [33, 'OCTANE_FITNESS'],
  [34, 'ARCHINOETICS'], [35, 'THE_HURT_BOX'], [36, 'CITIZEN_SYSTEMS'], [37, 'MAGELLAN'], [38, 'OSYNCE'],
  [39, 'HOLUX'], [40, 'CONCEPT2'], [41, 'SHIMANO'], [42, 'ONE_GIANT_LEAP'], [43, 'ACE_SENSOR'],
  [44, 'BRIM_BROTHERS'], [45, 'XPLOVA'], [46, 'PERCEPTION_DIGITAL'], [47, 'BF1SYSTEMS'], [48, 'PIONEER'],
  [49, 'SPANTEC'], [50, 'METALOGICS'], [51, '_4IIIIS'], [52, 'SEIKO_EPSON'], [53, 'SEIKO_EPSON_OEM'],
  [54, 'IFOR_POWELL'], [55, 'MAXWELL_GUIDER'], [56, 'STAR_TRAC'], [57, 'BREAKAWAY'],
  [58, 'ALATECH_TECHNOLOGY_LTD'], [59, 'MIO_TECHNOLOGY_EUROPE'], [60, 'ROTOR'], [61, 'GEONAUTE'],
  [62, 'ID_BIKE'], [63, 'SPECIALIZED'], [64, 'WTEK'], [65, 'PHYSICAL_ENTERPRISES'],
  [66, 'NORTH_POLE_ENGINEERING'], [67, 'BKOOL'], [68, 'CATEYE'], [69, 'STAGES_CYCLING'], [70, 'SIGMASPORT'],
  [71, 'TOMTOM'], [72, 'PERIPEDAL'], [73, 'WATTBIKE'], [76, 'MOXY'], [77, 'CICLOSPORT'], [78, 'POWERBAHN'],
  [79, 'ACORN_PROJECTS_APS'], [80, 'LIFEBEAM'], [81, 'BONTRAGER'], [82, 'WELLGO'], [83, 'SCOSCHE'],
  [84, 'MAGURA'], [85, 'WOODWAY'], [86, 'ELITE'], [87, 'NIELSEN_KELLERMAN'], [88, 'DK_CITY'], [89, 'TACX'],
  [90, 'DIRECTION_TECHNOLOGY'], [91, 'MAGTONIC'], [92, '_1PARTCARBON'], [93, 'INSIDE_RIDE_TECHNOLOGIES'],
  [94, 'SOUND_OF_MOTION'], [95, 'STRYD'], [96, 'ICG'], [97, 'MIPULSE'], [98, 'BSX_ATHLETICS'], [99, 'LOOK'],
  [100, 'CAMPAGNOLO_SRL'], [101, 'BODY_BIKE_SMART'], [102, 'PRAXISWORKS'], [103, 'LIMITS_TECHNOLOGY'],
  [104, 'TOPACTION_TECHNOLOGY'], [105, 'COSINUSS'], [106, 'FITCARE'], [107, 'MAGENE'],
  [108, 'GIANT_MANUFACTURING_CO'], [109, 'TIGRASPORT'], [110, 'SALUTRON'], [111, 'TECHNOGYM'],
  [112, 'BRYTON_SENSORS'], [113, 'LATITUDE_LIMITED'], [114, 'SOARING_TECHNOLOGY'], [115, 'IGPSPORT'],
  [116, 'THINKRIDER'], [117, 'GOPHER_SPORT'], [118, 'WATERROWER'], [119, 'ORANGETHEORY'], [120, 'INPEAK'],
  [121, 'KINETIC'], [122, 'JOHNSON_HEALTH_TECH'], [123, 'POLAR_ELECTRO'], [124, 'SEESENSE'],
  [125, 'NCI_TECHNOLOGY'], [126, 'IQSQUARE'], [127, 'LEOMO'], [128, 'IFIT_COM'], [129, 'COROS_BYTE'],
  [130, 'VERSA_DESIGN'], [131, 'CHILEAF'], [132, 'CYCPLUS'], [133, 'GRAVAA_BYTE'], [134, 'SIGEYI'],
  [135, 'COOSPO'], [136, 'GEOID'], [137, 'BOSCH'], [138, 'KYTO'], [139, 'KINETIC_SPORTS'],
  [140, 'DECATHLON_BYTE'], [141, 'TQ_SYSTEMS'], [142, 'TAG_HEUER'], [143, 'KEISER_FITNESS'],
  [144, 'ZWIFT_BYTE'], [145, 'PORSCHE_EP'], [146, 'BLACKBIRD'], [147, 'MEILAN_BYTE'], [148, 'EZON'],
  [149, 'LAISI'], [150, 'MYZONE'], [151, 'ABAWO'], [152, 'BAFANG'], [153, 'LUHONG_TECHNOLOGY'],
  [255, 'DEVELOPMENT'], [257, 'HEALTHANDLIFE'], [258, 'LEZYNE'], [259, 'SCRIBE_LABS'], [260, 'ZWIFT'],
  [261, 'WATTEAM'], [262, 'RECON'], [263, 'FAVERO_ELECTRONICS'], [264, 'DYNOVELO'], [265, 'STRAVA'],
  [266, 'PRECOR'], [267, 'BRYTON'], [268, 'SRAM'], [269, 'NAVMAN'], [270, 'COBI'], [271, 'SPIVI'],
  [272, 'MIO_MAGELLAN'], [273, 'EVESPORTS'], [274, 'SENSITIVUS_GAUGE'], [275, 'PODOON'],
  [276, 'LIFE_TIME_FITNESS'], [277, 'FALCO_E_MOTORS'], [278, 'MINOURA'], [279, 'CYCLIQ'], [280, 'LUXOTTICA'],
  [281, 'TRAINER_ROAD'], [282, 'THE_SUFFERFEST'], [283, 'FULLSPEEDAHEAD'], [284, 'VIRTUALTRAINING'],
  [285, 'FEEDBACKSPORTS'], [286, 'OMATA'], [287, 'VDO'], [288, 'MAGNETICDAYS'], [289, 'HAMMERHEAD'],
  [290, 'KINETIC_BY_KURT'], [291, 'SHAPELOG'], [292, 'DABUZIDUO'], [293, 'JETBLACK'], [294, 'COROS'],
  [295, 'VIRTUGO'], [296, 'VELOSENSE'], [297, 'CYCLIGENTINC'], [298, 'TRAILFORKS'],
  [299, 'MAHLE_EBIKEMOTION'], [300, 'NURVV'], [301, 'MICROPROGRAM'], [302, 'ZONE5CLOUD'], [303, 'GREENTEG'],
  [304, 'YAMAHA_MOTORS'], [305, 'WHOOP'], [306, 'GRAVAA'], [307, 'ONELAP'], [308, 'MONARK_EXERCISE'],
  [309, 'FORM'], [310, 'DECATHLON'], [311, 'SYNCROS'], [312, 'HEATUP'], [313, 'CANNONDALE'],
  [314, 'TRUE_FITNESS'], [315, 'RGT_CYCLING'], [316, 'VASA'], [317, 'RACE_REPUBLIC'], [318, 'FAZUA'],
  [319, 'OREKA_TRAINING'], [320, 'LSEC'], [321, 'LULULEMON_STUDIO'], [322, 'SHANYUE'], [323, 'SPINNING_MDA'],
  [324, 'HILLDATING'], [325, 'AERO_SENSOR'], [326, 'NIKE'], [327, 'MAGICSHINE'], [328, 'ICTRAINER'],
  [329, 'ABSOLUTE_CYCLING'], [330, 'EO_SWIMBETTER'], [331, 'MYWHOOSH'], [332, 'RAVEMEN'],
  [333, 'TEKTRO_RACING_PRODUCTS'], [334, 'DARAD_INNOVATION_CORPORATION'], [335, 'CYCLOPTIM'], [337, 'RUNNA'],
  [339, 'ZEPP'], [340, 'PELOTON'], [341, 'CARV'], [342, 'TISSOT'], [345, 'REAL_VELO'], [5759, 'ACTIGRAPHCORP'],
  [65535, 'INVALID'],
];

function syncDeviceUI() {
  const customInput = document.getElementById("customManufacturer");
  if (!customInput) return;
  customInput.style.display =
    document.getElementById("deviceBrandSelect")?.value === "custom" ? "block" : "none";
}

function resolveDeviceTypeFromUI() {
  const brand = document.getElementById("deviceBrandSelect")?.value;
  if (brand === "custom") {
    const n = parseInt(document.getElementById("customManufacturer")?.value, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 65535) return n;
    return undefined;
  }
  return brand || undefined;
}

function renderManufacturerTable(kw) {
  const tbody = document.getElementById('manufacturerTableBody');
  if (!tbody) return;
  const q = String(kw || '').trim().toLowerCase();
  tbody.innerHTML = OFFICIAL_MANUFACTURERS
    .filter(([id, name]) => !q || String(id).includes(q) || name.toLowerCase().includes(q))
    .map(([id, name]) => `<div class="mfg-cell" data-id="${id}" title="点击填入自定义"><span class="mfg-id">${id}</span><span class="mfg-name">${name}</span></div>`)
    .join('');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function openManufacturerModal() {
  const modal = document.getElementById('manufacturerModal');
  if (!modal) return;
  renderManufacturerTable(document.getElementById('manufacturerSearch')?.value || '');
  modal.classList.add('active');
}

function fillManufacturerFromTable(id) {
  const sel = document.getElementById("deviceBrandSelect");
  if (sel) sel.value = "custom";
  const inp = document.getElementById("customManufacturer");
  if (inp) inp.value = id;
  syncDeviceUI();
  closeManufacturerModal();
}

document.getElementById('manufacturerTableBody')?.addEventListener('click', (e) => {
  const cell = e.target.closest('.mfg-cell');
  if (!cell) return;
  const id = parseInt(cell.dataset.id, 10);
  if (Number.isFinite(id)) fillManufacturerFromTable(id);
});

function closeManufacturerModal() {
  document.getElementById('manufacturerModal')?.classList.remove('active');
}

document.getElementById('manufacturerTableBtn')?.addEventListener('click', openManufacturerModal);
document.getElementById('manufacturerModalClose')?.addEventListener('click', closeManufacturerModal);
document.getElementById('manufacturerSearch')?.addEventListener('input', debounce((e) => renderManufacturerTable(e.target.value), 300));
document.getElementById('deviceBrandSelect')?.addEventListener('change', syncDeviceUI);
document.getElementById('manufacturerModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'manufacturerModal') closeManufacturerModal();
});

function collectSharedParams() {
  const sportType = document.getElementById("sportTypeSelect")?.value || "running";
  let sportName = document.getElementById("sportNameSelect")?.value || (sportType === "walking" ? "健走" : "跑步");
  if (sportName === "自定义") {
    sportName = prompt("请输入自定义运动名称：", sportType === "walking" ? "健走" : "跑步") || (sportType === "walking" ? "健走" : "跑步");
    const nameSel = document.getElementById("sportNameSelect");
    if (nameSel) nameSel.value = sportName;
  }
  return {
    sportType,
    heightCm: Number(document.getElementById("heightInput")?.value) || 170,
    deviceType: resolveDeviceTypeFromUI(),
    sportName,
    fitSubSport: document.getElementById("fitSubSportSelect")?.value || "generic",
    customSubSport: document.getElementById("customSubSport")?.value || undefined,
    workoutMode: document.getElementById("workoutModeSelect")?.value || "steady",
    intervalReps: parseInt(document.getElementById("intervalReps")?.value) || 4,
    intervalFastKm: parseFloat(document.getElementById("intervalFastKm")?.value) || 0.4,
    elapsedExtraSeconds: parseInt(document.getElementById("elapsedExtraInput")?.value) || 0,
    format: document.getElementById("exportFormatSelect")?.value || "fit",
  };
}

function filePrefixFor(shared) {
  if (shared.sportType === "walking") return "walk";
  return SPORT_NAME_PREFIXES[shared.sportName] || "run";
}

function syncWorkoutUI() {
  const interval = document.getElementById("workoutModeSelect")?.value === "interval";
  const cfg = document.getElementById("intervalConfig");
  if (cfg) cfg.style.display = interval ? "block" : "none";
}

function syncSportTypeUI() {
  const walking = document.getElementById("sportTypeSelect")?.value === "walking";
  const cadenceInput = document.getElementById("avgCadence");
  if (walking) {
    if (!cadenceInput?.value || Number(cadenceInput.value) === 170) cadenceInput.value = 100;
  } else if (Number(cadenceInput?.value) === 100) {
    cadenceInput.value = 170;
  }
  const hrInputs = [document.getElementById("hrRest"), document.getElementById("hrMax")];
  hrInputs.forEach(el => {
    if (el && el.parentElement) el.parentElement.style.display = walking ? "none" : "";
  });
  const hrCheck = document.getElementById("includeHeartRate");
  if (hrCheck) {
    const wrapper = hrCheck.closest("label.checkbox-label");
    if (wrapper) wrapper.style.display = walking ? "none" : "";
  }
  document.querySelectorAll(".export-row-2").forEach(row => {
    row.style.display = walking ? "none" : "";
  });
  const nameSel = document.getElementById("sportNameSelect");
  if (walking && nameSel && nameSel.value !== "健走") nameSel.value = "健走";
  if (!walking && nameSel && nameSel.value === "健走") nameSel.value = "跑步";
}

document.getElementById("sportTypeSelect")?.addEventListener("change", syncSportTypeUI);
document.getElementById("workoutModeSelect")?.addEventListener("change", syncWorkoutUI);
document.getElementById("intervalExampleSelect")?.addEventListener("change", (e) => {
  const [reps, fastKm] = e.target.value.split("x");
  const repsInput = document.getElementById("intervalReps");
  const fastInput = document.getElementById("intervalFastKm");
  if (repsInput) repsInput.value = reps;
  if (fastInput) fastInput.value = fastKm;
});

// ==================== FIT文件生成模块 ====================

async function generateFit() {
  if (routePoints.length < 2) {
    updateMessage("请至少在地图上选择两个点形成轨迹", true);
    return;
  }
  if (isGenerating) return;
  
  const hrRest = parseInt(document.getElementById("hrRest")?.value) || 60;
  const hrMax = parseInt(document.getElementById("hrMax")?.value) || 180;
  const lapCount = Math.max(0.1, parseFloat(document.getElementById("lapCount")?.value) || 1);
  const exportCount = Math.max(1, Math.min(10, parseInt(document.getElementById("exportCount")?.value) || 1));
  const shared = collectSharedParams();
  const walking = shared.sportType === "walking";
  const fileExt = shared.format === "fit" ? "fit" : shared.format;
  const filePrefix = filePrefixFor(shared);
  
  const timeInputs = document.querySelectorAll(".export-time-input");
  const paceMinInputs = document.querySelectorAll(".export-pace-min");
  const paceSecInputs = document.querySelectorAll(".export-pace-sec");
  
  const baseMeters = computeDistanceMeters(routePoints);
  const totalKm = (baseMeters / 1000) * lapCount;
  
  if (totalKm > 210) {
    updateMessage(`总距离不能超过 210 公里，当前 ${totalKm.toFixed(2)} 公里`, true);
    return;
  }
  
  isGenerating = true;
  document.getElementById("generateFit").disabled = true;
  document.getElementById("previewBtn").disabled = true;
  
  showGeneratingModal(`正在生成 ${fileExt.toUpperCase()} 文件...`);
  
  const tzOffset = -new Date().getTimezoneOffset();
  const tzSign = tzOffset >= 0 ? '+' : '-';
  const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
  const tzMins = String(Math.abs(tzOffset) % 60).padStart(2, '0');
  const tzSuffix = `${tzSign}${tzHours}:${tzMins}`;
  
  let successCount = 0;
  let failCount = 0;
  let lastError = '';
  let lastElevationInfo = null;
  const fitBlobs = [];
  const activePoints = getActivePoints();
  const elevationSource = document.getElementById("elevationSourceSelect")?.value || 'open-elevation';
  
  try {
    showGeneratingModal(`正在获取海拔（${elevationSource}）...`);
    const elevation = await fetchAltitudesClient(activePoints, elevationSource);
    lastElevationInfo = elevation;
    
    for (let i = 0; i < exportCount; i++) {
      updateGeneratingModal(`正在生成第 ${i + 1}/${exportCount} 个 ${fileExt.toUpperCase()} 文件...`);
      
      const inputVal = timeInputs[i]?.value;
      if (!inputVal || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inputVal)) {
        failCount++;
        lastError = `第 ${i + 1} 份开始时间无效`;
        continue;
      }
      const startTime = `${inputVal}:00${tzSuffix}`;
      
      const pm = parseFloat(paceMinInputs[i]?.value) || 0;
      const ps = parseFloat(paceSecInputs[i]?.value) || 0;
      const filePaceSecondsPerKm = walking ? 720 : pm * 60 + ps;

      if (!walking && (!filePaceSecondsPerKm || filePaceSecondsPerKm <= 0)) {
        failCount++;
        lastError = `第 ${i + 1} 分配速无效`;
        continue;
      }
      
      const weightKg = Number(document.getElementById("weightInput")?.value) || 65;
      const powerFactor = parseFloat(document.getElementById("powerFactor")?.value) || 1.3;
      const gpsDrift = parseFloat(document.getElementById("gpsDrift")?.value) || 0;
      const avgCadence = parseInt(document.getElementById("avgCadence")?.value) || (walking ? 100 : 170);
      const includeHeartRate = (walking ? false : document.getElementById("includeHeartRate")?.checked) ?? true;
      const includePower = document.getElementById("includePower")?.checked ?? true;
      const includeCadence = document.getElementById("includeCadence")?.checked ?? true;
      const includeGaitData = document.getElementById("includeGaitData")?.checked ?? true;
      
      try {
        const res = await fetch("/api/generate-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime,
            points: activePoints,
            paceSecondsPerKm: filePaceSecondsPerKm,
            hrRest, hrMax, lapCount, variantIndex: i + 1,
            weightKg, powerFactor, gpsDrift, avgCadence,
            elevationSource,
            altitudes: elevation.altitudes,
            includeHeartRate, includePower, includeCadence, includeGaitData,
            sportType: shared.sportType,
            heightCm: shared.heightCm,
            deviceType: shared.deviceType,
            sportName: shared.sportName,
            fitSubSport: shared.fitSubSport,
            customSubSport: shared.customSubSport,
            workoutMode: shared.workoutMode,
            intervalReps: shared.intervalReps,
            intervalFastKm: shared.intervalFastKm,
            elapsedExtraSeconds: shared.elapsedExtraSeconds,
            format: shared.format
          })
        });
        
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          failCount++;
          lastError = err.error || `第 ${i + 1} 份生成失败`;
          continue;
        }
        
        const blob = await res.blob();
        fitBlobs.push({ blob, name: `${filePrefix}_${i + 1}.${fileExt}` });
        successCount++;
      } catch (e) {
        failCount++;
        lastError = `第 ${i + 1} 份请求异常: ${e.message}`;
      }
    }
    
    const zipPack = document.getElementById('zipPackCheck')?.checked;
    if (fitBlobs.length > 1 && zipPack && typeof JSZip !== 'undefined') {
      updateGeneratingModal('正在打包 ZIP 文件...');
      const zip = new JSZip();
      for (const { blob, name } of fitBlobs) {
        zip.file(name, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'routes.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } else {
      for (const { blob, name } of fitBlobs) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    }
    
    const summary = successCount > 0
      ? `已生成 ${successCount} 个 ${fileExt.toUpperCase()} 文件${failCount > 0 ? `，${failCount} 个失败` : ''}`
      : `生成失败${lastError ? '：' + lastError : ''}`;
    
    updateGeneratingModal(
      summary,
      failCount === 0 && shared.format === 'fit'
        ? `请前往「Keep App → 我的 → 我的数据 → 运动数据同步 → 运动数据文件导入」选择文件上传<br><br>点击左上角图标可赞赏支持开源项目`
        : (failCount === 0 ? '文件已下载，点击左上角图标可赞赏支持开源项目' : lastError)
    );
    updateMessage(summary);
    setElevationStatus(lastElevationInfo);
    
    if (successCount > 0) {
      scheduleGeneratingClose(5);
    } else {
      scheduleGeneratingClose(3);
    }
  } catch (e) {
    console.error(e);
    const msg = e?.message || e;
    updateGeneratingModal(`生成失败：${msg}`, msg);
    updateMessage(`生成失败：${msg}`, true);
    setElevationStatus(lastElevationInfo);
    scheduleGeneratingClose(3);
  } finally {
    isGenerating = false;
    document.getElementById("generateFit").disabled = false;
    document.getElementById("previewBtn").disabled = false;
  }
}

document.getElementById("generateFit")?.addEventListener("click", generateFit);
document.getElementById("exportCount")?.addEventListener("input", rebuildExportTimes);

updateDistanceInfo();
rebuildExportTimes();
loadRouteFromHash();

// ==================== 运动预览功能模块 ====================

function renderPreviewStats(preview) {
  const samples = preview.samples || [];
  const n = samples.length;
  if (!n) return;

  const stats = preview.stats || null;
  const totalDist = preview.totalDistanceMeters || 0;
  const totalSec = preview.totalDurationSec || 0;
  const calories = preview.calories || 0;

  let sumHr = 0, sumCadence = 0, sumPower = 0;
  let sumGround = 0, sumFlight = 0, sumVert = 0, sumSpeed = 0;
  let hrCount = 0, cadCount = 0, powerCount = 0;
  let groundCount = 0, flightCount = 0, vertCount = 0, speedCount = 0;
  let sumAltitude = 0, altCount = 0, totalAscent = 0, totalDescent = 0;
  let maxAlt = -Infinity, minAlt = Infinity;

  for (const s of samples) {
    if (s.heartRate) { sumHr += s.heartRate; hrCount++; }
    if (s.cadence) { sumCadence += s.cadence; cadCount++; }
    if (s.power) { sumPower += s.power; powerCount++; }
    if (s.groundTime) { sumGround += s.groundTime; groundCount++; }
    if (s.flightTime) { sumFlight += s.flightTime; flightCount++; }
    if (s.verticalOscillation) { sumVert += s.verticalOscillation; vertCount++; }
    if (s.speed) { sumSpeed += s.speed; speedCount++; }
    if (typeof s.altitude === 'number') {
      sumAltitude += s.altitude; altCount++;
      if (s.altitude > maxAlt) maxAlt = s.altitude;
      if (s.altitude < minAlt) minAlt = s.altitude;
    }
  }

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i].altitude;
    const b = samples[i - 1].altitude;
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const diff = a - b;
    if (diff > 0) totalAscent += diff;
    else totalDescent += Math.abs(diff);
  }

  const avgSpeed = speedCount ? sumSpeed / speedCount : 0;
  const avgPaceSecPerKm = avgSpeed > 0 ? 1000 / avgSpeed : 0;
  const roundedPace = Math.round(avgPaceSecPerKm);
  const paceMin = Math.floor(roundedPace / 60);
  const paceSec = roundedPace % 60;

  const avgHr = hrCount ? Math.round(sumHr / hrCount) : 0;
  const avgCadence = cadCount ? Math.round(sumCadence / cadCount) : 0;
  const avgPower = powerCount ? Math.round(sumPower / powerCount) : 0;

  const avgGround = groundCount ? Math.round(sumGround / groundCount) : 0;
  const avgFlight = flightCount ? Math.round(sumFlight / flightCount) : 0;
  // verticalOscillation 服务端返回 FIT 原始值（mm × 10 = cm × 100），显示为 cm
  const avgVertRaw = vertCount ? (sumVert / vertCount) : 0;
  const avgVertCm = (avgVertRaw / 100).toFixed(1);

  const avgStride = (avgCadence > 0 && avgSpeed > 0)
    ? ((avgSpeed * 60) / avgCadence).toFixed(2) : '-';

  const durationMin = Math.floor(totalSec / 60);
  const durationSec = Math.round(totalSec % 60);
  const distKm = (totalDist / 1000).toFixed(2);

  const trainingSec = stats?.trainingDurationSec ?? totalSec;
  const trainingMin = Math.floor(trainingSec / 60);
  const trainingSecPart = Math.round(trainingSec % 60);

  const load = stats?.trainingLoad || (avgHr ? Math.round(totalSec * (avgHr / 200) * 0.1) : 0);

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('statDistance', `${distKm} km`);
  setText('statDuration', `${durationMin}:${durationSec.toString().padStart(2, '0')}`);
  setText('statTrainingDuration', `${trainingMin}:${trainingSecPart.toString().padStart(2, '0')}`);
  setText('statPace', `${paceMin}'${paceSec.toString().padStart(2, '0')}"`);
  setText('statCalories', `${calories} kcal`);
  setText('statHr', avgHr ? `${avgHr} bpm` : '—');
  setText('statCadence', avgCadence ? `${avgCadence} spm` : '—');
  setText('statPower', avgPower ? `${avgPower} W` : '—');
  setText('statStride', avgStride !== '-' ? `${avgStride} m` : '—');
  setText('statGroundTime', avgGround ? `${avgGround} ms` : '—');
  setText('statFlightTime', avgFlight ? `${avgFlight} ms` : '—');
  setText('statVertOsc', avgVertRaw ? `${avgVertCm} cm` : '—');
  setText('statLoad', load ? `${load}` : '—');
  setText('statAscent', altCount > 1 ? `${Math.round(totalAscent)} m` : '—');
  setText('statDescent', altCount > 1 ? `${Math.round(totalDescent)} m` : '—');
  const maxAltVal = stats?.maxElevation ?? (Number.isFinite(maxAlt) ? maxAlt : 0);
  const minAltVal = stats?.minElevation ?? (Number.isFinite(minAlt) ? minAlt : 0);
  setText('statMaxAlt', altCount ? `${Math.round(maxAltVal)} m` : '—');
  setText('statMinAlt', altCount ? `${Math.round(minAltVal)} m` : '—');
  setText('statAltitude', altCount ? `${Math.round(sumAltitude / altCount)} m` : '—');

  const statsEl = document.getElementById('previewStats');
  if (statsEl) statsEl.style.display = 'block';
}

function openPreviewModal() {
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.add('active');
}

function closePreviewModal() {
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.remove('active');
}

document.getElementById('previewModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'previewModal') closePreviewModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePreviewModal();
    closeManufacturerModal();
  }
});

// ==================== 浏览器端海拔获取 ====================
const CLIENT_ELEVATION_SOURCE_NAMES = {
  'open-elevation': 'Open-Elevation',
  'opentopodata': 'OpenTopoData SRTM90',
  'opentopodata-srtm30m': 'OpenTopoData SRTM30',
  'opentopodata-aster30m': 'OpenTopoData ASTER30',
  'opentopodata-eudem25m': 'OpenTopoData EUDEM25',
  'open-meteo': 'Open-Meteo',
};

const CLIENT_OPENTOPO_DATASETS = {
  'opentopodata': 'srtm90m',
  'opentopodata-srtm30m': 'srtm30m',
  'opentopodata-aster30m': 'aster30m',
  'opentopodata-eudem25m': 'eudem25m',
};

function clientCorsProxy() {
  const input = document.getElementById('corsProxyInput');
  return input ? input.value.trim() : '';
}

function clientBuildProxyUrl(targetUrl) {
  let proxy = clientCorsProxy();
  if (!proxy) return targetUrl;
  // 自动补协议，避免按相对路径解析到自身域名
  if (!/^https?:\/\//i.test(proxy)) {
    if (proxy.startsWith('//')) {
      proxy = 'https:' + proxy;
    } else if (/^(localhost|127\.0\.0\.1)([:/]|$)/i.test(proxy)) {
      proxy = 'http://' + proxy;
    } else {
      proxy = 'https://' + proxy;
    }
  }
  if (proxy.includes('{url}')) return proxy.replace('{url}', targetUrl);
  return proxy + encodeURIComponent(targetUrl);
}

function syncElevationProxyUI() {
  const select = document.getElementById('elevationSourceSelect');
  const row = document.getElementById('elevationProxyRow');
  if (!select || !row) return;
  const value = select.value || 'open-elevation';
  row.style.display = value.startsWith('opentopodata') ? 'block' : 'none';
}

function initCorsProxyInput() {
  const input = document.getElementById('corsProxyInput');
  if (!input) return;
  const saved = localStorage.getItem('corsProxy') || '';
  if (saved) input.value = saved;
  input.addEventListener('input', () => {
    localStorage.setItem('corsProxy', input.value.trim());
  });
}

async function clientPostJson(url, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function clientGetJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function clientDedupePoints(points) {
  const seen = new Map();
  const firstIndexes = new Array(points.length);
  const jobs = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, i);
      firstIndexes[i] = i;
      jobs.push({ point: p, firstIndex: i });
    } else {
      firstIndexes[i] = first;
    }
  }
  return { jobs, firstIndexes };
}

async function clientRunElevationBatches(jobs, batchSize, fetchBatch) {
  const elevations = new Map();
  const concurrency = 8;
  for (let start = 0; start < jobs.length; start += batchSize * concurrency) {
    const windowJobs = jobs.slice(start, start + batchSize * concurrency);
    const batches = [];
    for (let b = 0; b < windowJobs.length; b += batchSize) {
      batches.push(windowJobs.slice(b, b + batchSize));
    }

    const settled = await Promise.allSettled(batches.map((batch) => fetchBatch(batch)));
    const retryQueue = [];
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        for (const item of result.value) {
          elevations.set(item.firstIndex, item.elevation);
        }
      } else {
        retryQueue.push({ batch: batches[idx], error: result.reason });
      }
    });

    // 失败批次重试一次；仍失败则把该批次标记为 null，由调用方回退这些点的模拟海拔
    if (retryQueue.length > 0) {
      const retried = await Promise.allSettled(retryQueue.map(({ batch }) => fetchBatch(batch)));
      retried.forEach((result, idx) => {
        const { batch } = retryQueue[idx];
        if (result.status === 'fulfilled') {
          for (const item of result.value) {
            elevations.set(item.firstIndex, item.elevation);
          }
        } else {
          for (const job of batch) {
            if (!elevations.has(job.firstIndex)) elevations.set(job.firstIndex, null);
          }
        }
      });
    }
  }
  return elevations;
}

async function clientFetchOpenElevation(points) {
  const { jobs, firstIndexes } = clientDedupePoints(points);
  const elevations = await clientRunElevationBatches(jobs, 200, async (batch) => {
    const locations = batch.map(({ point: p }) => ({ latitude: p.lat, longitude: p.lng }));
    const response = await clientPostJson('https://api.open-elevation.com/api/v1/lookup', { locations });
    const results = response?.results;
    if (!results || results.length !== batch.length) {
      throw new Error('Open-Elevation 返回数量与请求数量不一致');
    }
    return batch.map((job, i) => ({
      firstIndex: job.firstIndex,
      elevation: results[i].elevation == null ? 0 : results[i].elevation,
    }));
  });
  return points.map((_, i) => {
    const value = elevations.get(firstIndexes[i]);
    return value == null ? null : value;
  });
}

async function clientFetchOpenTopoData(points, source) {
  const dataset = CLIENT_OPENTOPO_DATASETS[source] || 'srtm90m';
  const { jobs, firstIndexes } = clientDedupePoints(points);
  const elevations = await clientRunElevationBatches(jobs, 100, async (batch) => {
    const locationsStr = batch.map(({ point: p }) => `${p.lat},${p.lng}`).join('|');
    const response = await clientPostJson(
      clientBuildProxyUrl(`https://api.opentopodata.org/v1/${dataset}`),
      { locations: locationsStr }
    );
    const results = response?.results;
    if (!results || results.length !== batch.length) {
      throw new Error('OpenTopoData 返回数量与请求数量不一致');
    }
    return batch.map((job, i) => ({
      firstIndex: job.firstIndex,
      elevation: results[i].elevation == null ? 0 : results[i].elevation,
    }));
  });
  return points.map((_, i) => {
    const value = elevations.get(firstIndexes[i]);
    return value == null ? null : value;
  });
}

async function clientFetchOpenMeteo(points) {
  const altitudes = new Array(points.length).fill(null);
  const seen = new Map();
  const jobs = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.set(key, i);
    jobs.push({ key, index: i });
  }

  const fetchOne = async (job) => {
    const [lat, lng] = job.key.split(',');
    const response = await clientGetJson(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
    );
    const elevation = Array.isArray(response?.elevation) ? response.elevation[0] : response?.elevation;
    return {
      index: job.index,
      elevation: elevation == null || !Number.isFinite(elevation) ? 0 : elevation,
    };
  };

  const concurrency = 8;
  for (let start = 0; start < jobs.length; start += concurrency) {
    const chunk = jobs.slice(start, start + concurrency);
    const settled = await Promise.allSettled(chunk.map((job) => fetchOne(job)));
    const retryJobs = [];
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        altitudes[result.value.index] = result.value.elevation;
      } else {
        retryJobs.push(chunk[idx]);
      }
    });
    if (retryJobs.length > 0) {
      const retried = await Promise.allSettled(retryJobs.map((job) => fetchOne(job)));
      retried.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          altitudes[result.value.index] = result.value.elevation;
        } else {
          altitudes[retryJobs[idx].index] = null;
        }
      });
    }
  }

  // 回填重复坐标
  for (let i = 0; i < points.length; i++) {
    const key = `${points[i].lat.toFixed(6)},${points[i].lng.toFixed(6)}`;
    const first = seen.get(key);
    if (first !== undefined && first !== i) altitudes[i] = altitudes[first];
  }
  return altitudes;
}

const CLIENT_ELEVATION_CACHE = new Map();
const CLIENT_ELEVATION_CACHE_MAX = 8;

function clientElevationCacheKey(points, source, proxy) {
  // djb2 hash：只依赖坐标（6 位小数）、数据源与代理，避免把数千点直接当 key
  let hash = 5381;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const s = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}|`;
    for (let j = 0; j < s.length; j++) {
      hash = ((hash << 5) + hash + s.charCodeAt(j)) | 0;
    }
  }
  return `${source}|${proxy}|${points.length}|${hash >>> 0}`;
}

function clientElevationCacheGet(cacheKey) {
  if (!CLIENT_ELEVATION_CACHE.has(cacheKey)) return undefined;
  // 刷新为最近使用
  const value = CLIENT_ELEVATION_CACHE.get(cacheKey);
  CLIENT_ELEVATION_CACHE.delete(cacheKey);
  CLIENT_ELEVATION_CACHE.set(cacheKey, value);
  return value;
}

function clientElevationCacheSet(cacheKey, value) {
  CLIENT_ELEVATION_CACHE.set(cacheKey, value);
  while (CLIENT_ELEVATION_CACHE.size > CLIENT_ELEVATION_CACHE_MAX) {
    const oldestKey = CLIENT_ELEVATION_CACHE.keys().next().value;
    CLIENT_ELEVATION_CACHE.delete(oldestKey);
  }
}

async function fetchAltitudesClient(points, source) {
  const resolvedSource = (source || 'open-elevation').toLowerCase();
  const sourceName = CLIENT_ELEVATION_SOURCE_NAMES[resolvedSource] || resolvedSource;

  if (resolvedSource === 'none') {
    return {
      altitudes: null,
      source: resolvedSource,
      status: 'none',
      message: '不写入海拔（FIT 海拔字段留空）',
    };
  }
  if (resolvedSource === 'off' || !points || points.length === 0) {
    return {
      altitudes: null,
      source: resolvedSource,
      status: 'off',
      message: '模拟海拔（离线生成）',
    };
  }

  const proxy = clientCorsProxy();
  const cacheKey = clientElevationCacheKey(points, resolvedSource, proxy);
  const cached = clientElevationCacheGet(cacheKey);
  if (cached) return cached;

  try {
    let altitudes;
    if (resolvedSource.startsWith('opentopodata')) {
      altitudes = await clientFetchOpenTopoData(points, resolvedSource);
    } else if (resolvedSource === 'open-meteo') {
      altitudes = await clientFetchOpenMeteo(points);
    } else {
      altitudes = await clientFetchOpenElevation(points);
    }

    const validCount = Array.isArray(altitudes)
      ? altitudes.filter((v) => v != null && Number.isFinite(v)).length
      : 0;

    if (!Array.isArray(altitudes) || validCount === 0) {
      return {
        altitudes: null,
        source: resolvedSource,
        status: 'fallback',
        message: `${sourceName} 获取失败（所有采样点均未返回），已回退模拟海拔`,
      };
    }

    const result = validCount === altitudes.length
      ? {
          altitudes,
          source: resolvedSource,
          status: 'live',
          message: `已获取真实海拔（${sourceName}，${altitudes.length} 个采样点）`,
        }
      : {
          altitudes,
          source: resolvedSource,
          status: 'partial',
          message: `已获取部分真实海拔（${sourceName}，成功 ${validCount}/${altitudes.length}），其余回退模拟海拔`,
        };

    clientElevationCacheSet(cacheKey, result);
    return result;
  } catch (e) {
    console.warn(`${sourceName} 浏览器请求失败，回退到本地模拟海拔:`, e);
    return {
      altitudes: null,
      source: resolvedSource,
      status: 'fallback',
      message: `${sourceName} 获取失败（${e?.message || e}），已回退模拟海拔`,
    };
  }
}

function setElevationStatus(info) {
  const el = document.getElementById('elevationStatus');
  if (!el) return;
  if (!info || !info.status) {
    el.className = 'elevation-status';
    el.textContent = '';
    return;
  }
  const sourceNames = {
    'open-elevation': 'Open-Elevation',
    'opentopodata': 'OpenTopoData SRTM90',
    'opentopodata-srtm30m': 'OpenTopoData SRTM30',
    'opentopodata-aster30m': 'OpenTopoData ASTER30',
    'opentopodata-eudem25m': 'OpenTopoData EUDEM25',
    'open-meteo': 'Open-Meteo',
    'off': '模拟',
    'none': '无海拔'
  };
  const sourceName = sourceNames[info.source] || info.source || '';
  let message = info.message || '';
  if (!message) {
    if (info.status === 'live') message = `已获取真实海拔（${sourceName}）`;
    else if (info.status === 'partial') message = `已获取部分真实海拔（${sourceName}），其余回退模拟海拔`;
    else if (info.status === 'fallback') message = `${sourceName} 获取失败，已回退模拟海拔`;
    else if (info.status === 'none') message = '不写入海拔（FIT 海拔字段留空）';
    else message = '模拟海拔（离线生成）';
  }
  const statusClass = info.status === 'live' ? 'ok'
    : (info.status === 'partial' || info.status === 'fallback') ? 'warn'
    : info.status === 'none' ? 'none'
    : 'muted';
  el.className = `elevation-status ${statusClass}`;
  el.textContent = message;
}

function downsampleSamples(samples, maxPoints = 500) {
  if (!Array.isArray(samples) || samples.length <= maxPoints) return samples;
  const result = [];
  const step = (samples.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(samples[Math.round(i * step)]);
  }
  return result;
}

function renderPreviewCharts(preview) {
  if (!preview || !Array.isArray(preview.samples) || preview.samples.length === 0) {
    updateMessage("预览数据为空", true);
    return;
  }
  
  openPreviewModal();
  
  const chartSamples = downsampleSamples(preview.samples, 500);
  const labels = chartSamples.map((s) => (s.timeSec / 60).toFixed(1));
  const paceData = chartSamples.map((s) => {
    const speed = s.speed > 0 ? s.speed : 0.01;
    return (1000 / speed) / 60;
  });
  const hrData = chartSamples.map((s) => s.heartRate);
  const altData = chartSamples.map((s) => (typeof s.altitude === 'number' ? s.altitude : null));
  
  const paceCtx = document.getElementById("paceChart")?.getContext("2d");
  const hrCtx = document.getElementById("hrChart")?.getContext("2d");
  const altCtx = document.getElementById("altChart")?.getContext("2d");
  
  if (paceChart) paceChart.destroy();
  if (hrChart) hrChart.destroy();
  if (altChart) altChart.destroy();
  
  paceChart = new Chart(paceCtx, {
    type: "line",
    data: { labels, datasets: [{ label: "配速", data: paceData, borderColor: "#1976d2", tension: 0.2, pointRadius: 0 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: "时间 (分钟)" } }, y: { title: { display: true, text: "min/km" }, reverse: true } }
    }
  });
  
  hrChart = new Chart(hrCtx, {
    type: "line",
    data: { labels, datasets: [{ label: "心率", data: hrData, borderColor: "#e53935", tension: 0.2, pointRadius: 0 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: "时间 (分钟)" } }, y: { title: { display: true, text: "bpm" } } }
    }
  });

  altChart = new Chart(altCtx, {
    type: "line",
    data: { labels, datasets: [{ label: "海拔", data: altData, borderColor: "#2e7d32", backgroundColor: "rgba(46,125,50,0.12)", fill: true, tension: 0.2, pointRadius: 0 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: "时间 (分钟)" } }, y: { title: { display: true, text: "m" } } }
    }
  });

  renderPreviewStats(preview);
}

async function previewActivity() {
  if (routePoints.length < 2) {
    updateMessage("请至少在地图上选择两个点形成轨迹", true);
    return;
  }
  if (isGenerating) return;
  
  const timeInputs = document.querySelectorAll(".export-time-input");
  const paceMinInputs = document.querySelectorAll(".export-pace-min");
  const paceSecInputs = document.querySelectorAll(".export-pace-sec");
  
  if (!timeInputs.length || !paceMinInputs.length || !paceSecInputs.length) {
    updateMessage("请先设置时间和配速", true);
    return;
  }
  
  const firstTimeInput = timeInputs[0];
  if (!firstTimeInput?.value) firstTimeInput.value = dateToLocalInputValue(new Date());
  
  const inputVal = firstTimeInput.value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inputVal)) {
    updateMessage("开始时间无效", true);
    return;
  }
  const tzOffset = -new Date().getTimezoneOffset();
  const tzSign = tzOffset >= 0 ? '+' : '-';
  const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
  const tzMins = String(Math.abs(tzOffset) % 60).padStart(2, '0');
  const startTime = `${inputVal}:00${tzSign}${tzHours}:${tzMins}`;
  
  const pm = parseFloat(paceMinInputs[0]?.value) || 0;
  const ps = parseFloat(paceSecInputs[0]?.value) || 0;
  const shared = collectSharedParams();
  const walking = shared.sportType === "walking";
  const paceSecondsPerKm = walking ? 720 : pm * 60 + ps;

  if (!walking && (!paceSecondsPerKm || paceSecondsPerKm <= 0)) {
    updateMessage("配速无效", true);
    return;
  }
  
  const hrRest = parseInt(document.getElementById("hrRest")?.value) || 60;
  const hrMax = parseInt(document.getElementById("hrMax")?.value) || 180;
  const lapCount = Math.max(0.1, parseFloat(document.getElementById("lapCount")?.value) || 1);
  const weightKg = Number(document.getElementById("weightInput")?.value) || 65;
  const powerFactor = parseFloat(document.getElementById("powerFactor")?.value) || 1.3;
  const gpsDrift = parseFloat(document.getElementById("gpsDrift")?.value) || 0;
  const avgCadence = parseInt(document.getElementById("avgCadence")?.value) || (walking ? 100 : 170);
  const elevationSource = document.getElementById("elevationSourceSelect")?.value || 'open-elevation';
  const includeHeartRate = (walking ? false : document.getElementById("includeHeartRate")?.checked) ?? true;
  const includePower = document.getElementById("includePower")?.checked ?? true;
  const includeCadence = document.getElementById("includeCadence")?.checked ?? true;
  const includeGaitData = document.getElementById("includeGaitData")?.checked ?? true;
  
  isGenerating = true;
  document.getElementById("generateFit").disabled = true;
  document.getElementById("previewBtn").disabled = true;
  
  updateMessage("正在获取海拔并生成预览...");
  
  try {
    const activePoints = getActivePoints();
    const elevation = await fetchAltitudesClient(activePoints, elevationSource);
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime,
        points: activePoints,
        paceSecondsPerKm, hrRest, hrMax, lapCount,
        weightKg, powerFactor, gpsDrift, avgCadence,
        elevationSource,
        altitudes: elevation.altitudes,
        includeHeartRate, includePower, includeCadence, includeGaitData,
        sportType: shared.sportType,
        heightCm: shared.heightCm,
        sportName: shared.sportName,
        fitSubSport: shared.fitSubSport,
        customSubSport: shared.customSubSport,
        workoutMode: shared.workoutMode,
        intervalReps: shared.intervalReps,
        intervalFastKm: shared.intervalFastKm,
        elapsedExtraSeconds: shared.elapsedExtraSeconds,
        format: shared.format
      })
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      updateMessage(err.error || "预览失败", true);
      return;
    }
    
    const data = await res.json();
    renderPreviewCharts(data);
    setElevationStatus(data.elevation);
    
    const km = (data.totalDistanceMeters / 1000).toFixed(2);
    const min = (data.totalDurationSec / 60).toFixed(1);
    updateMessage(`预览已生成，距离约 ${km} 公里，时间约 ${min} 分钟`);
  } catch (e) {
    console.error(e);
    updateMessage("预览请求失败", true);
  } finally {
    isGenerating = false;
    document.getElementById("generateFit").disabled = false;
    document.getElementById("previewBtn").disabled = false;
  }
}

document.getElementById("previewBtn")?.addEventListener("click", previewActivity);

function openSponsorModal() {
  const modal = document.getElementById('sponsorModal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeSponsorModal() {
  const modal = document.getElementById('sponsorModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

document.getElementById('logoIcon')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  openSponsorModal();
});

document.getElementById('sponsorModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'sponsorModal') {
    closeSponsorModal();
  }
});

let generatingCloseTimeout = null;
let generatingCloseInterval = null;

function showGeneratingModal(text = '正在生成 FIT 文件...') {
  const modal = document.getElementById('generatingModal');
  const textEl = document.getElementById('generatingText');
  const hintEl = document.getElementById('generatingHint');
  const cdEl = document.getElementById('generatingCountdown');
  const closeBtn = document.getElementById('generatingCloseBtn');
  clearGeneratingCloseTimers();
  if (modal) {
    modal.classList.add('active');
    if (textEl) textEl.textContent = text;
    if (hintEl) {
      hintEl.style.display = 'none';
    }
  }
  if (cdEl) cdEl.style.display = 'none';
  if (closeBtn) closeBtn.style.display = 'none';
  const spinner = document.querySelector('.loading-spinner');
  if (spinner) spinner.style.display = 'block';
}

function updateGeneratingModal(text, hint = '') {
  const textEl = document.getElementById('generatingText');
  const hintEl = document.getElementById('generatingHint');
  if (textEl) textEl.textContent = text;
  if (hintEl) {
    if (hint) {
      hintEl.innerHTML = hint;
      hintEl.style.display = 'block';
    } else {
      hintEl.style.display = 'none';
    }
  }
}

function clearGeneratingCloseTimers() {
  clearTimeout(generatingCloseTimeout);
  clearInterval(generatingCloseInterval);
  generatingCloseTimeout = null;
  generatingCloseInterval = null;
}

function scheduleGeneratingClose(seconds) {
  const cdEl = document.getElementById('generatingCountdown');
  const closeBtn = document.getElementById('generatingCloseBtn');
  clearGeneratingCloseTimers();

  const setCountdown = (n) => {
    if (cdEl) {
      cdEl.style.display = 'block';
      cdEl.textContent = `${n} 秒后自动关闭`;
    }
  };
  const hide = () => {
    clearGeneratingCloseTimers();
    hideGeneratingModal();
  };

  if (closeBtn) closeBtn.style.display = 'block';
  setCountdown(seconds);
  const spinner = document.querySelector('.loading-spinner');
  if (spinner) spinner.style.display = 'none';
  let remaining = seconds;
  generatingCloseInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      hide();
    } else {
      setCountdown(remaining);
    }
  }, 1000);
  generatingCloseTimeout = setTimeout(hide, seconds * 1000);
}

function hideGeneratingModal() {
  const modal = document.getElementById('generatingModal');
  if (modal) {
    modal.classList.remove('active');
  }
  clearGeneratingCloseTimers();
  const cdEl = document.getElementById('generatingCountdown');
  const closeBtn = document.getElementById('generatingCloseBtn');
  if (cdEl) cdEl.style.display = 'none';
  if (closeBtn) closeBtn.style.display = 'none';
}

document.getElementById('generatingCloseBtn')?.addEventListener('click', hideGeneratingModal);

// ==================== 服务状态检测模块 ====================

async function checkServiceStatus() {
  const statusEl = document.getElementById('serviceStatus');
  if (!statusEl) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('/api/status', {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      statusEl.classList.remove('offline');
      statusEl.classList.add('online');
      const data = await res.json().catch(() => ({}));
      const raw = data.status || data.message || '在线';
      statusEl.querySelector('.status-text').textContent = raw === 'available' ? '在线' : raw;
    } else {
      throw new Error('Health check failed');
    }
  } catch (e) {
    statusEl.classList.remove('online');
    statusEl.classList.add('offline');
    statusEl.querySelector('.status-text').textContent = '离线';
  }
}

document.getElementById('serviceStatus')?.addEventListener('click', (e) => {
  e.stopPropagation();
  checkServiceStatus();
  updateMessage('正在刷新服务状态...');
});

document.addEventListener('DOMContentLoaded', () => {
  checkServiceStatus();
  syncDeviceUI();
  syncElevationProxyUI();
  initCorsProxyInput();
  document.getElementById('elevationSourceSelect')?.addEventListener('change', syncElevationProxyUI);
});

window.addEventListener('resize', () => {
  const el = document.getElementById("distanceInfo");
  if (el) fitText(el);
});
