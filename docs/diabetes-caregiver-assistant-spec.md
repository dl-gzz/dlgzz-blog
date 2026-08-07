# 糖尿病管家 + 子女监护绑定：构建方案

> 状态：spec 草案（2026-07-02）。基于对现有代码与文档的完整盘点写成，可直接交给 Codex / 协作者实施。
> 定位：**不是新项目**。它是三高健康管家产品线（124.223.183.178 云 bridge、roleId `health`）的第一个深垂直，复用 learning-assistant 的绑定机制、worker 平台的开通链路，数据层直接扩展已有的 `health_*` 表。

---

## 0. 一句话架构

```
患者微信 ──扫码──> 患者记录助手 Profile ──record──┐
                                                 ├──> blog Postgres（health_measurement = 唯一真相源）
子女微信 ──扫码──> 监护助手 Profile ──answer(只读)──┘
                        ↑
              患者发起邀请码 = 同意凭证
```

- 两个独立 Hermes Profile（记忆/微信绑定互不串），共享同一份 Postgres 数据。
- 患者端**写**，监护端**只读**。
- 低血糖/极高值 → **确定性代码报警**，不交给模型判断。

---

## 1. 现状盘点（已核实到文件行号）

### 已有（直接复用）

| 能力 | 位置 | 说明 |
|---|---|---|
| 健康档案表 | `src/db/schema.ts:138` `health_user_profile` | targets(个体化目标区间 jsonb)、medication_notes、risk_notes、hermes 五件套字段 |
| 测量记录表 | `src/db/schema.ts:160` `health_measurement` | 空腹/餐后血糖(numeric 5,2 mmol)、血压、血脂、体重、腰围、notes、source、measured_at 索引 |
| 数据读写层 | `src/lib/health.ts` | ensureHealthProfile / createHealthMeasurement / getHealthDashboardForUser(50 条 + latest summary) |
| 健康 API | `src/app/api/health/{assistant,records,build}` | 网页端记录 + browser_profile 开通 |
| 网页面板 | `src/components/health/health-dashboard.tsx` | 用户侧看板 |
| 微信扫码激活链路 | `scripts/hermes-bridge.cjs`（三高云服务器） + `src/lib/hermes-bridge-client.ts` | provision → iLink 出码 → 轮询 → allowlist 锁定单一微信 |
| 绑定机制模板 | learning-assistant（备份：`~/hermes-backups/learning-assistant-20260616-180735.tar.gz`） | bind token(urlsafe24 + 6 位码、TTL、单次使用)、`bind_parent_from_message` 正则解析、answer_parent 授权模型 |
| 开通/授权/计费骨架 | `src/lib/workers.ts`、`payment` 表、XorPay | 会员/单买/实例隔离已通 |

### 缺失（本 spec 要建的四块）

| # | 缺口 | 现状 |
|---|---|---|
| A | 患者**微信**记录入口 | roleId `health` 被硬编码为 `browser_profile`（`src/app/api/hermes/assistants/route.ts:36`），只有网页录入，没有"微信里说一句就记录" |
| B | 确定性安全阈值层 | `createHealthMeasurement` 存了 targets 但**没有任何报警逻辑**；低血糖 2.8 和正常 6.2 处理完全一样 |
| C | 监护端（子女绑定） | 无 caregiver 概念、无绑定表、无只读查询命令 |
| D | 趋势引擎 + 主动提醒 | summary 只有"最近一条"；全仓库无 cron/调度（docs 已确认 daily_report 只是按需命令） |

---

## 2. 架构决策（ADR）

1. **数据真相源 = blog Postgres，不克隆 learning-assistant 的 JSONL。**
   learning-assistant 是 skill 侧存数据（`~/.hermes/learning-assistant-data` JSONL）；三高线已经选择了平台侧存数据（`health_measurement`）。糖尿病沿用平台侧，skill 只做"微信消息 ↔ blog API"的翻译层。否则双写必然分裂。
2. **两个 Profile，不共享。** 患者记录助手（写）与监护助手（只读）各自 provision、各自扫码、各自被 allowlist 锁定一个微信。满足 playbook 恒等式："绑定时捕获的身份 = 未来聊天的身份"（扫码者 weixinUserId 即会话身份，天然成立）。
3. **邀请码 = 同意凭证（与教育版方向相反）。** 教育版 token 由系统/老师生成；这里监护绑定**必须由患者发起**（PIPL 敏感个人信息要求）。患者在面板/微信里点"邀请家人" → 生成监护助手激活二维码 → 子女扫码即完成"绑定+同意"一步。患者可随时撤销。
4. **走三高云 bridge（124.223.183.178），不碰 legacy learning server（1.15.141.88）。** docs/cloud-hermes-bridge.md 明令两台不混。
5. **新 roleId：`diabetes-patient` 与 `diabetes-caregiver`，均走 `qr_activation`。** 需要改 `src/app/api/hermes/assistants/route.ts:36` 的 connectionMode 映射（当前只认 `health` → browser_profile，新 roleId 默认即 qr_activation，确认即可，不必大改）。
6. **Profile 克隆只用 `--clone --clone-from default`，严禁 `--clone-all`**（会拷贝私人记忆/历史）。

---

## 3. 四个新建块

### A. 患者微信记录入口

**skill 命令**（新脚本 `diabetes_assistant.py` 或直接 HTTP 动作，遵循 learning-assistant 约定：argparse 子命令、stdout JSON、`{"success": true|false}` 信封、中文错误）：

| 命令 | 参数 | 行为 |
|---|---|---|
| `record_reading` | `--patient-id`，`--json`/stdin：`{kind: fasting\|postprandial\|random, valueMmol, measuredAt?, note?}` | POST blog `/api/health/records`（服务端 token），返回记录 + **alerts[]** |
| `record_meal` | `--patient-id`，`--json`：`{description, measuredAt?}` | 写入 notes/meal 类目（MVP 可先并入 measurement.notes，entry_type='meal'） |
| `record_med` | 同上 | 用药打卡（只记录事实，不评价方案） |
| `today` | `--patient-id` | 当日汇总（Asia/Shanghai 日窗口，抄 learning-assistant `shanghai_day_range`） |
| `my_trend` | `--patient-id --days 7\|30` | 调趋势引擎（见 D） |

**鉴权**：skill → blog 用新的服务端 token `HEALTH_SKILL_TOKEN`（Bearer），blog 路由校验后按 `patientId` 写入。patientId ↔ userId 映射存 `health_user_profile`（已有 hermesAssistantId 字段可反查）。
**消息解析**：口语（"空腹6.2"、"餐后2小时 8.9"、"晚饭吃了半碗面"）由 Profile 的 SOUL 引导模型转成结构化 `--json`；**数值合法性校验在服务端代码做**（见 B），不信任模型输出。
**单位**：默认 mmol/L；值 > 35 视为 mg/dL 误输，÷18 换算并在回复中显式确认。

**SOUL 铁律**（写入 provision 的 servicePrompt，抄 bridge 里 learning-assistant 注入规则的措辞强度）：
- 记录/查询一律调用 skill 命令，**禁止凭聊天记忆报数字或趋势**（"Do not guess from memory"）。
- skill 返回 `alerts` 时，**必须原样完整转达且置于回复最前**，不得改写、淡化、省略。
- 涉及胰岛素剂量、用药调整、诊断 → 固定话术拒答并引导就医。
- 语气：简洁、温和、不制造焦虑；每次记录后确认已存 + 给当日小结。

### B. 确定性安全阈值层（纯代码，落在 `src/lib/health.ts` 的 create 路径上）

阈值 = 缺省表 + `health_user_profile.targets` 个体化覆盖（**缺省值上线前须经你朋友/医生复核**）：

| 情况 | 缺省阈值 (mmol/L) | alert level | 固定响应（服务端拼好文案） |
|---|---|---|---|
| 严重低血糖 | < 3.0 | `emergency` | 立即进食 15g 快糖 → 15 分钟复测 → 意识异常立即求助/就医；同时**推送监护端**（后续接） |
| 低血糖 | < 3.9 | `warning` | 进食快糖、复测、避免独处驾车 |
| 显著偏高 | > 13.9 | `warning` | 补水、复测、检查酮体提示、联系医生 |
| 极高 | > 16.7 | `emergency` | 强烈建议尽快就医 |
| 录入越界 | < 1.0 或 > 35（换算后仍越界） | `reject` | 判定录入错误，要求重报，不入库 |

返回结构：`{ record, alerts: [{level, code, message}] }`。**这段逻辑无 LLM 参与**；模型只负责转达。同时在此处拒绝任何"帮我算胰岛素打几个单位"类命令进入记录流。

### C. 监护端（bind_caregiver）

**新表 `health_caregiver_binding`**（Postgres，不用 bindings.json）：
`{ id, patientProfileId → health_user_profile.id, caregiverAssistantId, caregiverWeixinUserId?, status: pending|active|revoked, scope: 'summary'(默认，不含 notes/用药明细) | 'full', invitedAt, activatedAt?, revokedAt? }`

**绑定时序**（邀请码即同意）：
1. 患者（已登录）在面板/微信点"邀请家人" → `POST /api/health/caregiver-invite`
2. 服务端：建 pending binding → `provisionHermesAssistant({ roleId:'diabetes-caregiver', serviceId:'diabetes-caregiver:<patientProfileId>', assistantId:'diac_<sha256(patientProfileId+seq).slice(16)>', connectionMode:'qr_activation', activationTtlSeconds:600 })` → 返回二维码给患者转发
3. 子女扫码确认 → bridge 锁定其 weixinUserId → 轮询回写 `caregiverWeixinUserId`，binding → active
4. 撤销：患者点撤销 → binding=revoked + 复用 bridge `clearProfileWeixinCredentials` 停用该 Profile

**查询命令 `answer_caregiver`**：`--caregiver-id`（默认取 `HERMES_SESSION_USER_ID`，同 learning-assistant `read_parent_id`）→ 按 weixinUserId 查 active binding → 只读聚合 `health_measurement` → 关键词路由回答（抄 `build_parent_answer`：'低血糖/异常' → 异常明细；'趋势/这周' → 趋势报告；默认 → 今日摘要+建议）。
**隐私**：默认 scope='summary' —— 输出血糖统计/达标率/异常次数，**不输出** notes、用药明细（抄 learning-assistant `safe_profile` 只露 studentId/name/grade 的模式）。多患者场景照抄 `needChild` 歧义协议（一个子女可绑父+母）。

### D. 趋势引擎 + 主动提醒

**趋势**（`src/lib/health.ts` 新增 `buildTrendReport(profileId, days)`，纯 SQL/TS）：7/30 天 → 按 kind 分组的均值、达标率（对照 targets）、低血糖次数、最高/最低、漏测天数、与上周期对比。喂给 `my_trend`、`answer_caregiver`、`daily_report` 三个消费方。
**提醒（诚实标注：需新基础设施）**：全仓库无调度器。MVP：三高云服务器 crontab 每晚触发 `daily_report`。⚠️ **开放问题**：报告生成后能否经 Hermes gateway 主动推微信（而非等用户先开口）——需在三高服务器上实测 gateway 的主动消息能力；若不支持，MVP 退化为"患者/子女说'今天'即得日报"，主动推送进后续。

---

## 4. 修改清单

| 动作 | 文件 | 说明 |
|---|---|---|
| 新增 | `scripts/diabetes-assistant-http-server.py` 或并入三高 bridge 白名单 | 命令白名单：上述 8 个命令（学 `LEARNING_ASSISTANT_ALLOWED_COMMANDS` 双端同步） |
| 新增 | `src/app/api/health/caregiver-invite/route.ts`、`caregiver-revoke` | 患者侧同意流程 |
| 新增 | `health_caregiver_binding` 表 + migration | 见 3C |
| 修改 | `src/lib/health.ts` | createHealthMeasurement 加阈值层；新增 buildTrendReport、caregiver 聚合查询 |
| 修改 | `src/app/api/health/records/route.ts` | 支持 `HEALTH_SKILL_TOKEN` 服务端鉴权 + alerts 返回 |
| 确认 | `src/app/api/hermes/assistants/route.ts:36` | 新 roleId 默认落 qr_activation，符合预期即不改 |
| 顺手修 | `scripts/hermes-bridge.ts:1695` | isAuthorized 无 token 时 fail-open → 改为 fail-closed |
| 后续 | `scripts/seed-diabetes-steward-worker.ts` | 上架 /bots 时抄 `seed-xhs-open-shop-worker.ts`（注意：status='active' 必须配 latest_version_id；`open_test` 通道已永久关闭，内测用 membership 或 CLI provision） |

## 5. 红线清单（上线前逐条打勾）

- [ ] 阈值缺省值经医学背景者复核；紧急话术固定、不可被模型改写
- [ ] 永不输出剂量/用药调整建议（SOUL + 服务端双层拒绝）
- [ ] 监护绑定只能患者发起，可撤销，默认 summary scope（PIPL 敏感个人信息）
- [ ] 绑定身份恒等式验证：扫码 weixinUserId == 会话 HERMES_SESSION_USER_ID
- [ ] 两台云服务器不混用;bridge token 不进日志/文档/截图
- [ ] `--clone-all` 禁用；bridge fail-open 已修
- [ ] 每患者/监护会话计一条 usage 事件（对接"算账后台"P0——本垂直是它的第一个真实用户）

## 6. 分工建议

- **你（平台侧）**：表/migration、阈值层、caregiver 路由、bridge 白名单、provision 双路由、fail-open 修复。
- **朋友（领域侧）**：阈值缺省值与话术复核、饮食记录的口语样本（喂 SOUL 的 few-shot）、第一个真实患者的试用反馈闭环。
- **顺序**：B（安全层）→ A（患者微信入口）→ D 趋势 → C 监护绑定 → 提醒。安全层最先，因为一旦微信入口开了，低血糖消息第一天就可能出现。
