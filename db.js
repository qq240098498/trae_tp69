const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');

let db = {
  shelves: [],
  packages: [],
  notifications: [],
  returnOrders: [],
  shelfActivity: [],
  bigItemWarnings: [],
  config: {},
  nextIds: {
    shelves: 1,
    packages: 1,
    notifications: 1,
    returnOrders: 1,
    shelfActivity: 1,
    bigItemWarnings: 1
  }
};

function loadDb() {
  if (fs.existsSync(dbFile)) {
    try {
      const content = fs.readFileSync(dbFile, 'utf-8');
      db = JSON.parse(content);
    } catch (e) {
      console.error('加载数据库失败:', e.message);
    }
  }
  if (!db.shelves) db.shelves = [];
  if (!db.packages) db.packages = [];
  if (!db.notifications) db.notifications = [];
  if (!db.returnOrders) db.returnOrders = [];
  if (!db.shelfActivity) db.shelfActivity = [];
  if (!db.bigItemWarnings) db.bigItemWarnings = [];
  if (!db.config) db.config = {};
  if (!db.nextIds) db.nextIds = {};
  if (typeof db.nextIds.shelves !== 'number') db.nextIds.shelves = 1;
  if (typeof db.nextIds.packages !== 'number') db.nextIds.packages = 1;
  if (typeof db.nextIds.notifications !== 'number') db.nextIds.notifications = 1;
  if (typeof db.nextIds.returnOrders !== 'number') db.nextIds.returnOrders = 1;
  if (typeof db.nextIds.shelfActivity !== 'number') db.nextIds.shelfActivity = 1;
  if (typeof db.nextIds.bigItemWarnings !== 'number') db.nextIds.bigItemWarnings = 1;
  
  initDefaultConfig();
}

function saveDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

const DEFAULT_CONFIG = {
  heatmap: {
    hotThreshold: 0.75,
    warmThreshold: 0.5,
    mildThreshold: 0.25,
    coolThreshold: 0
  },
  optimization: {
    highFrequencyRatio: 0.6,
    middleRows: [2, 3, 4]
  },
  bigItem: {
    zones: ['C'],
    warningThreshold: 0.8,
    noticeThreshold: 0.6
  }
};

function initDefaultConfig() {
  let needsSave = false;
  if (!db.config.heatmap) {
    db.config.heatmap = { ...DEFAULT_CONFIG.heatmap };
    needsSave = true;
  } else {
    if (typeof db.config.heatmap.hotThreshold !== 'number') {
      db.config.heatmap.hotThreshold = DEFAULT_CONFIG.heatmap.hotThreshold;
      needsSave = true;
    }
    if (typeof db.config.heatmap.warmThreshold !== 'number') {
      db.config.heatmap.warmThreshold = DEFAULT_CONFIG.heatmap.warmThreshold;
      needsSave = true;
    }
    if (typeof db.config.heatmap.mildThreshold !== 'number') {
      db.config.heatmap.mildThreshold = DEFAULT_CONFIG.heatmap.mildThreshold;
      needsSave = true;
    }
    if (typeof db.config.heatmap.coolThreshold !== 'number') {
      db.config.heatmap.coolThreshold = DEFAULT_CONFIG.heatmap.coolThreshold;
      needsSave = true;
    }
  }
  if (!db.config.optimization) {
    db.config.optimization = { ...DEFAULT_CONFIG.optimization, middleRows: [...DEFAULT_CONFIG.optimization.middleRows] };
    needsSave = true;
  } else {
    if (typeof db.config.optimization.highFrequencyRatio !== 'number') {
      db.config.optimization.highFrequencyRatio = DEFAULT_CONFIG.optimization.highFrequencyRatio;
      needsSave = true;
    }
    if (!Array.isArray(db.config.optimization.middleRows)) {
      db.config.optimization.middleRows = [...DEFAULT_CONFIG.optimization.middleRows];
      needsSave = true;
    }
  }
  if (!db.config.bigItem) {
    db.config.bigItem = { ...DEFAULT_CONFIG.bigItem, zones: [...DEFAULT_CONFIG.bigItem.zones] };
    needsSave = true;
  } else {
    if (!Array.isArray(db.config.bigItem.zones)) {
      db.config.bigItem.zones = [...DEFAULT_CONFIG.bigItem.zones];
      needsSave = true;
    }
    if (typeof db.config.bigItem.warningThreshold !== 'number') {
      db.config.bigItem.warningThreshold = DEFAULT_CONFIG.bigItem.warningThreshold;
      needsSave = true;
    }
    if (typeof db.config.bigItem.noticeThreshold !== 'number') {
      db.config.bigItem.noticeThreshold = DEFAULT_CONFIG.bigItem.noticeThreshold;
      needsSave = true;
    }
  }
  if (needsSave) saveDb();
}

function getConfig() {
  return JSON.parse(JSON.stringify(db.config));
}

function updateConfig(newConfig) {
  if (newConfig.heatmap) {
    if (typeof newConfig.heatmap.hotThreshold === 'number') {
      db.config.heatmap.hotThreshold = Math.min(Math.max(newConfig.heatmap.hotThreshold, 0), 1);
    }
    if (typeof newConfig.heatmap.warmThreshold === 'number') {
      db.config.heatmap.warmThreshold = Math.min(Math.max(newConfig.heatmap.warmThreshold, 0), 1);
    }
    if (typeof newConfig.heatmap.mildThreshold === 'number') {
      db.config.heatmap.mildThreshold = Math.min(Math.max(newConfig.heatmap.mildThreshold, 0), 1);
    }
    if (typeof newConfig.heatmap.coolThreshold === 'number') {
      db.config.heatmap.coolThreshold = Math.min(Math.max(newConfig.heatmap.coolThreshold, 0), 1);
    }
  }
  if (newConfig.optimization) {
    if (typeof newConfig.optimization.highFrequencyRatio === 'number') {
      db.config.optimization.highFrequencyRatio = Math.min(Math.max(newConfig.optimization.highFrequencyRatio, 0), 1);
    }
    if (Array.isArray(newConfig.optimization.middleRows)) {
      db.config.optimization.middleRows = newConfig.optimization.middleRows
        .map(r => parseInt(r))
        .filter(r => !isNaN(r) && r > 0);
    }
  }
  if (newConfig.bigItem) {
    if (Array.isArray(newConfig.bigItem.zones)) {
      db.config.bigItem.zones = newConfig.bigItem.zones.map(z => String(z).toUpperCase());
      for (const shelf of db.shelves) {
        shelf.is_big_item_zone = db.config.bigItem.zones.includes(shelf.zone) ? 1 : 0;
      }
    }
    if (typeof newConfig.bigItem.warningThreshold === 'number') {
      db.config.bigItem.warningThreshold = Math.min(Math.max(newConfig.bigItem.warningThreshold, 0), 1);
    }
    if (typeof newConfig.bigItem.noticeThreshold === 'number') {
      db.config.bigItem.noticeThreshold = Math.min(Math.max(newConfig.bigItem.noticeThreshold, 0), 1);
    }
  }
  saveDb();
  return getConfig();
}

function resetConfig() {
  db.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  for (const shelf of db.shelves) {
    shelf.is_big_item_zone = db.config.bigItem.zones.includes(shelf.zone) ? 1 : 0;
  }
  saveDb();
  return getConfig();
}

function initDatabase() {
  loadDb();

  if (db.shelves.length === 0) {
    const zones = ['A', 'B', 'C'];
    const rows = 5;
    const cols = 4;
    const bigItemZones = db.config.bigItem.zones || ['C'];

    for (const zone of zones) {
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const code = `${zone}-${r}-${c}`;
          db.shelves.push({
            id: db.nextIds.shelves++,
            shelf_code: code,
            zone: zone,
            row_num: r,
            col_num: c,
            is_occupied: 0,
            current_package_id: null,
            is_big_item_zone: bigItemZones.includes(zone) ? 1 : 0,
            in_count: 0,
            out_count: 0,
            total_activity: 0,
            last_activity_time: null,
            created_at: new Date().toISOString()
          });
        }
      }
    }
    saveDb();
    console.log('初始化货架完成，共', zones.length * rows * cols, '个货架位');
  } else {
    let needsSave = false;
    for (const shelf of db.shelves) {
      if (typeof shelf.is_big_item_zone === 'undefined') {
        const bigItemZones = db.config.bigItem.zones || ['C'];
        shelf.is_big_item_zone = bigItemZones.includes(shelf.zone) ? 1 : 0;
        needsSave = true;
      }
      if (typeof shelf.in_count === 'undefined') {
        shelf.in_count = 0;
        needsSave = true;
      }
      if (typeof shelf.out_count === 'undefined') {
        shelf.out_count = 0;
        needsSave = true;
      }
      if (typeof shelf.total_activity === 'undefined') {
        shelf.total_activity = 0;
        needsSave = true;
      }
      if (typeof shelf.last_activity_time === 'undefined') {
        shelf.last_activity_time = null;
        needsSave = true;
      }
    }
    if (needsSave) saveDb();
  }
}

function findNearestEmptyShelf() {
  return db.shelves
    .filter(s => s.is_occupied === 0)
    .sort((a, b) => {
      if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
      if (a.row_num !== b.row_num) return a.row_num - b.row_num;
      return a.col_num - b.col_num;
    })[0] || null;
}

function getPackageByTracking(trackingNumber) {
  return db.packages.find(p => p.tracking_number === trackingNumber) || null;
}

function getPackageById(id) {
  return db.packages.find(p => p.id === parseInt(id)) || null;
}

function recordShelfActivity(shelfId, activityType) {
  const shelf = db.shelves.find(s => s.id === shelfId);
  if (!shelf) return;

  const now = new Date().toISOString();
  
  if (activityType === 'in') {
    shelf.in_count = (shelf.in_count || 0) + 1;
  } else if (activityType === 'out') {
    shelf.out_count = (shelf.out_count || 0) + 1;
  }
  shelf.total_activity = (shelf.in_count || 0) + (shelf.out_count || 0);
  shelf.last_activity_time = now;

  db.shelfActivity.push({
    id: db.nextIds.shelfActivity++,
    shelf_id: shelfId,
    shelf_code: shelf.shelf_code,
    activity_type: activityType,
    activity_time: now
  });
}

function createPackage(packageData) {
  const { trackingNumber, recipientPhone, recipientName, shelfId, shelfCode, isBigItem = false } = packageData;
  
  const newPkg = {
    id: db.nextIds.packages++,
    tracking_number: trackingNumber,
    recipient_phone: recipientPhone,
    recipient_name: recipientName || '',
    shelf_id: shelfId,
    shelf_code: shelfCode,
    status: 'in_stock',
    in_time: new Date().toISOString(),
    out_time: null,
    signature: null,
    is_overdue: 0,
    is_abnormal: 0,
    reminder_count: 0,
    last_reminder_time: null,
    note: '',
    is_big_item: isBigItem ? 1 : 0,
    created_at: new Date().toISOString()
  };

  db.packages.push(newPkg);

  const shelf = db.shelves.find(s => s.id === shelfId);
  if (shelf) {
    shelf.is_occupied = 1;
    shelf.current_package_id = newPkg.id;
    recordShelfActivity(shelfId, 'in');
  }

  saveDb();
  return getPackageById(newPkg.id);
}

function createNotification(notificationData) {
  const { packageId, trackingNumber, recipientPhone, type, content } = notificationData;
  
  const notification = {
    id: db.nextIds.notifications++,
    package_id: packageId,
    tracking_number: trackingNumber,
    recipient_phone: recipientPhone,
    type: type,
    content: content,
    status: 'sent',
    sent_at: new Date().toISOString()
  };

  db.notifications.push(notification);
  saveDb();
  return notification.id;
}

function pickupPackage(trackingNumber, signature) {
  const pkg = getPackageByTracking(trackingNumber);
  if (!pkg) {
    throw new Error('快递不存在');
  }
  if (pkg.status !== 'in_stock' && pkg.status !== 'overdue' && pkg.status !== 'abnormal') {
    throw new Error('快递状态异常，无法出库');
  }

  pkg.status = 'picked';
  pkg.out_time = new Date().toISOString();
  pkg.signature = signature || '';

  if (pkg.shelf_id) {
    const shelf = db.shelves.find(s => s.id === pkg.shelf_id);
    if (shelf) {
      shelf.is_occupied = 0;
      shelf.current_package_id = null;
      recordShelfActivity(pkg.shelf_id, 'out');
    }
  }

  saveDb();
  return getPackageById(pkg.id);
}

function getOverduePackages() {
  const now = Date.now();
  return db.packages
    .filter(p => 
      (p.status === 'in_stock' || p.status === 'overdue') &&
      (now - new Date(p.in_time).getTime()) > 48 * 60 * 60 * 1000
    )
    .sort((a, b) => new Date(a.in_time) - new Date(b.in_time));
}

function getAbnormalPackages() {
  const now = Date.now();
  return db.packages
    .filter(p => 
      (p.status === 'in_stock' || p.status === 'overdue' || p.status === 'abnormal') &&
      (now - new Date(p.in_time).getTime()) > 7 * 24 * 60 * 60 * 1000
    )
    .sort((a, b) => new Date(a.in_time) - new Date(b.in_time));
}

function markPackageOverdue(packageId) {
  const pkg = getPackageById(packageId);
  if (pkg) {
    pkg.status = 'overdue';
    pkg.is_overdue = 1;
    saveDb();
  }
  return { changes: pkg ? 1 : 0 };
}

function markPackageAbnormal(packageId) {
  const pkg = getPackageById(packageId);
  if (pkg) {
    pkg.status = 'abnormal';
    pkg.is_abnormal = 1;
    saveDb();
  }
  return { changes: pkg ? 1 : 0 };
}

function updateReminderCount(packageId) {
  const pkg = getPackageById(packageId);
  if (pkg) {
    pkg.reminder_count = (pkg.reminder_count || 0) + 1;
    pkg.last_reminder_time = new Date().toISOString();
    saveDb();
  }
  return { changes: pkg ? 1 : 0 };
}

function getPackagesByStatus(status, limit = 50, offset = 0) {
  let packages;
  if (status === 'all') {
    packages = [...db.packages];
  } else {
    packages = db.packages.filter(p => p.status === status);
  }
  return packages
    .sort((a, b) => new Date(b.in_time) - new Date(a.in_time))
    .slice(offset, offset + limit);
}

function searchPackages(keyword) {
  const kw = keyword.toLowerCase();
  return db.packages
    .filter(p => 
      p.tracking_number.toLowerCase().includes(kw) ||
      p.recipient_phone.toLowerCase().includes(kw) ||
      (p.recipient_name && p.recipient_name.toLowerCase().includes(kw))
    )
    .sort((a, b) => new Date(b.in_time) - new Date(a.in_time))
    .slice(0, 50);
}

function getAllShelves() {
  return [...db.shelves].sort((a, b) => {
    if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
    if (a.row_num !== b.row_num) return a.row_num - b.row_num;
    return a.col_num - b.col_num;
  });
}

function getShelfStats() {
  const total = db.shelves.length;
  const occupied = db.shelves.filter(s => s.is_occupied === 1).length;
  return {
    total,
    occupied,
    available: total - occupied
  };
}

function getNotifications(limit = 50, offset = 0) {
  return [...db.notifications]
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))
    .slice(offset, offset + limit);
}

function getStats() {
  const today = new Date().toISOString().split('T')[0];
  
  const todayIn = db.packages.filter(p => p.in_time && p.in_time.split('T')[0] === today).length;
  const todayOut = db.packages.filter(p => p.out_time && p.out_time.split('T')[0] === today && p.status === 'picked').length;
  const inStock = db.packages.filter(p => ['in_stock', 'overdue', 'abnormal'].includes(p.status)).length;
  const overdue = db.packages.filter(p => p.status === 'overdue').length;
  const abnormal = db.packages.filter(p => p.status === 'abnormal').length;

  return { todayIn, todayOut, inStock, overdue, abnormal };
}

function handleAbnormalPackage(packageId, note) {
  const pkg = getPackageById(packageId);
  if (pkg) {
    pkg.note = note || '';
    saveDb();
  }
  return { changes: pkg ? 1 : 0 };
}

const VALID_PLATFORMS = ['pinduoduo', 'taobao'];
const VALID_REFUND_STATUSES = ['refunded', 'refunding', 'not_refunded'];
const VALID_SHIP_STATUSES = ['shipped', 'not_shipped'];

function computeReconcileStatus(order) {
  const refunded = order.refund_status === 'refunded';
  const shipped = order.ship_status === 'shipped' && !!order.return_tracking_number;

  if (refunded && shipped) return 'matched';
  if (refunded && !shipped) return 'refunded_not_shipped';
  if (!refunded && shipped) return 'shipped_not_refunded';
  return 'pending';
}

function getReturnOrderById(id) {
  return db.returnOrders.find(o => o.id === parseInt(id)) || null;
}

function createReturnOrder(data) {
  const {
    platform,
    platformOrderNo,
    returnTrackingNumber,
    buyerPhone,
    refundStatus,
    refundTime,
    shipStatus,
    shipTime,
    amount,
    remark
  } = data;

  const now = new Date().toISOString();
  const order = {
    id: db.nextIds.returnOrders++,
    platform: VALID_PLATFORMS.includes(platform) ? platform : 'pinduoduo',
    platform_order_no: (platformOrderNo || '').trim(),
    return_tracking_number: (returnTrackingNumber || '').trim(),
    buyer_phone: (buyerPhone || '').trim(),
    refund_status: VALID_REFUND_STATUSES.includes(refundStatus) ? refundStatus : 'not_refunded',
    refund_time: refundTime || null,
    ship_status: VALID_SHIP_STATUSES.includes(shipStatus) ? shipStatus : 'not_shipped',
    ship_time: shipTime || null,
    amount: typeof amount === 'number' && amount >= 0 ? amount : 0,
    remark: remark || '',
    reconcile_status: 'pending',
    reconcile_time: null,
    created_at: now,
    updated_at: now
  };

  order.reconcile_status = computeReconcileStatus(order);

  db.returnOrders.push(order);
  saveDb();
  return getReturnOrderById(order.id);
}

function updateReturnOrder(id, data) {
  const order = getReturnOrderById(id);
  if (!order) return null;

  if (data.platform !== undefined && VALID_PLATFORMS.includes(data.platform)) {
    order.platform = data.platform;
  }
  if (data.platformOrderNo !== undefined) {
    order.platform_order_no = String(data.platformOrderNo).trim();
  }
  if (data.returnTrackingNumber !== undefined) {
    order.return_tracking_number = String(data.returnTrackingNumber).trim();
  }
  if (data.buyerPhone !== undefined) {
    order.buyer_phone = String(data.buyerPhone).trim();
  }
  if (data.refundStatus !== undefined && VALID_REFUND_STATUSES.includes(data.refundStatus)) {
    order.refund_status = data.refundStatus;
    order.refund_time = data.refundStatus === 'refunded'
      ? (data.refundTime || new Date().toISOString())
      : null;
  }
  if (data.shipStatus !== undefined && VALID_SHIP_STATUSES.includes(data.shipStatus)) {
    order.ship_status = data.shipStatus;
    order.ship_time = data.shipStatus === 'shipped'
      ? (data.shipTime || new Date().toISOString())
      : null;
  }
  if (data.amount !== undefined) {
    order.amount = typeof data.amount === 'number' && data.amount >= 0 ? data.amount : 0;
  }
  if (data.remark !== undefined) {
    order.remark = String(data.remark || '');
  }

  order.reconcile_status = computeReconcileStatus(order);
  order.reconcile_time = new Date().toISOString();
  order.updated_at = new Date().toISOString();

  saveDb();
  return getReturnOrderById(order.id);
}

function deleteReturnOrder(id) {
  const idx = db.returnOrders.findIndex(o => o.id === parseInt(id));
  if (idx === -1) return { changes: 0 };
  db.returnOrders.splice(idx, 1);
  saveDb();
  return { changes: 1 };
}

function getReturnOrders(filters = {}) {
  const { platform, reconcileStatus, keyword } = filters;
  let list = [...db.returnOrders];

  if (platform && platform !== 'all') {
    list = list.filter(o => o.platform === platform);
  }
  if (reconcileStatus && reconcileStatus !== 'all') {
    list = list.filter(o => o.reconcile_status === reconcileStatus);
  }
  if (keyword) {
    const kw = String(keyword).toLowerCase().trim();
    list = list.filter(o =>
      (o.platform_order_no || '').toLowerCase().includes(kw) ||
      (o.return_tracking_number || '').toLowerCase().includes(kw) ||
      (o.buyer_phone || '').toLowerCase().includes(kw)
    );
  }

  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function reconcileReturnOrder(id) {
  const order = getReturnOrderById(id);
  if (!order) return null;
  order.reconcile_status = computeReconcileStatus(order);
  order.reconcile_time = new Date().toISOString();
  order.updated_at = order.reconcile_time;
  saveDb();
  return getReturnOrderById(order.id);
}

function reconcileAllReturnOrders() {
  const summary = {
    total: db.returnOrders.length,
    matched: 0,
    refunded_not_shipped: 0,
    shipped_not_refunded: 0,
    pending: 0
  };
  const now = new Date().toISOString();

  for (const order of db.returnOrders) {
    order.reconcile_status = computeReconcileStatus(order);
    order.reconcile_time = now;
    order.updated_at = now;
    summary[order.reconcile_status] = (summary[order.reconcile_status] || 0) + 1;
  }

  saveDb();
  return summary;
}

function getReturnOrderStats() {
  const summary = {
    total: db.returnOrders.length,
    matched: 0,
    refunded_not_shipped: 0,
    shipped_not_refunded: 0,
    pending: 0
  };
  for (const order of db.returnOrders) {
    const status = computeReconcileStatus(order);
    summary[status] = (summary[status] || 0) + 1;
  }
  return summary;
}

function getHeatmapData() {
  const shelves = getAllShelves();
  const allActivities = shelves.map(s => s.total_activity || 0);
  const maxActivity = Math.max(...allActivities, 1);
  const heatConfig = db.config.heatmap;

  return shelves.map(shelf => {
    const activity = shelf.total_activity || 0;
    const intensity = activity / maxActivity;
    
    let heatLevel;
    if (intensity >= heatConfig.hotThreshold) heatLevel = 'hot';
    else if (intensity >= heatConfig.warmThreshold) heatLevel = 'warm';
    else if (intensity >= heatConfig.mildThreshold) heatLevel = 'mild';
    else if (intensity > heatConfig.coolThreshold) heatLevel = 'cool';
    else heatLevel = 'cold';

    return {
      ...shelf,
      activity,
      in_count: shelf.in_count || 0,
      out_count: shelf.out_count || 0,
      intensity,
      heat_level: heatLevel
    };
  });
}

function getHeatmapStats() {
  const heatmapData = getHeatmapData();
  const stats = {
    total: heatmapData.length,
    hot: heatmapData.filter(s => s.heat_level === 'hot').length,
    warm: heatmapData.filter(s => s.heat_level === 'warm').length,
    mild: heatmapData.filter(s => s.heat_level === 'mild').length,
    cool: heatmapData.filter(s => s.heat_level === 'cool').length,
    cold: heatmapData.filter(s => s.heat_level === 'cold').length,
    total_activity: heatmapData.reduce((sum, s) => sum + s.activity, 0)
  };
  return stats;
}

function optimizeShelfPlacement() {
  const heatmapData = getHeatmapData();
  const maxActivity = Math.max(...heatmapData.map(s => s.activity), 1);
  const optConfig = db.config.optimization;
  const threshold = maxActivity * optConfig.highFrequencyRatio;
  const middleRows = optConfig.middleRows;

  const highFreqShelves = heatmapData.filter(s => s.activity >= threshold && s.activity > 0);
  const lowFreqShelves = heatmapData.filter(s => s.activity < threshold);

  const inMiddleRow = (s) => middleRows.includes(s.row_num);
  const notInMiddleRow = (s) => !middleRows.includes(s.row_num);

  const highFreqNotMiddle = highFreqShelves.filter(notInMiddleRow);
  const lowFreqInMiddle = lowFreqShelves.filter(inMiddleRow);

  const adjustments = [];
  const maxSwaps = Math.min(highFreqNotMiddle.length, lowFreqInMiddle.length);

  for (let i = 0; i < maxSwaps; i++) {
    const highShelf = highFreqNotMiddle[i];
    const lowShelf = lowFreqInMiddle[i];

    if (highShelf.is_occupied === 0 && lowShelf.is_occupied === 0) {
      adjustments.push({
        type: 'swap_suggestion',
        high_frequency_shelf: {
          code: highShelf.shelf_code,
          zone: highShelf.zone,
          row: highShelf.row_num,
          col: highShelf.col_num,
          activity: highShelf.activity
        },
        low_frequency_shelf: {
          code: lowShelf.shelf_code,
          zone: lowShelf.zone,
          row: lowShelf.row_num,
          col: lowShelf.col_num,
          activity: lowShelf.activity
        },
        reason: `高频货架位 ${highShelf.shelf_code} (${highShelf.activity}次) 建议调整到中下层 ${lowShelf.shelf_code}`
      });
    }
  }

  const highFreqInMiddle = highFreqShelves.filter(inMiddleRow);
  for (const shelf of highFreqInMiddle) {
    adjustments.push({
      type: 'already_optimized',
      shelf: {
        code: shelf.shelf_code,
        zone: shelf.zone,
        row: shelf.row_num,
        col: shelf.col_num,
        activity: shelf.activity
      },
      reason: `高频货架位 ${shelf.shelf_code} 已在中下层，无需调整`
    });
  }

  return {
    threshold,
    high_frequency_count: highFreqShelves.length,
    low_frequency_count: lowFreqShelves.length,
    adjustments,
    middle_rows: middleRows
  };
}

function getBigItemZoneStatus() {
  const bigItemShelves = db.shelves.filter(s => s.is_big_item_zone === 1);
  const totalBigItem = bigItemShelves.length;
  const occupiedBigItem = bigItemShelves.filter(s => s.is_occupied === 1).length;
  const availableBigItem = totalBigItem - occupiedBigItem;
  const usageRate = totalBigItem > 0 ? (occupiedBigItem / totalBigItem) : 0;
  const bigItemConfig = db.config.bigItem;

  let warningLevel = 'normal';
  let warningMessage = '';

  if (usageRate >= bigItemConfig.warningThreshold) {
    warningLevel = 'critical';
    warningMessage = `大件区使用率已达 ${Math.round(usageRate * 100)}%，即将满载，请及时预留空间或清理大件！`;
  } else if (usageRate >= bigItemConfig.noticeThreshold) {
    warningLevel = 'warning';
    warningMessage = `大件区使用率已达 ${Math.round(usageRate * 100)}%，请留意大件库存。`;
  }

  const recentBigItems = db.packages
    .filter(p => p.is_big_item === 1 && p.status !== 'picked')
    .sort((a, b) => new Date(b.in_time) - new Date(a.in_time))
    .slice(0, 10);

  return {
    total: totalBigItem,
    occupied: occupiedBigItem,
    available: availableBigItem,
    usage_rate: usageRate,
    warning_level: warningLevel,
    warning_message: warningMessage,
    warning_threshold: bigItemConfig.warningThreshold,
    notice_threshold: bigItemConfig.noticeThreshold,
    recent_big_items: recentBigItems,
    big_item_zones: [...new Set(bigItemShelves.map(s => s.zone))]
  };
}

function createBigItemWarning(warningData) {
  const warning = {
    id: db.nextIds.bigItemWarnings++,
    type: warningData.type || 'capacity_warning',
    message: warningData.message,
    zone: warningData.zone || null,
    severity: warningData.severity || 'warning',
    resolved: 0,
    created_at: new Date().toISOString(),
    resolved_at: null
  };
  db.bigItemWarnings.push(warning);
  saveDb();
  return warning;
}

function getBigItemWarnings() {
  return [...db.bigItemWarnings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function findOptimalEmptyShelf(isBigItem = false) {
  const heatmapData = getHeatmapData();
  const maxActivity = Math.max(...heatmapData.map(s => s.activity), 1);
  const middleRows = db.config.optimization.middleRows;

  let candidates = db.shelves.filter(s => s.is_occupied === 0);

  if (isBigItem) {
    const bigItemCandidates = candidates.filter(s => s.is_big_item_zone === 1);
    if (bigItemCandidates.length > 0) {
      candidates = bigItemCandidates;
    }
  } else {
    const nonBigItemCandidates = candidates.filter(s => s.is_big_item_zone === 0);
    if (nonBigItemCandidates.length > 0) {
      candidates = nonBigItemCandidates;
    }
  }

  if (candidates.length === 0) return null;

  return candidates
    .map(s => {
      const activity = s.total_activity || 0;
      const inMiddle = middleRows.includes(s.row_num) ? 1 : 0;
      const score = inMiddle * 1000 + (maxActivity - activity);
      return { shelf: s, score };
    })
    .sort((a, b) => b.score - a.score)[0].shelf;
}

module.exports = {
  initDatabase,
  findNearestEmptyShelf,
  getPackageByTracking,
  getPackageById,
  createPackage,
  createNotification,
  pickupPackage,
  getOverduePackages,
  getAbnormalPackages,
  markPackageOverdue,
  markPackageAbnormal,
  updateReminderCount,
  getPackagesByStatus,
  searchPackages,
  getAllShelves,
  getShelfStats,
  getNotifications,
  getStats,
  handleAbnormalPackage,
  createReturnOrder,
  getReturnOrderById,
  updateReturnOrder,
  deleteReturnOrder,
  getReturnOrders,
  reconcileReturnOrder,
  reconcileAllReturnOrders,
  getReturnOrderStats,
  getHeatmapData,
  getHeatmapStats,
  optimizeShelfPlacement,
  getBigItemZoneStatus,
  createBigItemWarning,
  getBigItemWarnings,
  findOptimalEmptyShelf,
  getConfig,
  updateConfig,
  resetConfig,
};
