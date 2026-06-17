import {
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

const vector = customType<{
	data: number[];
	driverData: string;
	config: { dimensions: number };
}>({
	dataType(config) {
		return `vector(${config?.dimensions ?? 2048})`;
	},
	toDriver(value) {
		return `[${value.join(",")}]`;
	},
});

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
	clothingType: text('clothing_type').notNull(),
	topGarmentUrl: text('top_garment_url'),
	bottomGarmentUrl: text('bottom_garment_url'),
	resultImageUrl: text('result_image_url').notNull(),
	resultOssKey: text('result_oss_key').notNull(),
	originalResultUrl: text('original_result_url'),
	taskId: text('task_id'),
	outfitId: text('outfit_id'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const miniappAccount = pgTable("miniapp_account", {
	id: text("id").primaryKey(),
	openid: text('openid').notNull().unique(),
	unionid: text('unionid'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
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

export const workerEmployee = pgTable("worker_employee", {
	id: text("id").primaryKey(),
	name: text('name').notNull(),
	responsibility: text('responsibility').notNull(),
	suitableTasks: text('suitable_tasks').notNull(),
	solvesProblem: text('solves_problem').notNull(),
	employeeDir: text('employee_dir').notNull(),
	readmePath: text('readme_path').notNull(),
	soulPath: text('soul_path'),
	status: text('status').notNull().default('draft'),
	monthlyPriceId: text('monthly_price_id').notNull(),
	monthlyAmount: integer('monthly_amount').notNull(),
	currency: text('currency').notNull().default('CNY'),
	sourceHash: text('source_hash').notNull(),
	latestVersionId: text('latest_version_id'),
	syncedAt: timestamp('synced_at').notNull().defaultNow(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workerEmployeeVersion = pgTable("worker_employee_version", {
	id: text("id").primaryKey(),
	employeeId: text('employee_id').notNull().references(() => workerEmployee.id, { onDelete: 'cascade' }),
	soulPath: text('soul_path').notNull(),
	soulHash: text('soul_hash').notNull(),
	readmeHash: text('readme_hash').notNull(),
	skillsHash: text('skills_hash').notNull(),
	soulSnapshot: text('soul_snapshot').notNull(),
	readmeSnapshot: text('readme_snapshot').notNull(),
	skillsSummary: jsonb('skills_summary').$type<string[]>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const workerInstance = pgTable("worker_instance", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	employeeId: text('employee_id').notNull().references(() => workerEmployee.id, { onDelete: 'restrict' }),
	employeeVersionId: text('employee_version_id').notNull().references(() => workerEmployeeVersion.id, { onDelete: 'restrict' }),
	personaId: text('persona_id'),
	personaPrompt: text('persona_prompt'),
	status: text('status').notNull().default('pending_payment'),
	paymentStatus: text('payment_status').notNull().default('unpaid'),
	priceId: text('price_id').notNull(),
	accessSource: text('access_source').notNull().default('direct_purchase'),
	membershipPriceId: text('membership_price_id'),
	subscriptionId: text('subscription_id'),
	checkoutSessionId: text('checkout_session_id'),
	profileName: text('profile_name'),
	activationId: text('activation_id'),
	qrPayload: text('qr_payload'),
	qrImageUrl: text('qr_image_url'),
	activationExpiresAt: timestamp('activation_expires_at'),
	weixinAccountId: text('weixin_account_id'),
	weixinUserId: text('weixin_user_id'),
	gatewayStatus: text('gateway_status'),
	error: text('error'),
	activatedAt: timestamp('activated_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workerSyncRun = pgTable("worker_sync_run", {
	id: text("id").primaryKey(),
	sourceRoot: text('source_root').notNull(),
	status: text('status').notNull(),
	total: integer('total').notNull().default(0),
	synced: integer('synced').notNull().default(0),
	skipped: integer('skipped').notNull().default(0),
	errors: jsonb('errors').$type<string[]>().notNull(),
	createdBy: text('created_by'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	completedAt: timestamp('completed_at'),
});

export const workerSkill = pgTable("worker_skill", {
	id: text("id").primaryKey(),
	name: text('name').notNull(),
	summary: text('summary').notNull(),
	category: text('category').notNull().default('professional'),
	skillType: text('skill_type').notNull().default('config'),
	riskLevel: text('risk_level').notNull().default('low'),
	status: text('status').notNull().default('draft'),
	defaultEnabled: boolean('default_enabled').notNull().default(false),
	requiresUserConfig: boolean('requires_user_config').notNull().default(false),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workerEmployeeSkill = pgTable("worker_employee_skill", {
	id: text("id").primaryKey(),
	employeeId: text('employee_id').notNull().references(() => workerEmployee.id, { onDelete: 'cascade' }),
	skillId: text('skill_id').notNull().references(() => workerSkill.id, { onDelete: 'cascade' }),
	status: text('status').notNull().default('allowed'),
	defaultEnabled: boolean('default_enabled').notNull().default(false),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workerInstanceSkill = pgTable("worker_instance_skill", {
	id: text("id").primaryKey(),
	instanceId: text('instance_id').notNull().references(() => workerInstance.id, { onDelete: 'cascade' }),
	skillId: text('skill_id').notNull().references(() => workerSkill.id, { onDelete: 'cascade' }),
	enabled: boolean('enabled').notNull().default(false),
	source: text('source').notNull().default('user'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workerSkillKnowledgePack = pgTable("worker_skill_knowledge_pack", {
	id: text("id").primaryKey(),
	skillId: text('skill_id').notNull().references(() => workerSkill.id, { onDelete: 'cascade' }),
	knowledgePackId: text('knowledge_pack_id').notNull().references(() => knowledgePack.id, { onDelete: 'cascade' }),
	status: text('status').notNull().default('enabled'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('worker_skill_knowledge_pack_unique_idx').on(table.skillId, table.knowledgePackId),
	index('worker_skill_knowledge_pack_skill_id_idx').on(table.skillId),
	index('worker_skill_knowledge_pack_pack_id_idx').on(table.knowledgePackId),
]);

export const workerToolRun = pgTable("worker_tool_run", {
	id: text("id").primaryKey(),
	instanceId: text('instance_id').notNull().references(() => workerInstance.id, { onDelete: 'cascade' }),
	skillId: text('skill_id').references(() => workerSkill.id, { onDelete: 'set null' }),
	status: text('status').notNull(),
	inputSummary: text('input_summary'),
	outputSummary: text('output_summary'),
	error: text('error'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	completedAt: timestamp('completed_at'),
});

export const knowledgeDocument = pgTable("knowledge_documents", {
	id: text("id").primaryKey(),
	source: text('source').notNull(),
	category: text('category').notNull(),
	title: text('title').notNull(),
	filePath: text('file_path').notNull(),
	contentHash: text('content_hash').notNull(),
	rawContent: text('raw_content').notNull(),
	status: text('status').notNull().default('active'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	importedAt: timestamp('imported_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const knowledgeChunk = pgTable("knowledge_chunks", {
	id: text("id").primaryKey(),
	documentId: text('document_id').notNull().references(() => knowledgeDocument.id, { onDelete: 'cascade' }),
	chunkIndex: integer('chunk_index').notNull(),
	heading: text('heading'),
	content: text('content').notNull(),
	tokenCount: integer('token_count'),
	embedding: vector('embedding', { dimensions: 2048 }),
	embeddingModel: text('embedding_model').notNull().default('embedding-3'),
	embeddingDimensions: integer('embedding_dimensions').notNull().default(2048),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const knowledgeUnit = pgTable("knowledge_units", {
	id: text("id").primaryKey(),
	documentId: text('document_id').references(() => knowledgeDocument.id, { onDelete: 'cascade' }),
	chunkId: text('chunk_id').references(() => knowledgeChunk.id, { onDelete: 'set null' }),
	unitType: text('unit_type').notNull(),
	intent: text('intent').notNull(),
	title: text('title').notNull(),
	answer: text('answer').notNull(),
	sourceQuote: text('source_quote'),
	riskLevel: text('risk_level').notNull().default('low'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const knowledgePack = pgTable("knowledge_packs", {
	id: text("id").primaryKey(),
	name: text('name').notNull(),
	description: text('description').notNull(),
	scope: text('scope').notNull(),
	status: text('status').notNull().default('draft'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const knowledgePackDocument = pgTable("knowledge_pack_documents", {
	id: text("id").primaryKey(),
	knowledgePackId: text('knowledge_pack_id').notNull().references(() => knowledgePack.id, { onDelete: 'cascade' }),
	documentId: text('document_id').notNull().references(() => knowledgeDocument.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const workerEmployeeKnowledgePack = pgTable("worker_employee_knowledge_pack", {
	id: text("id").primaryKey(),
	employeeId: text('employee_id').notNull().references(() => workerEmployee.id, { onDelete: 'cascade' }),
	knowledgePackId: text('knowledge_pack_id').notNull().references(() => knowledgePack.id, { onDelete: 'cascade' }),
	status: text('status').notNull().default('enabled'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const knowledgeIngestRun = pgTable("knowledge_ingest_run", {
	id: text("id").primaryKey(),
	knowledgePackId: text('knowledge_pack_id').references(() => knowledgePack.id, { onDelete: 'set null' }),
	sourceRoot: text('source_root').notNull(),
	status: text('status').notNull(),
	totalDocuments: integer('total_documents').notNull().default(0),
	importedDocuments: integer('imported_documents').notNull().default(0),
	skippedDocuments: integer('skipped_documents').notNull().default(0),
	totalChunks: integer('total_chunks').notNull().default(0),
	embeddedChunks: integer('embedded_chunks').notNull().default(0),
	totalUnits: integer('total_units').notNull().default(0),
	errors: jsonb('errors').$type<string[]>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	completedAt: timestamp('completed_at'),
});

export const workerUserProfile = pgTable("worker_user_profile", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	scope: text('scope').notNull().default('global'),
	summary: text('summary').notNull().default(''),
	facts: jsonb('facts').$type<Record<string, unknown>>().notNull(),
	source: text('source').notNull().default('system'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('worker_user_profile_user_scope_unique_idx').on(table.userId, table.scope),
	index('worker_user_profile_user_id_idx').on(table.userId),
]);

export const workerMemory = pgTable("worker_memory", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	instanceId: text('instance_id').references(() => workerInstance.id, { onDelete: 'cascade' }),
	skillId: text('skill_id').references(() => workerSkill.id, { onDelete: 'set null' }),
	visibility: text('visibility').notNull().default('instance'),
	memoryType: text('memory_type').notNull().default('fact'),
	content: text('content').notNull(),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	status: text('status').notNull().default('active'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	index('worker_memory_user_visibility_idx').on(table.userId, table.visibility),
	index('worker_memory_instance_id_idx').on(table.instanceId),
	index('worker_memory_skill_id_idx').on(table.skillId),
]);

export const workerPushSubscription = pgTable("worker_push_subscription", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	skillId: text('skill_id').references(() => workerSkill.id, { onDelete: 'set null' }),
	knowledgePackId: text('knowledge_pack_id').references(() => knowledgePack.id, { onDelete: 'set null' }),
	topic: text('topic').notNull(),
	channel: text('channel').notNull().default('weixin'),
	enabled: boolean('enabled').notNull().default(true),
	frequency: text('frequency').notNull().default('normal'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('worker_push_subscription_user_topic_channel_unique_idx').on(table.userId, table.topic, table.channel),
	index('worker_push_subscription_user_id_idx').on(table.userId),
	index('worker_push_subscription_skill_id_idx').on(table.skillId),
]);

export const workerContentItem = pgTable("worker_content_item", {
	id: text("id").primaryKey(),
	title: text('title').notNull(),
	summary: text('summary').notNull().default(''),
	url: text('url').notNull(),
	contentType: text('content_type').notNull().default('article'),
	status: text('status').notNull().default('draft'),
	tags: jsonb('tags').$type<string[]>().notNull(),
	createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	index('worker_content_item_status_idx').on(table.status),
	index('worker_content_item_content_type_idx').on(table.contentType),
]);

export const workerPushDelivery = pgTable("worker_push_delivery", {
	id: text("id").primaryKey(),
	contentId: text('content_id').notNull().references(() => workerContentItem.id, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	instanceId: text('instance_id').references(() => workerInstance.id, { onDelete: 'set null' }),
	channel: text('channel').notNull().default('weixin'),
	status: text('status').notNull().default('pending'),
	payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
	error: text('error'),
	sentAt: timestamp('sent_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	index('worker_push_delivery_content_id_idx').on(table.contentId),
	index('worker_push_delivery_user_id_idx').on(table.userId),
	index('worker_push_delivery_status_idx').on(table.status),
]);

export const eduWorkspace = pgTable("edu_workspace", {
	id: text("id").primaryKey(),
	ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
	name: text('name').notNull(),
	slug: text('slug').notNull(),
	status: text('status').notNull().default('active'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('edu_workspace_slug_unique_idx').on(table.slug),
	index('edu_workspace_owner_user_id_idx').on(table.ownerUserId),
	index('edu_workspace_status_idx').on(table.status),
]);

export const eduCourseware = pgTable("edu_courseware", {
	id: text("id").primaryKey(),
	workspaceId: text('workspace_id').notNull().references(() => eduWorkspace.id, { onDelete: 'cascade' }),
	createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	slug: text('slug').notNull(),
	locale: text('locale').notNull().default('zh'),
	description: text('description').notNull().default(''),
	sourceSlug: text('source_slug'),
	whiteboardPrompt: text('whiteboard_prompt').notNull().default(''),
	htmlContent: text('html_content').notNull(),
	mdxSource: text('mdx_source').notNull(),
	provider: text('provider'),
	model: text('model'),
	status: text('status').notNull().default('published'),
	visibility: text('visibility').notNull().default('private'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('edu_courseware_workspace_slug_locale_unique_idx').on(table.workspaceId, table.slug, table.locale),
	index('edu_courseware_workspace_id_idx').on(table.workspaceId),
	index('edu_courseware_created_by_idx').on(table.createdBy),
	index('edu_courseware_status_idx').on(table.status),
]);

export const eduBlogPost = pgTable("edu_blog_post", {
	id: text("id").primaryKey(),
	workspaceId: text('workspace_id').notNull().references(() => eduWorkspace.id, { onDelete: 'cascade' }),
	coursewareId: text('courseware_id').references(() => eduCourseware.id, { onDelete: 'set null' }),
	createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
	postType: text('post_type').notNull().default('courseware'),
	title: text('title').notNull(),
	slug: text('slug').notNull(),
	locale: text('locale').notNull().default('zh'),
	description: text('description').notNull().default(''),
	image: text('image').notNull().default('/images/blog/interactive-math-game.png'),
	mdxSource: text('mdx_source').notNull(),
	whiteboardCategory: text('whiteboard_category').notNull().default('education'),
	whiteboardPrompt: text('whiteboard_prompt').notNull().default(''),
	status: text('status').notNull().default('published'),
	visibility: text('visibility').notNull().default('private'),
	publishedAt: timestamp('published_at'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('edu_blog_post_workspace_slug_locale_unique_idx').on(table.workspaceId, table.slug, table.locale),
	index('edu_blog_post_workspace_id_idx').on(table.workspaceId),
	index('edu_blog_post_courseware_id_idx').on(table.coursewareId),
	index('edu_blog_post_created_by_idx').on(table.createdBy),
	index('edu_blog_post_status_idx').on(table.status),
]);

export const eduBoard = pgTable("edu_board", {
	id: text("id").primaryKey(),
	workspaceId: text('workspace_id').notNull().references(() => eduWorkspace.id, { onDelete: 'cascade' }),
	createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	slug: text('slug').notNull(),
	studentId: text('student_id'),
	lessonId: text('lesson_id'),
	status: text('status').notNull().default('active'),
	visibility: text('visibility').notNull().default('private'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('edu_board_workspace_slug_unique_idx').on(table.workspaceId, table.slug),
	index('edu_board_workspace_id_idx').on(table.workspaceId),
	index('edu_board_created_by_idx').on(table.createdBy),
	index('edu_board_student_id_idx').on(table.studentId),
]);

export const eduBoardShape = pgTable("edu_board_shape", {
	id: text("id").primaryKey(),
	boardId: text('board_id').notNull().references(() => eduBoard.id, { onDelete: 'cascade' }),
	shapeType: text('shape_type').notNull(),
	shapeData: jsonb('shape_data').$type<Record<string, unknown>>().notNull(),
	orderIndex: integer('order_index').notNull().default(0),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	index('edu_board_shape_board_id_idx').on(table.boardId),
	index('edu_board_shape_shape_type_idx').on(table.shapeType),
]);
