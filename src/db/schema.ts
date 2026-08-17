import {
	boolean,
	customType,
	index,
	integer,
	jsonb,
	numeric,
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

export const miniappAccount = pgTable("miniapp_account", {
	id: text("id").primaryKey(),
	openid: text('openid').notNull().unique(),
	unionid: text('unionid'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const healthUserProfile = pgTable("health_user_profile", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	displayName: text('display_name').notNull().default(''),
	sex: text('sex').notNull().default('unknown'),
	birthYear: integer('birth_year'),
	heightCm: integer('height_cm'),
	targets: jsonb('targets').$type<Record<string, unknown>>().notNull(),
	medicationNotes: text('medication_notes').notNull().default(''),
	riskNotes: text('risk_notes').notNull().default(''),
	hermesAssistantId: text('hermes_assistant_id'),
	hermesActivationId: text('hermes_activation_id'),
	hermesProfileName: text('hermes_profile_name'),
	hermesConnectionMode: text('hermes_connection_mode'),
	hermesStatus: text('hermes_status').notNull().default('not_connected'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('health_user_profile_user_id_unique_idx').on(table.userId),
	index('health_user_profile_hermes_assistant_id_idx').on(table.hermesAssistantId),
]);

export const healthMeasurement = pgTable("health_measurement", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	profileId: text('profile_id').notNull().references(() => healthUserProfile.id, { onDelete: 'cascade' }),
	measuredAt: timestamp('measured_at').notNull(),
	entryType: text('entry_type').notNull().default('daily'),
	systolic: integer('systolic'),
	diastolic: integer('diastolic'),
	heartRate: integer('heart_rate'),
	fastingGlucoseMmol: numeric('fasting_glucose_mmol', { precision: 5, scale: 2 }),
	postprandialGlucoseMmol: numeric('postprandial_glucose_mmol', { precision: 5, scale: 2 }),
	totalCholesterolMmol: numeric('total_cholesterol_mmol', { precision: 5, scale: 2 }),
	triglyceridesMmol: numeric('triglycerides_mmol', { precision: 5, scale: 2 }),
	hdlMmol: numeric('hdl_mmol', { precision: 5, scale: 2 }),
	ldlMmol: numeric('ldl_mmol', { precision: 5, scale: 2 }),
	weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
	waistCm: numeric('waist_cm', { precision: 5, scale: 2 }),
	notes: text('notes').notNull().default(''),
	source: text('source').notNull().default('manual'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	index('health_measurement_user_measured_at_idx').on(table.userId, table.measuredAt),
	index('health_measurement_profile_measured_at_idx').on(table.profileId, table.measuredAt),
]);

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
	status: text('status').notNull().default('pending'),
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

export const knowledgeAsset = pgTable("knowledge_assets", {
	id: text("id").primaryKey(),
	contentHash: text('content_hash').notNull(),
	assetType: text('asset_type').notNull().default('image'),
	mimeType: text('mime_type').notNull(),
	storageProvider: text('storage_provider').notNull().default('cos'),
	storageBucket: text('storage_bucket'),
	objectKey: text('object_key'),
	publicUrl: text('public_url'),
	title: text('title'),
	platform: text('platform'),
	thumbnailUrl: text('thumbnail_url'),
	embedUrl: text('embed_url'),
	width: integer('width'),
	height: integer('height'),
	durationSeconds: integer('duration_seconds'),
	publishedAt: timestamp('published_at'),
	caption: text('caption'),
	ocrText: text('ocr_text'),
	visualFacts: jsonb('visual_facts').$type<Record<string, unknown>>().notNull(),
	embeddingText: text('embedding_text'),
	embeddingTextHash: text('embedding_text_hash'),
	embedding: vector('embedding', { dimensions: 2048 }),
	embeddingModel: text('embedding_model'),
	embeddingDimensions: integer('embedding_dimensions'),
	embeddedAt: timestamp('embedded_at'),
	analysisProvider: text('analysis_provider'),
	analysisModel: text('analysis_model'),
	analysisVersion: text('analysis_version'),
	analyzedAt: timestamp('analyzed_at'),
	sourceType: text('source_type'),
	sourceLocator: text('source_locator'),
	status: text('status').notNull().default('pending'),
	visibility: text('visibility').notNull().default('private'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('knowledge_assets_content_hash_unique_idx').on(table.contentHash),
	index('knowledge_assets_object_key_idx').on(table.storageProvider, table.storageBucket, table.objectKey),
	index('knowledge_assets_status_visibility_idx').on(table.status, table.visibility),
	index('knowledge_assets_type_status_idx').on(table.assetType, table.status, table.visibility),
]);

export const knowledgeAssetLink = pgTable("knowledge_asset_links", {
	id: text("id").primaryKey(),
	assetId: text('asset_id').notNull().references(() => knowledgeAsset.id, { onDelete: 'cascade' }),
	documentId: text('document_id').notNull().references(() => knowledgeDocument.id, { onDelete: 'cascade' }),
	chunkId: text('chunk_id').references(() => knowledgeChunk.id, { onDelete: 'set null' }),
	role: text('role').notNull().default('inline'),
	sourceRef: text('source_ref').notNull(),
	occurrenceIndex: integer('occurrence_index').notNull().default(0),
	altText: text('alt_text'),
	context: text('context'),
	sortOrder: integer('sort_order').notNull().default(0),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('knowledge_asset_links_occurrence_unique_idx').on(table.documentId, table.sourceRef, table.occurrenceIndex),
	index('knowledge_asset_links_chunk_id_idx').on(table.chunkId),
	index('knowledge_asset_links_document_role_idx').on(table.documentId, table.role),
	index('knowledge_asset_links_asset_id_idx').on(table.assetId),
]);

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

// ─────────────────────────────────────────────────────────
// API Key 层：付费 Skill 安装 + 知识包检索的鉴权与计量
// ─────────────────────────────────────────────────────────

/** 用户的 API Key。明文只在签发时返回一次，库里只存 sha256。 */
export const apiKey = pgTable("api_key", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	name: text('name').notNull().default(''),
	keyHash: text('key_hash').notNull(),
	keyPrefix: text('key_prefix').notNull(), // 展示用，如 dk_live_a1b2…
	status: text('status').notNull().default('active'), // active | revoked
	monthlyQuota: integer('monthly_quota').notNull().default(1000),
	lastUsedAt: timestamp('last_used_at'),
	revokedAt: timestamp('revoked_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('api_key_key_hash_unique_idx').on(table.keyHash),
	index('api_key_user_id_idx').on(table.userId),
]);

/** Key ↔ 知识包授权：买了哪个包，Key 就只能查哪个包。 */
export const apiKeyPackGrant = pgTable("api_key_pack_grant", {
	id: text("id").primaryKey(),
	apiKeyId: text('api_key_id').notNull().references(() => apiKey.id, { onDelete: 'cascade' }),
	knowledgePackId: text('knowledge_pack_id').notNull(),
	source: text('source').notNull().default('purchase'), // purchase | membership | admin
	expiresAt: timestamp('expires_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('api_key_pack_grant_unique_idx').on(table.apiKeyId, table.knowledgePackId),
	index('api_key_pack_grant_pack_idx').on(table.knowledgePackId),
]);

/** 用量计量：每次检索/安装记一条。这是"能不能算账"的地基。 */
export const apiUsageEvent = pgTable("api_usage_event", {
	id: text("id").primaryKey(),
	apiKeyId: text('api_key_id').references(() => apiKey.id, { onDelete: 'set null' }),
	userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
	// 未登录访客的稳定标识（IP 哈希），用于免费试用额度计数
	visitorId: text('visitor_id'),
	kind: text('kind').notNull(), // knowledge_query | skill_install | web_chat
	knowledgePackId: text('knowledge_pack_id'),
	serviceId: text('service_id'),
	query: text('query').notNull().default(''),
	resultCount: integer('result_count').notNull().default(0),
	embeddingTokens: integer('embedding_tokens').notNull().default(0),
	latencyMs: integer('latency_ms').notNull().default(0),
	status: text('status').notNull().default('ok'), // pending | ok | denied | error
	createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
	index('api_usage_event_key_created_idx').on(table.apiKeyId, table.createdAt),
	index('api_usage_event_user_created_idx').on(table.userId, table.createdAt),
	index('api_usage_event_visitor_created_idx').on(table.visitorId, table.createdAt),
	index('api_usage_event_pack_idx').on(table.knowledgePackId),
]);

/** 不计入月额度的公开 API 固定窗口限流；每个账号/能力只保留一行。 */
export const apiRateLimitBucket = pgTable("api_rate_limit_bucket", {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	kind: text('kind').notNull(),
	windowStart: timestamp('window_start').notNull(),
	requestCount: integer('request_count').notNull().default(0),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('api_rate_limit_bucket_user_kind_unique_idx').on(table.userId, table.kind),
	index('api_rate_limit_bucket_updated_idx').on(table.updatedAt),
]);

// ─────────────────────────────────────────────────────────
// OneWorkOS 会员授权层：兑换码 → 用户权益 → 设备 Key
// ─────────────────────────────────────────────────────────

/**
 * 面向小红书/抖音成交用户的一次性兑换码。
 * 数据库只保存哈希，原始兑换码只在管理员签发和用户兑换时短暂出现。
 */
export const oneworkActivationCode = pgTable("onework_activation_code", {
	id: text("id").primaryKey(),
	codeHash: text("code_hash").notNull(),
	codePrefix: text("code_prefix").notNull(),
	label: text("label").notNull().default(''),
	source: text("source").notNull().default('manual'), // manual | xhs | douyin | partner
	packIds: jsonb('pack_ids').$type<string[]>().notNull(),
	trialDays: integer('trial_days').notNull().default(30),
	monthlyQuota: integer('monthly_quota').notNull().default(1000),
	maxRedemptions: integer('max_redemptions').notNull().default(1),
	redeemedCount: integer('redeemed_count').notNull().default(0),
	status: text('status').notNull().default('active'), // active | redeemed | revoked
	redeemedByUserId: text('redeemed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
	redeemedAt: timestamp('redeemed_at'),
	expiresAt: timestamp('expires_at'),
	createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_activation_code_hash_unique_idx').on(table.codeHash),
	index('onework_activation_code_status_idx').on(table.status),
	index('onework_activation_code_redeemed_user_idx').on(table.redeemedByUserId),
]);

/** 用户拥有的知识包权益。权益与设备解耦，换电脑只需重新生成设备 Key。 */
export const oneworkEntitlement = pgTable("onework_entitlement", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	knowledgePackId: text('knowledge_pack_id').notNull(),
	source: text('source').notNull().default('activation'),
	status: text('status').notNull().default('active'), // active | expired | revoked
	monthlyQuota: integer('monthly_quota').notNull().default(1000),
	startsAt: timestamp('starts_at').notNull().defaultNow(),
	expiresAt: timestamp('expires_at'),
	externalOrderId: text('external_order_id'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_entitlement_user_pack_unique_idx').on(table.userId, table.knowledgePackId),
	index('onework_entitlement_user_status_idx').on(table.userId, table.status),
	index('onework_entitlement_expires_idx').on(table.expiresAt),
]);

/**
 * 不可变的权益发放账本。聚合权益行会随续费更新，不能单独承担
 * 支付回调幂等；这张表确保同一订单对同一知识包只发放一次。
 */
export const oneworkEntitlementGrant = pgTable("onework_entitlement_grant", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	knowledgePackId: text('knowledge_pack_id').notNull(),
	externalOrderId: text('external_order_id').notNull(),
	source: text('source').notNull().default('payment'),
	grantedAt: timestamp('granted_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_entitlement_grant_order_pack_unique_idx').on(
		table.userId,
		table.externalOrderId,
		table.knowledgePackId,
	),
	index('onework_entitlement_grant_user_created_idx').on(table.userId, table.grantedAt),
]);

/** 一台电脑/运行环境对应一把 Key，撤销设备不会影响用户其他设备。 */
export const oneworkDevice = pgTable("onework_device", {
	id: text("id").primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	apiKeyId: text('api_key_id').notNull().references(() => apiKey.id, { onDelete: 'cascade' }),
	deviceHash: text('device_hash').notNull(),
	deviceName: text('device_name').notNull().default(''),
	platform: text('platform').notNull().default('unknown'),
	status: text('status').notNull().default('active'), // active | revoked
	lastSeenAt: timestamp('last_seen_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	index('onework_device_hash_idx').on(table.deviceHash),
	index('onework_device_user_status_idx').on(table.userId, table.status),
	index('onework_device_api_key_idx').on(table.apiKeyId),
	uniqueIndex('onework_device_user_hash_unique_idx').on(table.userId, table.deviceHash),
]);

/** 网站生成的短时安装授权，原始 token 只返回一次，消费后立即失效。 */
export const oneworkInstallToken = pgTable("onework_install_token", {
	id: text("id").primaryKey(),
	tokenHash: text('token_hash').notNull(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	platform: text('platform').notNull().default('unknown'),
	deviceName: text('device_name').notNull().default(''),
	expiresAt: timestamp('expires_at').notNull(),
	consumedAt: timestamp('consumed_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_install_token_hash_unique_idx').on(table.tokenHash),
	index('onework_install_token_user_idx').on(table.userId),
	index('onework_install_token_expires_idx').on(table.expiresAt),
]);

// ─────────────────────────────────────────────────────────
// OneWorkOS OAuth 2.1：WorkBuddy / MCP 网页授权与设备码兜底。

/** OAuth 公共客户端注册。本地 AI 客户端必须使用 PKCE，不保存 client secret。 */
export const oneworkOauthClient = pgTable("onework_oauth_client", {
	clientId: text('client_id').primaryKey(),
	clientName: text('client_name').notNull().default(''),
	redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
	grantTypes: jsonb('grant_types').$type<string[]>().notNull(),
	responseTypes: jsonb('response_types').$type<string[]>().notNull(),
	scopes: jsonb('scopes').$type<string[]>().notNull(),
	tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('none'),
	status: text('status').notNull().default('active'),
	dynamicallyRegistered: boolean('dynamically_registered').notNull().default(false),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	index('onework_oauth_client_status_idx').on(table.status),
	index('onework_oauth_client_created_idx').on(table.createdAt),
]);

/** 授权码只保存 SHA-256，一次消费并绑定 redirect URI、MCP resource 和 PKCE challenge。 */
export const oneworkOauthAuthorizationCode = pgTable("onework_oauth_authorization_code", {
	id: text('id').primaryKey(),
	codeHash: text('code_hash').notNull(),
	clientId: text('client_id').notNull().references(() => oneworkOauthClient.clientId, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	redirectUri: text('redirect_uri').notNull(),
	scope: text('scope').notNull(),
	resource: text('resource').notNull(),
	codeChallenge: text('code_challenge').notNull(),
	codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
	expiresAt: timestamp('expires_at').notNull(),
	consumedAt: timestamp('consumed_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_oauth_authorization_code_hash_unique_idx').on(table.codeHash),
	index('onework_oauth_authorization_code_client_idx').on(table.clientId),
	index('onework_oauth_authorization_code_user_idx').on(table.userId),
	index('onework_oauth_authorization_code_expires_idx').on(table.expiresAt),
]);

/** MCP 资源服务器的短期 Bearer token，数据库中不出现原始 token。 */
export const oneworkOauthAccessToken = pgTable("onework_oauth_access_token", {
	id: text('id').primaryKey(),
	tokenHash: text('token_hash').notNull(),
	clientId: text('client_id').notNull().references(() => oneworkOauthClient.clientId, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	scope: text('scope').notNull(),
	resource: text('resource').notNull(),
	familyId: text('family_id'),
	expiresAt: timestamp('expires_at').notNull(),
	revokedAt: timestamp('revoked_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_oauth_access_token_hash_unique_idx').on(table.tokenHash),
	index('onework_oauth_access_token_user_idx').on(table.userId),
	index('onework_oauth_access_token_client_idx').on(table.clientId),
	index('onework_oauth_access_token_family_idx').on(table.familyId),
	index('onework_oauth_access_token_expires_idx').on(table.expiresAt),
]);

/** 刷新 token 每次使用后旋转；family 用于发现重放后整组撤销。 */
export const oneworkOauthRefreshToken = pgTable("onework_oauth_refresh_token", {
	id: text('id').primaryKey(),
	tokenHash: text('token_hash').notNull(),
	clientId: text('client_id').notNull().references(() => oneworkOauthClient.clientId, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	scope: text('scope').notNull(),
	resource: text('resource').notNull(),
	familyId: text('family_id').notNull(),
	parentTokenId: text('parent_token_id'),
	replacedByTokenId: text('replaced_by_token_id'),
	expiresAt: timestamp('expires_at').notNull(),
	consumedAt: timestamp('consumed_at'),
	revokedAt: timestamp('revoked_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_oauth_refresh_token_hash_unique_idx').on(table.tokenHash),
	index('onework_oauth_refresh_token_user_idx').on(table.userId),
	index('onework_oauth_refresh_token_client_idx').on(table.clientId),
	index('onework_oauth_refresh_token_family_idx').on(table.familyId),
	index('onework_oauth_refresh_token_expires_idx').on(table.expiresAt),
]);

/** 用户对指定 OAuth 客户端和 scope 的显式授权记录。 */
export const oneworkOauthConsent = pgTable("onework_oauth_consent", {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	clientId: text('client_id').notNull().references(() => oneworkOauthClient.clientId, { onDelete: 'cascade' }),
	scope: text('scope').notNull(),
	grantedAt: timestamp('granted_at').notNull().defaultNow(),
	revokedAt: timestamp('revoked_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_oauth_consent_user_client_scope_unique_idx').on(table.userId, table.clientId, table.scope),
	index('onework_oauth_consent_client_idx').on(table.clientId),
]);

/** 无法回调浏览器的宿主可用 Device Authorization Grant 完成登录。 */
export const oneworkOauthDeviceCode = pgTable("onework_oauth_device_code", {
	id: text('id').primaryKey(),
	deviceCodeHash: text('device_code_hash').notNull(),
	userCodeHash: text('user_code_hash').notNull(),
	clientId: text('client_id').notNull().references(() => oneworkOauthClient.clientId, { onDelete: 'cascade' }),
	userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
	scope: text('scope').notNull(),
	resource: text('resource').notNull(),
	status: text('status').notNull().default('pending'),
	pollIntervalSeconds: integer('poll_interval_seconds').notNull().default(5),
	lastPolledAt: timestamp('last_polled_at'),
	expiresAt: timestamp('expires_at').notNull(),
	approvedAt: timestamp('approved_at'),
	consumedAt: timestamp('consumed_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_oauth_device_code_hash_unique_idx').on(table.deviceCodeHash),
	uniqueIndex('onework_oauth_device_user_code_hash_unique_idx').on(table.userCodeHash),
	index('onework_oauth_device_client_idx').on(table.clientId),
	index('onework_oauth_device_user_idx').on(table.userId),
	index('onework_oauth_device_status_expires_idx').on(table.status, table.expiresAt),
]);

/** OAuth 公开端点的固定窗口限流。只保存网络/客户端标识的单向哈希。 */
export const oneworkOauthRateLimitBucket = pgTable("onework_oauth_rate_limit_bucket", {
	id: text('id').primaryKey(),
	subjectHash: text('subject_hash').notNull(),
	kind: text('kind').notNull(),
	windowStart: timestamp('window_start').notNull(),
	requestCount: integer('request_count').notNull().default(0),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_oauth_rate_limit_subject_kind_unique_idx').on(table.subjectHash, table.kind),
	index('onework_oauth_rate_limit_updated_idx').on(table.updatedAt),
]);

// OneWorkOS V1：能力注册表 + Skill 映射 + 受控语义层
// ─────────────────────────────────────────────────────────

/**
 * OneWorkOS 的能力注册表。它描述“能做什么”，不保存密钥。
 * runtime 只保存 adapter/transport/auth mode 等非敏感调用配置。
 */
export const oneWorkCapability = pgTable("onework_capability", {
	id: text("id").primaryKey(),
	capabilityKey: text('capability_key').notNull(),
	name: text('name').notNull(),
	description: text('description').notNull().default(''),
	ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
	scope: text('scope').notNull().default('global'),
	provider: text('provider').notNull(),
	kind: text('kind').notNull(),
	intents: jsonb('intents').$type<string[]>().notNull(),
	inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
	outputSchema: jsonb('output_schema').$type<Record<string, unknown>>().notNull(),
	runtime: jsonb('runtime').$type<Record<string, unknown>>().notNull(),
	riskLevel: text('risk_level').notNull().default('low'),
	requiresConfirmation: boolean('requires_confirmation').notNull().default(false),
	status: text('status').notNull().default('draft'),
	version: text('version').notNull().default('1.0.0'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('onework_capability_key_version_unique_idx').on(table.capabilityKey, table.version),
	index('onework_capability_kind_status_idx').on(table.kind, table.status),
	index('onework_capability_provider_status_idx').on(table.provider, table.status),
	index('onework_capability_owner_scope_idx').on(table.ownerUserId, table.scope),
]);

/** Skill 允许使用的能力及其非敏感调度配置。 */
export const workerSkillCapability = pgTable("worker_skill_capability", {
	id: text("id").primaryKey(),
	skillId: text('skill_id').notNull().references(() => workerSkill.id, { onDelete: 'cascade' }),
	capabilityId: text('capability_id').notNull().references(() => oneWorkCapability.id, { onDelete: 'cascade' }),
	status: text('status').notNull().default('enabled'),
	priority: integer('priority').notNull().default(100),
	configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('worker_skill_capability_unique_idx').on(table.skillId, table.capabilityId),
	index('worker_skill_capability_skill_status_idx').on(table.skillId, table.status),
	index('worker_skill_capability_capability_status_idx').on(table.capabilityId, table.status),
]);

/**
 * 受控的结构化数据语义模型。definition 由运行时验证，不接受自由 SQL；
 * V1 可承载 source、metrics、dimensions、filters、timeRange 和 userScope。
 */
export const semanticModel = pgTable("semantic_model", {
	id: text("id").primaryKey(),
	modelKey: text('model_key').notNull(),
	name: text('name').notNull(),
	description: text('description').notNull().default(''),
	ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
	scope: text('scope').notNull().default('private'),
	provider: text('provider').notNull().default('postgres'),
	definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
	status: text('status').notNull().default('draft'),
	version: text('version').notNull().default('1.0.0'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
	uniqueIndex('semantic_model_key_version_unique_idx').on(table.modelKey, table.version),
	index('semantic_model_owner_scope_status_idx').on(table.ownerUserId, table.scope, table.status),
	index('semantic_model_provider_status_idx').on(table.provider, table.status),
]);

/** 语义查询的可追溯审计记录，不保存完整查询结果。 */
export const semanticQueryRun = pgTable("semantic_query_run", {
	id: text("id").primaryKey(),
	semanticModelId: text('semantic_model_id').references(() => semanticModel.id, { onDelete: 'set null' }),
	capabilityId: text('capability_id').references(() => oneWorkCapability.id, { onDelete: 'set null' }),
	skillId: text('skill_id').references(() => workerSkill.id, { onDelete: 'set null' }),
	instanceId: text('instance_id').references(() => workerInstance.id, { onDelete: 'set null' }),
	userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
	request: jsonb('request').$type<Record<string, unknown>>().notNull(),
	compiledQuery: jsonb('compiled_query').$type<Record<string, unknown>>(),
	queryHash: text('query_hash'),
	status: text('status').notNull().default('pending'),
	rowCount: integer('row_count').notNull().default(0),
	durationMs: integer('duration_ms'),
	error: text('error'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	completedAt: timestamp('completed_at'),
}, (table) => [
	index('semantic_query_run_model_created_idx').on(table.semanticModelId, table.createdAt),
	index('semantic_query_run_user_created_idx').on(table.userId, table.createdAt),
	index('semantic_query_run_status_created_idx').on(table.status, table.createdAt),
	index('semantic_query_run_query_hash_idx').on(table.queryHash),
]);
