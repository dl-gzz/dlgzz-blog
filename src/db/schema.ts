import { boolean, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	role: text('role'),
	banned: boolean('banned'),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires'),
	customerId: text('customer_id'),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	impersonatedBy: text('impersonated_by')
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at')
});

export const payment = pgTable("payment", {
	id: text("id").primaryKey(),
	priceId: text('price_id').notNull(),
	type: text('type').notNull(),
	interval: text('interval'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	customerId: text('customer_id').notNull(),
	subscriptionId: text('subscription_id'),
	status: text('status').notNull(),
	periodStart: timestamp('period_start'),
	periodEnd: timestamp('period_end'),
	cancelAtPeriodEnd: boolean('cancel_at_period_end'),
	trialStart: timestamp('trial_start'),
	trialEnd: timestamp('trial_end'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const customModel = pgTable("custom_model", {
	id: text("id").primaryKey(),
	name: text('name').notNull(),
	height: text('height').notNull(),
	weight: text('weight').notNull(),
	bodyType: text('body_type').notNull(),
	style: text('style').notNull(),
	imageUrl: text('image_url').notNull(),
	ossKey: text('oss_key').notNull(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const tryOnHistory = pgTable("try_on_history", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	modelName: text('model_name').notNull(),
	modelImageUrl: text('model_image_url').notNull(),
	clothingType: text('clothing_type').notNull(), // 'topAndBottom' or 'onepiece'
	topGarmentUrl: text('top_garment_url'),
	bottomGarmentUrl: text('bottom_garment_url'),
	resultImageUrl: text('result_image_url').notNull(), // 保存到我们OSS的URL
	resultOssKey: text('result_oss_key').notNull(),
	originalResultUrl: text('original_result_url'), // AI返回的原始URL（24h有效期）
	taskId: text('task_id'), // AI任务ID
	outfitId: text('outfit_id'), // 如果来自套装，记录套装ID
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// 文件下载统计表
export const fileDownload = pgTable("file_download", {
	id: text("id").primaryKey(),
	fileKey: text('file_key').notNull(), // 文件标识
	fileName: text('file_name').notNull(), // 文件名
	fileSize: integer('file_size'), // 文件大小（字节）
	userId: text('user_id').references(() => user.id, { onDelete: 'set null' }), // 下载用户（可为空，匿名下载）
	userEmail: text('user_email'), // 用户邮箱（冗余字段，方便查询）
	ipAddress: text('ip_address'), // IP 地址
	userAgent: text('user_agent'), // 浏览器信息
	referer: text('referer'), // 来源页面
	requireAuth: boolean('require_auth').notNull().default(false), // 是否需要登录
	requirePremium: boolean('require_premium').notNull().default(false), // 是否需要付费
	downloadedAt: timestamp('downloaded_at').notNull().defaultNow(), // 下载时间
});
