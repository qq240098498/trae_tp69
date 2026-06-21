const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const {
  initDatabase,
  findNearestEmptyShelf,
  getPackageByTracking,
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
  getPackageById,
  createReturnOrder,
  getReturnOrderById,
  updateReturnOrder,
  deleteReturnOrder,
  getReturnOrders,
  reconcileReturnOrder,
  reconcileAllReturnOrders,
  getReturnOrderStats,
} = require('./db');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '10mb', strict: false }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(function(err, req, res, next) {
  if (err) {
    console.error('请求解析错误:', err.message);
    return res.status(400).json({ success: false, error: '请求数据格式错误' });
  }
  next();
});

function sendSmsNotification(phone, content) {
  console.log(`[短信通知] 发送到 ${phone}: ${content}`);
  return true;
}

function sendAppPush(phone, content) {
  console.log(`[APP推送] 推送到 ${phone}: ${content}`);
  return true;
}

function generateNotificationContent(pkg) {
  return `【快递代收点】您的快递已到达代收点，运单号：${pkg.tracking_number}，货架位：${pkg.shelf_code}，请凭手机号后4位及时取件。`;
}

function generateReminderContent(pkg, hours) {
  return `【快递代收点】温馨提醒：您的快递（运单号：${pkg.tracking_number}，货架位：${pkg.shelf_code}）已存放${hours}小时未取，请尽快取件，超7天将按异常件处理。`;
}

const MAX_TRACKING_LENGTH = 50;
const MAX_PHONE_LENGTH = 20;
const MAX_NAME_LENGTH = 50;

function validateTrackingNumber(trackingNumber) {
  if (!trackingNumber || typeof trackingNumber !== 'string') {
    return '运单号不能为空';
  }
  if (trackingNumber.trim().length === 0) {
    return '运单号不能为空';
  }
  if (trackingNumber.length > MAX_TRACKING_LENGTH) {
    return `运单号长度不能超过 ${MAX_TRACKING_LENGTH} 个字符`;
  }
  return null;
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return '手机号不能为空';
  }
  if (phone.trim().length === 0) {
    return '手机号不能为空';
  }
  if (phone.length > MAX_PHONE_LENGTH) {
    return `手机号长度不能超过 ${MAX_PHONE_LENGTH} 个字符`;
  }
  return null;
}

app.get('/api/packages/tracking/:trackingNumber', (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const pkg = getPackageByTracking(trackingNumber);
    if (!pkg) {
      return res.status(404).json({ success: false, error: '未找到该快递' });
    }
    res.json({ success: true, data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/packages/scan-in', (req, res) => {
  try {
    let { trackingNumber, recipientPhone, recipientName } = req.body;

    trackingNumber = trackingNumber ? trackingNumber.trim() : '';
    recipientPhone = recipientPhone ? recipientPhone.trim() : '';
    recipientName = recipientName ? recipientName.trim() : '';

    const trackingError = validateTrackingNumber(trackingNumber);
    if (trackingError) {
      return res.status(400).json({ error: trackingError });
    }

    const phoneError = validatePhone(recipientPhone);
    if (phoneError) {
      return res.status(400).json({ error: phoneError });
    }

    if (recipientName && recipientName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `姓名长度不能超过 ${MAX_NAME_LENGTH} 个字符` });
    }

    const existingPkg = getPackageByTracking(trackingNumber);
    if (existingPkg && existingPkg.status !== 'picked') {
      return res.status(400).json({ error: '该运单号的快递已在库中' });
    }

    const shelf = findNearestEmptyShelf();
    if (!shelf) {
      return res.status(500).json({ error: '货架位已满，请先清理或增加货架' });
    }

    const newPkg = createPackage({
      trackingNumber,
      recipientPhone,
      recipientName: recipientName || '',
      shelfId: shelf.id,
      shelfCode: shelf.shelf_code,
    });

    const smsContent = generateNotificationContent(newPkg);
    sendSmsNotification(recipientPhone, smsContent);
    sendAppPush(recipientPhone, smsContent);

    createNotification({
      packageId: newPkg.id,
      trackingNumber: newPkg.tracking_number,
      recipientPhone: newPkg.recipient_phone,
      type: 'sms',
      content: smsContent,
    });

    createNotification({
      packageId: newPkg.id,
      trackingNumber: newPkg.tracking_number,
      recipientPhone: newPkg.recipient_phone,
      type: 'app_push',
      content: smsContent,
    });

    res.json({
      success: true,
      data: {
        package: newPkg,
        shelf: shelf,
      },
      message: '入库成功，已发送取件通知',
    });
  } catch (error) {
    console.error('入库失败:', error);
    res.status(500).json({ error: error.message || '入库失败' });
  }
});

app.post('/api/packages/scan-out', (req, res) => {
  try {
    let { trackingNumber, signature } = req.body;
    trackingNumber = trackingNumber ? trackingNumber.trim() : '';

    const trackingError = validateTrackingNumber(trackingNumber);
    if (trackingError) {
      return res.status(400).json({ error: trackingError });
    }

    const pkg = pickupPackage(trackingNumber, signature || '');

    res.json({
      success: true,
      data: pkg,
      message: '出库成功',
    });
  } catch (error) {
    console.error('出库失败:', error);
    res.status(500).json({ error: error.message || '出库失败' });
  }
});

app.get('/api/packages/search', (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) {
      return res.status(400).json({ error: '搜索关键词不能为空' });
    }
    const packages = searchPackages(keyword);
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/packages', (req, res) => {
  try {
    const { status = 'all', limit = 50, offset = 0 } = req.query;
    const packages = getPackagesByStatus(status, parseInt(limit), parseInt(offset));
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/packages/:id', (req, res) => {
  try {
    const pkg = getPackageById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ error: '快递不存在' });
    }
    res.json({ success: true, data: pkg });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/shelves', (req, res) => {
  try {
    const shelves = getAllShelves();
    const stats = getShelfStats();
    res.json({ success: true, data: { shelves, stats } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications', (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const notifications = getNotifications(parseInt(limit), parseInt(offset));
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/send-reminder/:packageId', (req, res) => {
  try {
    const pkg = getPackageById(req.params.packageId);
    if (!pkg) {
      return res.status(404).json({ error: '快递不存在' });
    }
    if (pkg.status === 'picked') {
      return res.status(400).json({ error: '快递已取件，无需发送催件通知' });
    }

    const hours = Math.floor((Date.now() - new Date(pkg.in_time).getTime()) / (1000 * 60 * 60));
    const content = generateReminderContent(pkg, hours);

    sendSmsNotification(pkg.recipient_phone, content);
    sendAppPush(pkg.recipient_phone, content);

    createNotification({
      packageId: pkg.id,
      trackingNumber: pkg.tracking_number,
      recipientPhone: pkg.recipient_phone,
      type: 'reminder_sms',
      content,
    });

    updateReminderCount(pkg.id);

    res.json({ success: true, message: '催件通知已发送' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/packages/overdue/list', (req, res) => {
  try {
    const packages = getOverduePackages();
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/packages/abnormal/list', (req, res) => {
  try {
    const packages = getAbnormalPackages();
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/packages/abnormal/:packageId/handle', (req, res) => {
  try {
    const { note } = req.body;
    handleAbnormalPackage(req.params.packageId, note);
    res.json({ success: true, message: '异常件已处理' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const MAX_RETURN_TRACKING_LENGTH = 50;
const MAX_PLATFORM_ORDER_LENGTH = 50;
const MAX_BUYER_PHONE_LENGTH = 20;
const MAX_RETURN_REMARK_LENGTH = 200;

app.get('/api/return-orders', (req, res) => {
  try {
    const { platform = 'all', reconcileStatus = 'all', keyword = '' } = req.query;
    const orders = getReturnOrders({ platform, reconcileStatus, keyword });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/return-orders/stats', (req, res) => {
  try {
    const stats = getReturnOrderStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/return-orders/:id', (req, res) => {
  try {
    const order = getReturnOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: '未找到该退货单' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/return-orders', (req, res) => {
  try {
    let {
      platform,
      platformOrderNo,
      returnTrackingNumber,
      buyerPhone,
      refundStatus,
      shipStatus,
      amount,
      remark
    } = req.body;

    platformOrderNo = platformOrderNo ? String(platformOrderNo).trim() : '';
    returnTrackingNumber = returnTrackingNumber ? String(returnTrackingNumber).trim() : '';
    buyerPhone = buyerPhone ? String(buyerPhone).trim() : '';
    remark = remark ? String(remark).trim() : '';

    if (!platformOrderNo) {
      return res.status(400).json({ error: '平台订单号不能为空' });
    }
    if (platformOrderNo.length > MAX_PLATFORM_ORDER_LENGTH) {
      return res.status(400).json({ error: `平台订单号长度不能超过 ${MAX_PLATFORM_ORDER_LENGTH} 个字符` });
    }
    if (returnTrackingNumber.length > MAX_RETURN_TRACKING_LENGTH) {
      return res.status(400).json({ error: `退货单号长度不能超过 ${MAX_RETURN_TRACKING_LENGTH} 个字符` });
    }
    if (buyerPhone.length > MAX_BUYER_PHONE_LENGTH) {
      return res.status(400).json({ error: `买家手机号长度不能超过 ${MAX_BUYER_PHONE_LENGTH} 个字符` });
    }
    if (remark.length > MAX_RETURN_REMARK_LENGTH) {
      return res.status(400).json({ error: `备注长度不能超过 ${MAX_RETURN_REMARK_LENGTH} 个字符` });
    }

    const parsedAmount = amount !== undefined && amount !== null && amount !== ''
      ? parseFloat(amount)
      : 0;
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: '退款金额格式不正确' });
    }

    const order = createReturnOrder({
      platform,
      platformOrderNo,
      returnTrackingNumber,
      buyerPhone,
      refundStatus,
      shipStatus,
      amount: parsedAmount,
      remark
    });

    res.json({
      success: true,
      data: order,
      message: '退货单录入成功，已完成自动对账'
    });
  } catch (error) {
    console.error('退货单录入失败:', error);
    res.status(500).json({ error: error.message || '退货单录入失败' });
  }
});

app.put('/api/return-orders/:id', (req, res) => {
  try {
    const existing = getReturnOrderById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '未找到该退货单' });
    }

    const data = { ...req.body };

    if (data.platformOrderNo !== undefined) {
      data.platformOrderNo = String(data.platformOrderNo).trim();
      if (!data.platformOrderNo) {
        return res.status(400).json({ error: '平台订单号不能为空' });
      }
      if (data.platformOrderNo.length > MAX_PLATFORM_ORDER_LENGTH) {
        return res.status(400).json({ error: `平台订单号长度不能超过 ${MAX_PLATFORM_ORDER_LENGTH} 个字符` });
      }
    }
    if (data.returnTrackingNumber !== undefined) {
      data.returnTrackingNumber = String(data.returnTrackingNumber).trim();
      if (data.returnTrackingNumber.length > MAX_RETURN_TRACKING_LENGTH) {
        return res.status(400).json({ error: `退货单号长度不能超过 ${MAX_RETURN_TRACKING_LENGTH} 个字符` });
      }
    }
    if (data.buyerPhone !== undefined) {
      data.buyerPhone = String(data.buyerPhone).trim();
      if (data.buyerPhone.length > MAX_BUYER_PHONE_LENGTH) {
        return res.status(400).json({ error: `买家手机号长度不能超过 ${MAX_BUYER_PHONE_LENGTH} 个字符` });
      }
    }
    if (data.remark !== undefined) {
      data.remark = String(data.remark).trim().slice(0, MAX_RETURN_REMARK_LENGTH);
    }
    if (data.amount !== undefined && data.amount !== null && data.amount !== '') {
      data.amount = parseFloat(data.amount);
      if (isNaN(data.amount) || data.amount < 0) {
        return res.status(400).json({ error: '退款金额格式不正确' });
      }
    }

    const order = updateReturnOrder(req.params.id, data);
    res.json({
      success: true,
      data: order,
      message: '退货单已更新，已完成自动对账'
    });
  } catch (error) {
    console.error('退货单更新失败:', error);
    res.status(500).json({ error: error.message || '退货单更新失败' });
  }
});

app.delete('/api/return-orders/:id', (req, res) => {
  try {
    const result = deleteReturnOrder(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: '未找到该退货单' });
    }
    res.json({ success: true, message: '退货单已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/return-orders/:id/reconcile', (req, res) => {
  try {
    const order = reconcileReturnOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: '未找到该退货单' });
    }
    res.json({
      success: true,
      data: order,
      message: '对账完成'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/return-orders/reconcile', (req, res) => {
  try {
    const summary = reconcileAllReturnOrders();
    res.json({
      success: true,
      data: summary,
      message: `批量对账完成，共处理 ${summary.total} 单`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats();
    const shelfStats = getShelfStats();
    res.json({
      success: true,
      data: {
        ...stats,
        shelf: shelfStats,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function processOverduePackages() {
  console.log('[定时任务] 检查滞留件...');
  try {
    const overduePackages = getOverduePackages();
    console.log(`[定时任务] 找到 ${overduePackages.length} 个超过48小时未取的包裹`);

    for (const pkg of overduePackages) {
      if (pkg.status === 'in_stock') {
        markPackageOverdue(pkg.id);
        console.log(`[定时任务] 标记包裹 ${pkg.tracking_number} 为逾期状态`);
      }

      const lastReminder = pkg.last_reminder_time ? new Date(pkg.last_reminder_time) : null;
      const now = new Date();
      const hoursSinceLastReminder = lastReminder
        ? (now - lastReminder) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceLastReminder >= 24) {
        const hours = Math.floor((now - new Date(pkg.in_time).getTime()) / (1000 * 60 * 60));
        const content = generateReminderContent(pkg, hours);
        sendSmsNotification(pkg.recipient_phone, content);

        createNotification({
          packageId: pkg.id,
          trackingNumber: pkg.tracking_number,
          recipientPhone: pkg.recipient_phone,
          type: 'auto_reminder',
          content,
        });

        updateReminderCount(pkg.id);
        console.log(`[定时任务] 自动催收包裹 ${pkg.tracking_number}`);
      }
    }

    const abnormalPackages = getAbnormalPackages();
    console.log(`[定时任务] 找到 ${abnormalPackages.length} 个超过7天未取的包裹`);

    for (const pkg of abnormalPackages) {
      if (pkg.status !== 'abnormal') {
        markPackageAbnormal(pkg.id);
        console.log(`[定时任务] 标记包裹 ${pkg.tracking_number} 为异常件`);
      }
    }

    console.log('[定时任务] 滞留件检查完成');
  } catch (error) {
    console.error('[定时任务] 处理失败:', error);
  }
}

cron.schedule('0 * * * *', () => {
  processOverduePackages();
});

setTimeout(() => {
  processOverduePackages();
}, 3000);

app.listen(PORT, () => {
  console.log(`快递代收点管理系统已启动: http://localhost:${PORT}`);
  console.log(`货架数量: 3个区域 × 5行 × 4列 = 60个货架位`);
});
