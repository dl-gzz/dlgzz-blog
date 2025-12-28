const postgres = require('postgres');

async function testConnection() {
  console.log('========== 测试 SSL 连接配置 ==========\n');

  const connectionString = process.env.DATABASE_URL ||
    'postgresql://root:By%40198605@bj-postgres-4g3eescm.sql.tencentcdb.com:21726/dlgzz';

  console.log('连接字符串:', connectionString.replace(/:[^:@]+@/, ':****@'));
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

  const isProduction = process.env.NODE_ENV === 'production';
  const hasSslParam = connectionString.includes('ssl=true') || connectionString.includes('sslmode=require');

  console.log('是否生产环境:', isProduction);
  console.log('包含 SSL 参数:', hasSslParam);
  console.log('将使用 SSL:', isProduction || hasSslParam);

  console.log('\n========== 尝试连接（与 getDb() 相同配置）==========\n');

  const client = postgres(connectionString, {
    prepare: false,
    ssl: (isProduction || hasSslParam) ? { rejectUnauthorized: false } : false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    console.log('正在连接数据库...');
    const result = await client`SELECT version(), current_database(), current_user`;
    console.log('✅ 连接成功！');
    console.log('数据库版本:', result[0].version);
    console.log('当前数据库:', result[0].current_database);
    console.log('当前用户:', result[0].current_user);
    await client.end();
    console.log('\n✅ 测试通过！');
  } catch (err) {
    console.error('❌ 连接失败:', err.message);
    console.error('错误代码:', err.code);
    if (err.cause) {
      console.error('原因:', err.cause.message || err.cause);
    }
    process.exit(1);
  }
}

testConnection();
