/**
 * 修复支付状态脚本
 *
 * 用途：将状态为 'processing' 但已经过了一段时间的支付记录更新为 'completed'
 *
 * 使用方法：
 * npx tsx scripts/fix-payment-status.ts
 */

import { getDb } from '../src/db';
import { payment } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

async function fixPaymentStatus() {
  console.log('开始修复支付状态...\n');

  const db = await getDb();

  // 查找所有 status 为 'processing' 的支付记录
  const processingPayments = await db
    .select()
    .from(payment)
    .where(eq(payment.status, 'processing'));

  console.log(`找到 ${processingPayments.length} 条状态为 'processing' 的支付记录\n`);

  if (processingPayments.length === 0) {
    console.log('没有需要修复的记录');
    return;
  }

  // 显示这些记录
  console.log('需要修复的支付记录：');
  processingPayments.forEach((p, index) => {
    console.log(`${index + 1}. ID: ${p.id}`);
    console.log(`   订阅ID: ${p.subscriptionId}`);
    console.log(`   用户ID: ${p.userId}`);
    console.log(`   价格ID: ${p.priceId}`);
    console.log(`   创建时间: ${p.createdAt}`);
    console.log(`   到期时间: ${p.periodEnd}`);
    console.log('');
  });

  // 询问是否继续
  console.log('是否要将这些记录的状态更新为 "completed"?');
  console.log('请在代码中手动确认，然后取消注释下面的更新代码\n');

  // 取消下面的注释以执行更新
  /*
  for (const p of processingPayments) {
    await db
      .update(payment)
      .set({
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(payment.id, p.id));

    console.log(`✅ 已更新支付记录 ${p.id} 的状态为 completed`);
  }

  console.log('\n修复完成！');
  */

  console.log('⚠️  请检查上述记录，确认无误后取消注释更新代码并重新运行');
}

fixPaymentStatus()
  .then(() => {
    console.log('\n脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('脚本执行出错:', error);
    process.exit(1);
  });
