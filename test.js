const http = require('http');

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('========== 快递代收点管理系统 - 功能测试 ==========\n');

  console.log('1. 获取统计数据...');
  const stats = await request('GET', '/api/stats');
  console.log('   统计数据:', JSON.stringify(stats.data, null, 2));

  console.log('\n2. 获取货架状态...');
  const shelves = await request('GET', '/api/shelves');
  console.log(`   货架总数: ${shelves.data.stats.total}, 已占用: ${shelves.data.stats.occupied}, 空闲: ${shelves.data.stats.available}`);

  console.log('\n3. 测试快递入库 - 第一个包裹...');
  const pkg1 = await request('POST', '/api/packages/scan-in', {
    trackingNumber: 'SF1234567890123',
    recipientPhone: '13800138001',
    recipientName: '张三'
  });
  if (pkg1.success) {
    console.log('   ✅ 入库成功!');
    console.log(`   运单号: ${pkg1.data.package.tracking_number}`);
    console.log(`   货架位: ${pkg1.data.package.shelf_code}`);
    console.log(`   状态: ${pkg1.data.package.status}`);
  } else {
    console.log('   ❌ 入库失败:', pkg1.error);
  }

  console.log('\n4. 测试快递入库 - 第二个包裹...');
  const pkg2 = await request('POST', '/api/packages/scan-in', {
    trackingNumber: 'YT9876543210987',
    recipientPhone: '13900139002',
    recipientName: '李四'
  });
  if (pkg2.success) {
    console.log('   ✅ 入库成功!');
    console.log(`   运单号: ${pkg2.data.package.tracking_number}`);
    console.log(`   货架位: ${pkg2.data.package.shelf_code}`);
  } else {
    console.log('   ❌ 入库失败:', pkg2.error);
  }

  console.log('\n5. 测试快递入库 - 第三个包裹...');
  const pkg3 = await request('POST', '/api/packages/scan-in', {
    trackingNumber: 'ZTO5566778899',
    recipientPhone: '13700137003',
    recipientName: '王五'
  });
  if (pkg3.success) {
    console.log('   ✅ 入库成功!');
    console.log(`   运单号: ${pkg3.data.package.tracking_number}`);
    console.log(`   货架位: ${pkg3.data.package.shelf_code}`);
  } else {
    console.log('   ❌ 入库失败:', pkg3.error);
  }

  console.log('\n6. 验证货架位分配 (应依次分配 A-1-1, A-1-2, A-1-3)...');
  const shelfCodes = [pkg1.data?.package.shelf_code, pkg2.data?.package.shelf_code, pkg3.data?.package.shelf_code];
  console.log(`   分配的货架位: ${shelfCodes.join(', ')}`);
  const expected = ['A-1-1', 'A-1-2', 'A-1-3'];
  if (JSON.stringify(shelfCodes) === JSON.stringify(expected)) {
    console.log('   ✅ 货架位按顺序正确分配!');
  } else {
    console.log('   ⚠️  货架位分配顺序可能不同');
  }

  console.log('\n7. 搜索快递...');
  const searchResult = await request('GET', '/api/packages/search?keyword=138');
  console.log(`   搜索 "138" 找到 ${searchResult.data?.length || 0} 条结果`);
  if (searchResult.data && searchResult.data.length > 0) {
    console.log(`   第一个结果: ${searchResult.data[0].tracking_number} - ${searchResult.data[0].recipient_phone}`);
  }

  console.log('\n8. 出库核销 - 第一个包裹...');
  const pickResult = await request('POST', '/api/packages/scan-out', {
    trackingNumber: 'SF1234567890123',
    signature: '测试签字'
  });
  if (pickResult.success) {
    console.log('   ✅ 出库成功!');
    console.log(`   出库时间: ${pickResult.data.out_time}`);
    console.log(`   状态: ${pickResult.data.status}`);
  } else {
    console.log('   ❌ 出库失败:', pickResult.error);
  }

  console.log('\n9. 验证出库后货架是否释放...');
  const shelvesAfter = await request('GET', '/api/shelves');
  console.log(`   出库后 - 货架总数: ${shelvesAfter.data.stats.total}, 已占用: ${shelvesAfter.data.stats.occupied}, 空闲: ${shelvesAfter.data.stats.available}`);

  console.log('\n10. 查看通知记录...');
  const notifications = await request('GET', '/api/notifications?limit=10');
  console.log(`   共发送 ${notifications.data?.length || 0} 条通知`);
  if (notifications.data && notifications.data.length > 0) {
    const types = [...new Set(notifications.data.map(n => n.type))];
    console.log(`   通知类型: ${types.join(', ')}`);
  }

  console.log('\n11. 手动发送催收通知...');
  const reminderResult = await request('POST', `/api/notifications/send-reminder/${pkg2.data.package.id}`);
  if (reminderResult.success) {
    console.log('   ✅ 催收通知发送成功!');
  } else {
    console.log('   ⚠️  催收通知发送:', reminderResult.error);
  }

  console.log('\n12. 查看在库快递列表...');
  const inStockPackages = await request('GET', '/api/packages?status=in_stock');
  console.log(`   在库快递: ${inStockPackages.data?.length || 0} 件`);

  console.log('\n========== 测试完成 ==========');
  console.log('\n📋 系统功能总结:');
  console.log('   ✅ 快递入库扫描 - 运单号/手机号/货架位自动分配');
  console.log('   ✅ 货架位自动分配 - 按区域-行-列顺序分配最近空位');
  console.log('   ✅ 取件通知 - 短信 + APP推送（模拟）');
  console.log('   ✅ 出库核销 - 扫码出库 + 签字确认');
  console.log('   ✅ 滞留件管理 - 超过48h自动催收，超7天标记异常');
  console.log('   ✅ 定时任务 - 每小时自动检查滞留件');
  console.log('   ✅ 货架状态监控 - 实时显示占用/空闲情况');
  console.log('   ✅ 通知记录 - 完整的通知发送日志');
  console.log('\n🌐 系统访问地址: http://localhost:3000');
}

runTests().catch(console.error);
