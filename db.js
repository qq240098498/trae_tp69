const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');

let db = {
  shelves: [],
  packages: [],
  notifications: [],
  returnOrders: [],
  nextIds: {
    shelves: 1,
    packages: 1,
    notifications: 1,
    returnOrders: 1
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
  if (!db.nextIds) db.nextIds = {};
  if (typeof db.nextIds.shelves !== 'number') db.nextIds.shelves = 1;
  if (typeof db.nextIds.packages !== 'number') db.nextIds.packages = 1;
  if (typeof db.nextIds.notifications !== 'number') db.nextIds.notifications = 1;
  if (typeof db.nextIds.returnOrders !== 'number') db.nextIds.returnOrders = 1;
}

function saveDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

function initDatabase() {
  loadDb();

  if (db.shelves.length === 0) {
    const zones = ['A', 'B', 'C'];
    const rows = 5;
    const cols = 4;
    
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
            created_at: new Date().toISOString()
          });
        }
      }
    }
    saveDb();
    console.log('初始化货架完成，共', zones.length * rows * cols, '个货架位');
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

function createPackage(packageData) {
  const { trackingNumber, recipientPhone, recipientName, shelfId, shelfCode } = packageData;
  
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
    created_at: new Date().toISOString()
  };

  db.packages.push(newPkg);

  const shelf = db.shelves.find(s => s.id === shelfId);
  if (shelf) {
    shelf.is_occupied = 1;
    shelf.current_package_id = newPkg.id;
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
};
