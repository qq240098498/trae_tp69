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
} = require('./db');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/api/packages/scan-in', (req, res) => {
  try {
    const { trackingNumber, recipientPhone, recipientName } = req.body;

    if (!trackingNumber || !recipientPhone) {
      return res.status(400).json({ error: '运单号和手机号不能为空' });
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
    const { trackingNumber, signature } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: '运单号不能为空' });
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
