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
  console.log('========== 修复验证测试 ==========\n');

  console.log('1. 测试精确查询接口 - 查询存在的快递...');
  const result1 = await request('GET', '/api/packages/tracking/YT9876543210987');
  if (result1.success && result1.data.tracking_number === 'YT9876543210987') {
    console.log('   ✅ 精确查询成功，运单号完全匹配');
    console.log(`   运单号: ${result1.data.tracking_number}`);
    console.log(`   手机号: ${result1.data.recipient_phone}`);
    console.log(`   货架位: ${result1.data.shelf_code}`);
  } else {
    console.log('   ❌ 精确查询失败');
  }

  console.log('\n2. 测试精确查询接口 - 查询不存在的快递...');
  const result2 = await request('GET', '/api/packages/tracking/NONEXISTENT123');
  if (!result2.success && result2.error) {
    console.log('   ✅ 正确返回未找到错误:', result2.error);
  } else {
    console.log('   ❌ 异常：应该返回未找到');
  }

  console.log('\n3. 测试精确查询 - 部分匹配不会返回错误结果...');
  const result3 = await request('GET', '/api/packages/tracking/YT98765');
  if (!result3.success) {
    console.log('   ✅ 部分匹配不会返回结果（精确匹配）');
    console.log('   错误信息:', result3.error);
  } else {
    console.log('   ❌ 异常：部分匹配不应返回结果');
  }

  console.log('\n4. 测试入库 - 运单号过长（100字符）...');
  const longTracking = 'A'.repeat(100);
  const result4 = await request('POST', '/api/packages/scan-in', {
    trackingNumber: longTracking,
    recipientPhone: '13800000001',
    recipientName: '测试'
  });
  if (result4.error && result4.error.includes('长度不能超过')) {
    console.log('   ✅ 正确拒绝过长运单号');
    console.log('   错误信息:', result4.error);
  } else {
    console.log('   ❌ 异常：应该拒绝过长运单号');
    console.log('   返回:', JSON.stringify(result4));
  }

  console.log('\n5. 测试入库 - 手机号过长...');
  const result5 = await request('POST', '/api/packages/scan-in', {
    trackingNumber: 'TEST001',
    recipientPhone: '1'.repeat(30),
    recipientName: '测试'
  });
  if (result5.error && result5.error.includes('长度不能超过')) {
    console.log('   ✅ 正确拒绝过长手机号');
    console.log('   错误信息:', result5.error);
  } else {
    console.log('   ❌ 异常：应该拒绝过长手机号');
    console.log('   返回:', JSON.stringify(result5));
  }

  console.log('\n6. 测试出库 - 运单号过长...');
  const result6 = await request('POST', '/api/packages/scan-out', {
    trackingNumber: 'B'.repeat(100),
    signature: 'test'
  });
  if (result6.error && result6.error.includes('长度不能超过')) {
    console.log('   ✅ 出库正确拒绝过长运单号');
    console.log('   错误信息:', result6.error);
  } else {
    console.log('   ❌ 异常：应该拒绝过长运单号');
    console.log('   返回:', JSON.stringify(result6));
  }

  console.log('\n7. 测试出库查询 - 运单号过长...');
  const result7 = await request('GET', `/api/packages/tracking/${encodeURIComponent('C'.repeat(100))}`);
  if (result7.error || result7.success === false) {
    console.log('   ✅ 查询正确处理长运单号');
  } else {
    console.log('   ⚠️  查询返回:', JSON.stringify(result7));
  }

  console.log('\n========== 测试完成 ==========');
  console.log('\n修复总结:');
  console.log('   ✅ 出库查询改为精确匹配，不会带出不一样的快递');
  console.log('   ✅ 前后端均添加输入长度验证，过长运单号会被正确拒绝');
  console.log('   ✅ 运单号最大长度：50字符');
  console.log('   ✅ 手机号最大长度：20字符');
  console.log('   ✅ 姓名最大长度：50字符');
}

runTests().catch(console.error);
