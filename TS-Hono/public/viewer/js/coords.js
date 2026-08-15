/* ============================================================
 * 坐标转换模块（与主项目 main.js 保持一致）
 * WGS84 <-> GCJ02 <-> BD09
 * FIT/GPS 轨迹点为 WGS84；高德/腾讯瓦片为 GCJ02；百度瓦片为 BD09。
 * ============================================================ */
window.CoordTransform = (function () {
  const PI = 3.1415926535897932384626;
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  const x_PI = (3.14159265358979324 * 3000.0) / 180.0;

  function isOutOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
    ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
    return ret;
  }

  function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
    ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
    return ret;
  }

  function WGS84_TO_GCJ02(lng, lat) {
    if (isOutOfChina(lng, lat)) return [lng, lat];
    let dlat = transformLat(lng - 105.0, lat - 35.0);
    let dlng = transformLng(lng - 105.0, lat - 35.0);
    const radlat = (lat / 180.0) * PI;
    let magic = Math.sin(radlat);
    magic = 1 - ee * magic * magic;
    const sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / (((a * (1 - ee)) / (magic * sqrtmagic)) * PI);
    dlng = (dlng * 180.0) / ((a / sqrtmagic) * Math.cos(radlat) * PI);
    return [lng + dlng, lat + dlat];
  }

  function GCJ02_TO_WGS84(lng, lat) {
    if (isOutOfChina(lng, lat)) return [lng, lat];
    let dlat = transformLat(lng - 105.0, lat - 35.0);
    let dlng = transformLng(lng - 105.0, lat - 35.0);
    const radlat = (lat / 180.0) * PI;
    let magic = Math.sin(radlat);
    magic = 1 - ee * magic * magic;
    const sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / (((a * (1 - ee)) / (magic * sqrtmagic)) * PI);
    dlng = (dlng * 180.0) / ((a / sqrtmagic) * Math.cos(radlat) * PI);
    return [lng - dlng, lat - dlat];
  }

  function GCJ02_TO_BD09(lng, lat) {
    const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * x_PI);
    const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * x_PI);
    return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
  }

  function BD09_TO_GCJ02(lng, lat) {
    const x = lng - 0.0065;
    const y = lat - 0.006;
    const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * x_PI);
    const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * x_PI);
    return [z * Math.cos(theta), z * Math.sin(theta)];
  }

  function WGS84_TO_BD09(lng, lat) {
    const [gcjLng, gcjLat] = WGS84_TO_GCJ02(lng, lat);
    return GCJ02_TO_BD09(gcjLng, gcjLat);
  }

  function BD09_TO_WGS84(lng, lat) {
    const [gcjLng, gcjLat] = BD09_TO_GCJ02(lng, lat);
    return GCJ02_TO_WGS84(gcjLng, gcjLat);
  }

  return {
    WGS84_TO_GCJ02,
    GCJ02_TO_WGS84,
    GCJ02_TO_BD09,
    BD09_TO_GCJ02,
    WGS84_TO_BD09,
    BD09_TO_WGS84,
    isOutOfChina,
  };
})();

/* 地图源坐标系分组（与主项目 MAP_SOURCE_CONFIG 保持一致） */
window.CoordProject = (function () {
  const SYS = {
    WGS84: "wgs84",
    GCJ02: "gcj02",
    BD09: "bd09",
  };

  const SOURCE_SYS = {
    // 国际 / WGS84 源
    osm: SYS.WGS84,
    osmde: SYS.WGS84,
    osmfr: SYS.WGS84,
    osm_cn: SYS.WGS84,
    cyclOSM: SYS.WGS84,
    wikimedia: SYS.WGS84,
    arcgis_street: SYS.WGS84,
    arcgis_satellite: SYS.WGS84,
    esri_satellite: SYS.WGS84,
    cartodb: SYS.WGS84,
    cartodb_dark: SYS.WGS84,
    stamen_water: SYS.WGS84,
    stamen_terrain: SYS.WGS84,
    // 国内 GCJ02 源
    gaode_vec: SYS.GCJ02,
    gaode_img: SYS.GCJ02,
    gaode_rel: SYS.GCJ02,
    tencent_vec: SYS.GCJ02,
    tencent_sat: SYS.GCJ02,
    tianditu_vec: SYS.GCJ02,
    tianditu_cva: SYS.GCJ02,
    tianditu_img: SYS.GCJ02,
    tianditu: SYS.GCJ02,
    satellite: SYS.GCJ02,
    // 百度 BD09 源
    baidu_vec: SYS.BD09,
    baidu_img: SYS.BD09,
  };

  function sysFor(key) {
    return SOURCE_SYS[key] || SYS.WGS84;
  }

  function toMap(lat, lng, key) {
    const sys = sysFor(key);
    if (sys === SYS.GCJ02) {
      const [mlng, mlat] = window.CoordTransform.WGS84_TO_GCJ02(lng, lat);
      return { lat: mlat, lng: mlng };
    }
    if (sys === SYS.BD09) {
      const [mlng, mlat] = window.CoordTransform.WGS84_TO_BD09(lng, lat);
      return { lat: mlat, lng: mlng };
    }
    return { lat, lng };
  }

  return { SYS, sysFor, toMap };
})();
