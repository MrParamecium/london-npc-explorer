# GPT Image 2 NPC Portrait Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过 OpenRouter GPT Image 2 为每个新伦敦 NPC 生成一张真实的 3:4 人物照片，把照片保存到 Vercel Blob，并在人物资料与照片都保存成功后一次性展示。

**Architecture:** 现有同步 NPC 生成接口继续作为唯一入口，但生成任务从 `profile_only` 改为 `full`。服务先锁定统计人物资料，再调用独立图片供应商、验证图片、上传 Blob，最后用一个数据库事务同时写入 NPC 和完成任务；前端只消费最终完整响应。

**Tech Stack:** Next.js 16.3 App Router、React 19、TypeScript、Zod、Neon PostgreSQL、Drizzle ORM、OpenRouter Images API、GPT Image 2、Vercel Blob、Vitest、React Testing Library、Playwright、`next/image`。

**Spec:** `docs/superpowers/specs/2026-08-14-gpt-image-2-portrait-generation-design.md`

## Global Constraints

- 图片模型固定为 `openai/gpt-image-2`。
- 图片参数固定为 `quality: "high"`、`aspect_ratio: "3:4"`、`background: "opaque"`、`n: 1`。
- 一次生成任务最多发出一次付费图片请求；付费请求发出后禁止自动重试。
- OpenRouter 请求超时固定为 160 秒；图片请求使用 `stream: true` 保持长生成连接可用；`POST /api/npcs/generate` 的 `maxDuration` 固定为 180 秒。
- 只接受 PNG、JPEG、WebP；解码后最大 20 MiB；必须检查文件签名。
- 新任务统一使用 `mode = "full"`，新 NPC 的 `portraitUrl` 不允许为空。
- 人物资料和图片只在数据库事务完成后一起返回；任何失败都不能暴露半成品 NPC。
- Blob 公开路径不得包含用户 ID、人物名、坐标或人物资料。
- OpenRouter、Blob 和 Kimi 密钥全部保持服务器专用，不能进入 `NEXT_PUBLIC_*`、浏览器包、Git 或日志。
- 保留 `PROVIDER_MODE=mock` 的无付费测试能力；mock 路径不能访问 OpenRouter 或 Vercel Blob。
- 当前数据库旧 NPC 已清空，不编写旧首字母头像兼容流程。
- 写 React/Next.js 代码前，先阅读本仓库 `node_modules/next/dist/docs/` 中的对应 Next.js 16.3 文档。

---

## File Structure

- Create `src/lib/generation/portrait-types.ts`: 图片生成、存储和错误的共享类型。
- Create `src/lib/generation/portrait-prompt.ts`: 只从锁定资料构造纪实人物提示词。
- Create `src/lib/generation/portrait-prompt.test.ts`: 提示词字段白名单与反刻板印象测试。
- Modify `src/lib/npc/contracts.ts`: 导出 V2 人物资料 TypeScript 类型。
- Modify `tests/fixtures/domain.ts`: 增加共享 V2 人物资料 fixture。
- Create `src/lib/generation/openrouter-image-provider.ts`: OpenRouter 请求、SSE 最终事件解析、超时、响应解码和文件验证。
- Create `src/lib/generation/openrouter-image-provider.test.ts`: 请求参数、费用、错误和图片签名测试。
- Create `src/lib/storage/portrait-blob-store.ts`: Vercel Blob 上传、命名和清理。
- Create `src/lib/storage/portrait-blob-store.test.ts`: Blob 参数、路径隐私和删除测试。
- Create `src/lib/generation/portrait-runtime.ts`: live/mock 运行时装配与配置预检。
- Create `src/lib/generation/portrait-runtime.test.ts`: mock 零外部调用和 live 缺失配置测试。
- Modify `src/lib/config/env.ts`: 增加图片模型和 Blob 服务端配置。
- Modify `.env.example`: 记录变量名和安全默认值，不写密钥。
- Modify `package.json` and `pnpm-lock.yaml`: 增加 `@vercel/blob`。
- Modify `src/lib/generation/profile-contracts.ts`: 完整 NPC 保存输入必须包含图片和费用。
- Modify `src/lib/generation/profile-contracts.test.ts`: 完整保存输入契约测试。
- Modify `src/lib/db/schema.ts`: NPC 图片地址设为非空。
- Create `drizzle/0004_require_npc_portraits.sql`: 把 `npcs.portrait_url` 改为 `NOT NULL`。
- Create `drizzle/meta/0004_snapshot.json`: 记录迁移后的 schema snapshot。
- Modify `drizzle/meta/_journal.json`: 登记 `0004_require_npc_portraits`。
- Modify `src/lib/db/schema.test.ts`: 验证新的非空约束和迁移。
- Modify `src/lib/db/queries/profile-npcs.ts`: 完整 NPC 原子事务和 full-mode 查询。
- Create `src/lib/db/queries/profile-npcs.test.ts`: 事务输入、冲突和返回值测试。
- Modify `src/lib/db/queries/generation-jobs.ts`: 安全更新阶段与最终图片费用。
- Create `src/lib/db/queries/generation-jobs.test.ts`: 运行中阶段更新条件测试。
- Modify `src/lib/generation/profile-generation-service.ts`: 串起资料、图片、Blob、数据库和清理。
- Create `src/lib/generation/profile-generation-service.test.ts`: 原子展示、幂等、一次付费调用和清理测试。
- Modify `src/lib/generation/profile-generation-handler.ts`: 公开图片错误映射。
- Modify `src/lib/generation/profile-generation-handler.test.ts`: 安全错误响应测试。
- Modify `src/app/api/npcs/generate/route.ts`: 装配画像运行时并设置 180 秒时限。
- Create `src/app/api/npcs/generate/route.test.ts`: 验证 route 装配和公开 POST。
- Modify `src/lib/generation/public-profile-contracts.ts`: 公开 NPC 图片地址改为必填。
- Modify affected fixtures and handler tests: 给所有完整 NPC fixture 增加有效图片地址。
- Modify `src/components/explorer/use-npc-generation.ts`: 粗粒度进度和完成后统一展示。
- Create `src/components/explorer/use-npc-generation.test.tsx`: 不提前展示、进度、失败和手动重试测试。
- Modify `src/components/explorer/npc-profile.tsx`: 使用真实 3:4 图片。
- Create `src/components/explorer/npc-profile.test.tsx`: 图片和无障碍文本测试。
- Modify `src/components/explorer/npc-history.tsx`: 历史缩略图改为真实照片。
- Create `src/components/explorer/npc-history.test.tsx`: 缩略图和选择行为测试。
- Modify `src/components/explorer/explorer-shell.tsx`: 新进度文案与失败按钮。
- Modify `src/components/explorer/explorer-shell.test.tsx`: 完整展示时序测试。
- Modify `src/app/globals.css`: 所有图片、加载和错误状态保持稳定 3:4。
- Modify `next.config.ts`: 严格允许 Vercel Blob 图片路径。
- Modify `docs/HANDOFF.md` and `docs/architecture.md`: 更新已完成架构和环境变量。

### Task 1: 锁定人物图片提示词边界

**Files:**

- Create: `src/lib/generation/portrait-types.ts`
- Create: `src/lib/generation/portrait-prompt.ts`
- Test: `src/lib/generation/portrait-prompt.test.ts`
- Modify: `src/lib/npc/contracts.ts`
- Modify: `tests/fixtures/domain.ts`

**Interfaces:**

- Consumes: `CanonicalNpcProfileV2`、`NpcCurrentState`、ward 和 borough 名称。
- Produces: `PortraitImage`、`StoredPortrait`、`PortraitGenerationError` 共享类型。
- Produces: `buildPortraitPrompt(input: PortraitPromptInput): string`，供 Task 2 和 Task 5 使用。

- [ ] **Step 1: 先阅读当前 Next.js 服务端数据安全说明**

Run:

```bash
sed -n '1,240p' node_modules/next/dist/docs/01-app/02-guides/data-security.md
```

Expected: 明确只把安全的最终数据返回客户端，提示词和密钥保持在服务端模块。

- [ ] **Step 2: 写失败的提示词白名单测试**

先在 `tests/fixtures/domain.ts` 增加完整的 `validCanonicalProfileV2`，字段使用现有 sampler 的 V2 schema，包括 `statisticalSex` 和 `ethnicGroup`。测试输入使用这份 V2 人物资料，并故意在人物故事和精确地址中放入不可泄露标记：

```ts
const prompt = buildPortraitPrompt({
  profile: validCanonicalProfileV2,
  currentState: validCurrentState,
  place: { ward: "Aldersgate", borough: "City of London" },
});

expect(prompt).toContain("fictional adult");
expect(prompt).toContain("31 years old");
expect(prompt).toContain("olive field jacket");
expect(prompt).toContain("Aldersgate, City of London");
expect(prompt).toContain("natural skin texture");
expect(prompt).toContain("no text, logo, watermark");
expect(prompt).not.toContain("PRIVATE-ADDRESS-MARKER");
expect(prompt).not.toContain(validCanonicalProfileV2.character.personalHistory);
expect(prompt).not.toContain(validCanonicalProfileV2.character.speechStyle);
```

再断言 ethnic group、occupation 和 income 分别出现在独立描述段，测试中不存在“because of their ethnicity”之类的因果措辞。

- [ ] **Step 3: 运行测试并确认失败**

Run:

```bash
pnpm exec vitest run src/lib/generation/portrait-prompt.test.ts
```

Expected: FAIL，因为提示词模块还不存在。

- [ ] **Step 4: 定义共享类型和错误**

在 `src/lib/npc/contracts.ts` 导出已有 schema 的类型：

```ts
export type CanonicalNpcProfileV2 = z.infer<typeof CanonicalNpcProfileV2Schema>;
```

在 `portrait-types.ts` 中实现这些精确接口：

```ts
export type PortraitContentType = "image/png" | "image/jpeg" | "image/webp";

export type PortraitImage = {
  bytes: Uint8Array;
  contentType: PortraitContentType;
  extension: "png" | "jpg" | "webp";
  model: string;
  costUsd: number | null;
};

export type StoredPortrait = { url: string; pathname: string };

export class PortraitGenerationError extends Error {
  constructor(
    readonly code:
      | "provider_timeout"
      | "invalid_output"
      | "portrait_failed"
      | "budget_exceeded",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PortraitGenerationError";
  }
}
```

- [ ] **Step 5: 实现确定性的提示词构造器**

输入接口固定为：

```ts
export type PortraitPromptInput = {
  profile: CanonicalNpcProfileV2;
  currentState: NpcCurrentState;
  place: { ward: string | null; borough: string };
};
```

按固定顺序拼接 `fictional adult`、身份、普通衣着、物品、当前任务、心情、伦敦地点和纪实摄影限制。不要读取 `profile.character`，不要接收 narrative、坐标、街道地址或对话作为参数。

- [ ] **Step 6: 运行测试和类型检查**

Run:

```bash
pnpm exec vitest run src/lib/generation/portrait-prompt.test.ts
pnpm typecheck
```

Expected: 提示词测试全部 PASS，TypeScript 退出码为 0。

- [ ] **Step 7: 提交提示词边界**

```bash
git add src/lib/generation/portrait-types.ts src/lib/generation/portrait-prompt.ts src/lib/generation/portrait-prompt.test.ts src/lib/npc/contracts.ts tests/fixtures/domain.ts
git commit -m "feat: define NPC portrait prompt"
```

### Task 2: OpenRouter GPT Image 2 供应商

**Files:**

- Create: `src/lib/generation/openrouter-image-provider.ts`
- Test: `src/lib/generation/openrouter-image-provider.test.ts`

**Interfaces:**

- Consumes: Task 1 的 `PortraitImage` 和 `PortraitGenerationError`。
- Produces: `createOpenRouterImageProvider(options)`，返回 `{ generate({ prompt }): Promise<PortraitImage> }`。
- Guarantees: 单次 `generate` 只执行一次 `fetch`，不会内部重试。

- [ ] **Step 1: 写失败的成功请求测试**

使用一个最小合法 PNG Base64 响应，断言请求精确包含：

```ts
expect(fetchImpl).toHaveBeenCalledTimes(1);
expect(JSON.parse(String(init?.body))).toEqual({
  model: "openai/gpt-image-2",
  prompt: "locked portrait prompt",
  quality: "high",
  aspect_ratio: "3:4",
  background: "opaque",
  n: 1,
});
expect(init?.headers).toMatchObject({
  Authorization: "Bearer test-openrouter-key",
  "Content-Type": "application/json",
});
```

返回值断言为 `image/png`、`png`、模型名和响应中的 `usage.cost`。

- [ ] **Step 2: 写失败的安全与文件验证测试**

覆盖这些精确情况：

```ts
await expect(provider.generate({ prompt })).rejects.toMatchObject({
  code: "provider_timeout",
  retryable: true,
});
expect(fetchImpl).toHaveBeenCalledTimes(1);
```

并分别测试 429、402/预算错误、5xx、政策拒绝、空 `data`、多张图片、非法 Base64、伪造 PNG metadata、超过 20 MiB、有效 JPEG 和有效 WebP。

- [ ] **Step 3: 运行测试并确认失败**

Run:

```bash
pnpm exec vitest run src/lib/generation/openrouter-image-provider.test.ts
```

Expected: FAIL，因为供应商模块还不存在。

- [ ] **Step 4: 实现响应 Schema 和文件签名识别**

流式响应只接受一个最终图片事件：

```ts
const OpenRouterCompletedEventSchema = z
  .object({
    type: z.literal("image_generation.completed"),
    b64_json: z.string().min(1),
    usage: z
      .object({ cost: z.number().nonnegative().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
```

签名识别必须检查 PNG `89 50 4E 47 0D 0A 1A 0A`、JPEG `FF D8 FF`、WebP 的 `RIFF....WEBP`。先根据 Base64 长度保守估算，再解码并检查 `bytes.byteLength <= 20 * 1024 * 1024`。

- [ ] **Step 5: 实现单次流式请求和 160 秒超时**

工厂接口固定为：

```ts
export function createOpenRouterImageProvider(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): {
  generate(input: { prompt: string }): Promise<PortraitImage>;
};
```

默认 endpoint 为 `https://openrouter.ai/api/v1/images`，默认模型为 `openai/gpt-image-2`，默认 timeout 为 `160_000`。请求设置 `stream: true`，只接受一个最终图片事件和 `[DONE]`；任何分支都不能循环调用 `fetch`，错误信息不能包含 API Key、完整上游响应或完整提示词。

- [ ] **Step 6: 运行供应商测试和类型检查**

Run:

```bash
pnpm exec vitest run src/lib/generation/openrouter-image-provider.test.ts
pnpm typecheck
```

Expected: 全部 PASS。

- [ ] **Step 7: 提交图片供应商**

```bash
git add src/lib/generation/openrouter-image-provider.ts src/lib/generation/openrouter-image-provider.test.ts
git commit -m "feat: add OpenRouter image provider"
```

### Task 3: Vercel Blob 存储和 live/mock 装配

**Files:**

- Create: `src/lib/storage/portrait-blob-store.ts`
- Test: `src/lib/storage/portrait-blob-store.test.ts`
- Create: `src/lib/generation/portrait-runtime.ts`
- Test: `src/lib/generation/portrait-runtime.test.ts`
- Modify: `src/lib/config/env.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Task 1 的 `PortraitImage`、`StoredPortrait`，Task 2 的 provider 工厂。
- Produces: `createPortraitBlobStore(options)`，返回 `{ put, remove }`。
- Produces: `createPortraitRuntime(config)`，返回 `{ generate, store, remove, imageModel }`。
- Guarantees: mock 模式不访问 OpenRouter 或 Blob；live 模式缺配置时在付费调用前失败。

- [ ] **Step 1: 安装 Blob SDK**

Run:

```bash
pnpm add @vercel/blob
```

Expected: `package.json` 和 `pnpm-lock.yaml` 只增加官方 Blob SDK 及其必要依赖。

- [ ] **Step 2: 写失败的 Blob 参数和隐私测试**

注入 `putImpl` 和固定后缀 `abc123`，断言：

```ts
expect(putImpl).toHaveBeenCalledWith(
  `npc-portraits/${jobId}-abc123.png`,
  image.bytes,
  {
    access: "public",
    addRandomSuffix: false,
    cacheControlMaxAge: 31_536_000,
    contentType: "image/png",
    token: "test-blob-token",
  },
);
```

断言 pathname 不包含 ownerId、人物名、经纬度，并验证 `remove(url)` 只调用一次 `delImpl(url)`。

- [ ] **Step 3: 运行 Blob 测试并确认失败**

Run:

```bash
pnpm exec vitest run src/lib/storage/portrait-blob-store.test.ts
```

Expected: FAIL，因为存储模块还不存在。

- [ ] **Step 4: 实现 Blob 存储适配器**

工厂接口固定为：

```ts
export function createPortraitBlobStore(options: {
  token?: string;
  putImpl?: typeof put;
  delImpl?: typeof del;
  randomSuffix?: () => string;
}): {
  put(input: { jobId: string; image: PortraitImage }): Promise<StoredPortrait>;
  remove(url: string): Promise<void>;
};
```

`randomSuffix` 默认使用 `randomUUID().replaceAll("-", "").slice(0, 12)`。只把经过 Task 2 验证的 bytes 和 content type 传给 Blob。

- [ ] **Step 5: 写失败的运行时配置测试**

覆盖：

```ts
expect(() =>
  createPortraitRuntime({
    providerMode: "live",
    openRouterApiKey: undefined,
    blobToken: "blob",
    imageModel: "openai/gpt-image-2",
  }),
).toThrow("OPENROUTER_API_KEY");
```

以及缺 Blob Token、mock 模式返回固定有效 PNG data URL、mock 模式的注入 fetch/put/del 都调用 0 次。

- [ ] **Step 6: 增加服务端环境变量并实现运行时装配**

在 `env.ts` 的服务器 Schema 和导出对象中加入：

```ts
OPENROUTER_IMAGE_MODEL: z.string().trim().min(1).max(160).optional(),
BLOB_READ_WRITE_TOKEN: z.string().trim().min(1).optional(),

openRouterImageModel:
  parsedEnv.OPENROUTER_IMAGE_MODEL ?? "openai/gpt-image-2",
blobReadWriteToken: parsedEnv.BLOB_READ_WRITE_TOKEN,
```

`.env.example` 只增加：

```text
OPENROUTER_IMAGE_MODEL=openai/gpt-image-2
BLOB_READ_WRITE_TOKEN=
```

`createPortraitRuntime` 在 live 模式装配真实 provider/store；mock 模式返回固定的小型 PNG 和 data URL，不调用外部服务。

运行时接口固定为：

```ts
export type PortraitRuntime = {
  imageModel: string;
  generate(input: { prompt: string }): Promise<PortraitImage>;
  store(input: {
    jobId: string;
    image: PortraitImage;
  }): Promise<StoredPortrait>;
  remove(url: string): Promise<void>;
};

export function createPortraitRuntime(config: {
  providerMode: "mock" | "live";
  openRouterApiKey?: string;
  imageModel: string;
  blobToken?: string;
  fetchImpl?: typeof fetch;
  putImpl?: typeof put;
  delImpl?: typeof del;
}): PortraitRuntime;
```

- [ ] **Step 7: 运行存储、运行时、环境和类型测试**

Run:

```bash
pnpm exec vitest run src/lib/storage/portrait-blob-store.test.ts src/lib/generation/portrait-runtime.test.ts
pnpm typecheck
pnpm secrets:check
```

Expected: 全部 PASS，secret 扫描无命中。

- [ ] **Step 8: 提交 Blob 和运行时**

```bash
git add package.json pnpm-lock.yaml .env.example src/lib/config/env.ts src/lib/storage/portrait-blob-store.ts src/lib/storage/portrait-blob-store.test.ts src/lib/generation/portrait-runtime.ts src/lib/generation/portrait-runtime.test.ts
git commit -m "feat: add portrait storage runtime"
```

### Task 4: Full-mode 数据库原子保存

**Files:**

- Modify: `src/lib/generation/profile-contracts.ts`
- Modify: `src/lib/generation/profile-contracts.test.ts`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/schema.test.ts`
- Create: `drizzle/0004_require_npc_portraits.sql` through Drizzle Kit
- Create: `drizzle/meta/0004_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/queries/profile-npcs.ts`
- Create: `src/lib/db/queries/profile-npcs.test.ts`
- Modify: `src/lib/db/queries/generation-jobs.ts`
- Create: `src/lib/db/queries/generation-jobs.test.ts`
- Modify: `src/lib/generation/public-profile-contracts.ts`
- Modify: affected fixtures and handler tests under `tests/` and `src/lib/generation/`

**Interfaces:**

- Consumes: 一个已上传的 `portraitUrl`、图片模型和本次费用。
- Produces: `CompleteFullNpcInputSchema` 和 `completeFullNpcAtomically(database, input)`。
- Produces: `markGenerationJobStage(database, ownerId, jobId, stage)`。
- Guarantees: NPC 行和 completed job 同事务提交，公开查询只返回 full-mode 且有图片的 NPC。

- [ ] **Step 1: 写失败的完整保存契约测试**

把现有输入改为：

```ts
const validFullInput = {
  ...validProfileInput,
  portraitUrl:
    "https://store.public.blob.vercel-storage.com/npc-portraits/job-a.png",
  estimatedCostUsd: 0.08,
};

expect(CompleteFullNpcInputSchema.parse(validFullInput)).toEqual(
  validFullInput,
);
expect(
  CompleteFullNpcInputSchema.safeParse({
    ...validFullInput,
    portraitUrl: null,
  }).success,
).toBe(false);
```

- [ ] **Step 2: 把 NPC 图片列改为非空并生成迁移**

在 schema 中改成：

```ts
portraitUrl: text("portrait_url").notNull(),
```

Run:

```bash
pnpm exec drizzle-kit generate --name require_npc_portraits
```

Expected migration contains:

```sql
ALTER TABLE "npcs" ALTER COLUMN "portrait_url" SET NOT NULL;
```

更新 schema test，断言 `npcColumns.portraitUrl.notNull` 为 `true`。

- [ ] **Step 3: 写失败的原子完成和 full 查询测试**

使用可记录 `database.execute` 的测试替身，断言完整事务查询包含：

```text
mode = 'full'
portrait_url
estimated_cost_usd
status = 'completed'
stage = 'completed'
```

当 execute 返回空 rows 时，断言抛出 `FullNpcCompletionConflict`。历史和详情查询测试必须断言 join 条件为 `generationJobs.mode = "full"`。

- [ ] **Step 4: 实现完整保存输入和原子事务**

输入接口固定加入：

```ts
portraitUrl: z.string().url(),
estimatedCostUsd: z.number().finite().min(0).max(100),
```

把 `completeProfileNpcAtomically` 替换为 `completeFullNpcAtomically`。CTE 只锁定 `mode = 'full' AND status = 'running'` 的任务，把同一个 `portraitUrl` 写入 NPC 和 job，并在 job 中写入 `estimated_cost_usd`。

- [ ] **Step 5: 实现受约束的阶段更新**

接口固定为：

```ts
export async function markGenerationJobStage(
  database: Database,
  ownerId: string,
  jobId: string,
  stage: "profile" | "portrait" | "persistence",
);
```

更新条件必须包含 owner、job id、`status = "running"` 和 `resultNpcId IS NULL`。不得把失败或已完成任务重新改回运行中。

- [ ] **Step 6: 收紧公开 NPC 契约和查询**

把公开字段改为：

```ts
portraitUrl: z.string().url(),
```

`getProfileNpcForOwner` 和 `listProfileNpcsForOwner` 只 join `mode = "full"`、`status = "completed"` 的任务，并要求 NPC 图片不为空。更新所有完整 NPC fixtures 为 Vercel Blob 风格 URL。

- [ ] **Step 7: 运行数据库相关测试和迁移检查**

Run:

```bash
pnpm exec vitest run src/lib/generation/profile-contracts.test.ts src/lib/db/schema.test.ts src/lib/db/queries/profile-npcs.test.ts src/lib/db/queries/generation-jobs.test.ts src/lib/generation/profile-history-handler.test.ts src/lib/generation/profile-detail-handler.test.ts
pnpm db:check
pnpm typecheck
```

Expected: 全部 PASS，迁移检查和类型检查退出码为 0。

- [ ] **Step 8: 提交 full-mode 数据层**

```bash
git add drizzle src/lib/db src/lib/generation/profile-contracts.ts src/lib/generation/profile-contracts.test.ts src/lib/generation/public-profile-contracts.ts src/lib/generation/profile-history-handler.test.ts src/lib/generation/profile-detail-handler.test.ts tests/fixtures/domain.ts
git commit -m "feat: require portraits for generated NPCs"
```

### Task 5: 资料、图片、Blob 和数据库完整编排

**Files:**

- Modify: `src/lib/generation/profile-generation-service.ts`
- Create: `src/lib/generation/profile-generation-service.test.ts`
- Modify: `src/lib/generation/profile-generation-handler.ts`
- Modify: `src/lib/generation/profile-generation-handler.test.ts`
- Modify: `src/app/api/npcs/generate/route.ts`
- Create: `src/app/api/npcs/generate/route.test.ts`

**Interfaces:**

- Consumes: Task 1 prompt、Task 3 `PortraitRuntime`、Task 4 full-mode 保存函数。
- Produces: 保持现有 `generateProfileNpc(input, dependencies)` 外部调用形式，但成功结果一定包含非空 portrait。
- Guarantees: 一个新任务只调用一次 `runtime.generate`；Blob 成功但数据库失败时只清理一次。

- [ ] **Step 1: 写失败的成功链路测试**

给 service 注入数据库、地理、统计和 `portraitRuntime` 替身。`ProfileGenerationDependencies` 在保留现有字段的基础上精确增加：

```ts
portraitRuntime?: PortraitRuntime;
```

然后断言顺序与数据：

```ts
expect(runtime.generate).toHaveBeenCalledTimes(1);
expect(runtime.store).toHaveBeenCalledTimes(1);
expect(completeFullNpcAtomically).toHaveBeenCalledWith(
  database,
  expect.objectContaining({
    portraitUrl:
      "https://store.public.blob.vercel-storage.com/npc-portraits/job.png",
    estimatedCostUsd: 0.08,
    versionSet: expect.objectContaining({
      imageModel: "openai/gpt-image-2",
    }),
  }),
);
expect(result).toMatchObject({
  status: "completed",
  npc: { portraitUrl: expect.stringContaining("vercel-storage.com") },
});
```

- [ ] **Step 2: 写失败、清理和幂等测试**

覆盖这些精确断言：

```ts
expect(runtime.generate).toHaveBeenCalledTimes(1);
expect(runtime.store).not.toHaveBeenCalled(); // provider failed
expect(runtime.remove).not.toHaveBeenCalled();
```

```ts
expect(runtime.remove).toHaveBeenCalledTimes(1); // DB failed after upload
expect(runtime.remove).toHaveBeenCalledWith(stored.url);
```

已完成相同 idempotency key 直接返回旧 NPC，provider/store 均为 0 次；运行中相同 key 返回 running，provider/store 均为 0 次；失败旧 key 返回已保存失败，provider/store 均为 0 次。

- [ ] **Step 3: 运行 service 测试并确认失败**

Run:

```bash
pnpm exec vitest run src/lib/generation/profile-generation-service.test.ts
```

Expected: FAIL，因为当前 service 仍是 profile-only。

- [ ] **Step 4: 把生成任务切换为 full 并锁定图片模型**

创建任务时改为：

```ts
mode: "full",
versionSet: makeVersionSet(activeVersionSet, runtime.imageModel),
```

`makeVersionSet` 必须把 `imageModel` 设置为 `runtime.imageModel`，不能再是 `null`。配置预检在创建任务和付费调用之前完成。

- [ ] **Step 5: 串起阶段、图片、上传和原子保存**

主流程固定为：

```ts
await markGenerationJobStage(database, ownerId, running.id, "profile");
const sampled = sampleLondonNpc({ seed: running.seed, bundle });
const prompt = buildPortraitPrompt({
  profile: sampled.canonicalProfile,
  currentState: sampled.currentState,
  place: {
    ward: geographyResult.geography.ward?.name ?? null,
    borough: geographyResult.geography.borough.name,
  },
});
await markGenerationJobStage(database, ownerId, running.id, "portrait");
const image = await runtime.generate({ prompt });
const stored = await runtime.store({ jobId: running.id, image });
await markGenerationJobStage(database, ownerId, running.id, "persistence");
const completion = await completeFullNpcAtomically(database, {
  ...lockedProfileInput,
  portraitUrl: stored.url,
  estimatedCostUsd: image.costUsd ?? 0,
});
```

只在 `stored` 已存在且数据库完成失败时调用 `runtime.remove(stored.url)`；删除失败只做脱敏日志，不覆盖原始保存错误。

- [ ] **Step 6: 映射安全错误并设置路由时限**

handler 的公开错误集合加入：

```ts
"provider_timeout",
"invalid_output",
"portrait_failed",
"budget_exceeded",
```

route 文件加入：

```ts
export const runtime = "nodejs";
export const maxDuration = 180;
```

route 只在服务端从 `env` 创建一次 portrait runtime，再注入 `generateProfileNpc`。响应不能包含 prompt、Base64、Blob Token 或上游原始错误。

- [ ] **Step 7: 运行编排和接口测试**

Run:

```bash
pnpm exec vitest run src/lib/generation/profile-generation-service.test.ts src/lib/generation/profile-generation-handler.test.ts src/app/api/npcs/generate/route.test.ts
pnpm typecheck
pnpm secrets:check
```

Expected: 成功、失败、幂等和清理测试全部 PASS；类型和密钥检查通过。

- [ ] **Step 8: 提交完整生成编排**

```bash
git add src/lib/generation/profile-generation-service.ts src/lib/generation/profile-generation-service.test.ts src/lib/generation/profile-generation-handler.ts src/lib/generation/profile-generation-handler.test.ts src/app/api/npcs/generate/route.ts src/app/api/npcs/generate/route.test.ts
git commit -m "feat: generate portrait-backed NPCs"
```

### Task 6: 前端真实照片、进度和错误状态

**Files:**

- Modify: `src/components/explorer/use-npc-generation.ts`
- Create: `src/components/explorer/use-npc-generation.test.tsx`
- Modify: `src/components/explorer/npc-profile.tsx`
- Create: `src/components/explorer/npc-profile.test.tsx`
- Modify: `src/components/explorer/npc-history.tsx`
- Create: `src/components/explorer/npc-history.test.tsx`
- Modify: `src/components/explorer/explorer-shell.tsx`
- Modify: `src/components/explorer/explorer-shell.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `next.config.ts`

**Interfaces:**

- Consumes: Task 4 的非空 `PublicProfileNpc.portraitUrl`。
- Produces: `NpcProfile` 和 `NpcHistory` 中稳定的 3:4 `next/image`。
- Produces: `useNpcGeneration` 的 coarse stage：`profile | portrait | persistence`。
- Guarantees: completed response 前没有名字、资料或图片进入 UI state。

- [ ] **Step 1: 阅读当前 Next.js 16.3 图片规则**

Run:

```bash
sed -n '1,220p' node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
sed -n '533,620p' node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
sed -n '1,80p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md
```

Expected: 使用 `next/image`、必填 alt、稳定尺寸和严格 `remotePatterns`，不使用已弃用 `domains`。

- [ ] **Step 2: 写失败的不提前展示和进度测试**

用 deferred fetch 渲染 hook，断言请求未完成时：

```ts
expect(result.current.npc).toBeNull();
expect(result.current.stage).toBe("profile");
```

推进 fake timer 后 stage 变成 `portrait`，但 NPC 仍为 null。完成响应到达后先进入 `persistence`，然后统一设置 NPC、history 和 ready。失败时 NPC 保持 null，下一次手动 `generate` 使用新的 idempotency key。

- [ ] **Step 3: 写失败的人物照片和历史缩略图测试**

断言人物详情存在：

```ts
expect(
  screen.getByRole("img", { name: "Fictional portrait of Amara Okafor" }),
).toHaveAttribute("src", expect.stringContaining("npc-portraits"));
```

历史记录也必须显示相同 URL，并且点击历史按钮仍调用 `onSelect(npcId)`。测试不再查找首字母头像。

- [ ] **Step 4: 运行前端测试并确认失败**

Run:

```bash
pnpm exec vitest run src/components/explorer/use-npc-generation.test.tsx src/components/explorer/npc-profile.test.tsx src/components/explorer/npc-history.test.tsx src/components/explorer/explorer-shell.test.tsx
```

Expected: FAIL，因为现有 UI 仍使用 4:5 首字母块和旧进度文案。

- [ ] **Step 5: 实现真实图片和严格远程域名配置**

在 profile 使用：

```tsx
<Image
  src={npc.portraitUrl}
  alt={`Fictional portrait of ${profile.identity.fictionalName}`}
  fill
  sizes="(max-width: 440px) 84px, 94px"
/>
```

在 history 使用明确 `width={32}`、`height={43}` 和相同 alt。`next.config.ts` 加入：

```ts
images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: "*.public.blob.vercel-storage.com",
      port: "",
      pathname: "/npc-portraits/**",
      search: "",
    },
  ],
},
```

data URL 只用于 mock runtime，并为该分支设置 `unoptimized`；live 图片必须匹配 Blob pattern。

- [ ] **Step 6: 实现真实但粗粒度的等待文案**

请求开始立即设置 `profile`，800ms 后进入 `portrait`。HTTP completed 响应解析成功后设置 `persistence`，等待 250ms 再把 NPC 和 history 同时写入 state。显示文案固定为：

```ts
const generationCopy = {
  profile: "Sampling local profile",
  portrait: "Generating portrait",
  persistence: "Saving encounter",
};
```

失败按钮文字为 `Generate again`，点击复用现有 generate 函数并产生新的 idempotency key。

- [ ] **Step 7: 把所有人物图片状态固定为 3:4**

CSS 必须给 `.portrait-stage`、`.npc-portrait` 和 `.history-portrait` 设置 `aspect-ratio: 3 / 4`、`overflow: hidden`，图片使用 `object-fit: cover`。桌面头像宽 94px，手机宽 84px，历史缩略图宽 32px；加载、错误、hover 和图片加载完成都不能改变 grid track。

- [ ] **Step 8: 运行前端专项验证**

Run:

```bash
pnpm exec vitest run src/components/explorer/use-npc-generation.test.tsx src/components/explorer/npc-profile.test.tsx src/components/explorer/npc-history.test.tsx src/components/explorer/explorer-shell.test.tsx
pnpm exec eslint src/components/explorer/use-npc-generation.ts src/components/explorer/npc-profile.tsx src/components/explorer/npc-history.tsx src/components/explorer/explorer-shell.tsx next.config.ts
pnpm typecheck
```

Expected: 全部 PASS。

- [ ] **Step 9: 提交画像 UI**

```bash
git add src/components/explorer src/app/globals.css next.config.ts
git commit -m "feat: reveal NPC portraits in explorer"
```

### Task 7: 全量验证、Vercel 配置和一次付费冒烟测试

**Files:**

- Modify: `docs/HANDOFF.md`
- Modify: `docs/architecture.md`
- Modify only in-scope Task 1-6 files if verification finds a defect.

**Interfaces:**

- Verifies: 浏览器 -> Next.js route -> OpenRouter -> Blob -> Neon -> 浏览器完整链路。
- Produces: 已配置的 Vercel Blob store、Production/Preview 环境变量和一条真实完整 NPC。

- [ ] **Step 1: 运行全部自动检查**

按顺序运行，避免并行构建争用：

```bash
pnpm format:check
pnpm lint
pnpm test
pnpm typecheck
pnpm db:check
pnpm build
pnpm secrets:check
git diff --check
```

Expected: 全部退出码为 0，构建识别 `/api/npcs/generate` 的 180 秒配置。

- [ ] **Step 2: 应用数据库迁移并验证空旧数据**

Run:

```bash
pnpm db:migrate
pnpm db:verify
```

Expected: migration 成功；`npcs.portrait_url` 为 NOT NULL；旧 NPC 仍为 0；统计数据和地点表保持可用。

- [ ] **Step 3: 在 Vercel 项目连接 Blob store**

在同一个 `london-npc-explorer` Vercel 项目创建或连接一个 public Blob store。确认 Production 和 Preview 获得 `BLOB_READ_WRITE_TOKEN`，不要把值复制进文档、Git、终端输出或聊天。

在 Vercel Production 和 Preview 设置：

```text
OPENROUTER_IMAGE_MODEL=openai/gpt-image-2
```

确认已有 `OPENROUTER_API_KEY`，只检查变量存在，不显示值。

- [ ] **Step 4: 做不花钱的桌面和手机视觉检查**

用 mock API 响应启动本地服务，在 `1440x900` 和 `390x844` 截图。检查：

- loading、error 和成功照片全部保持 3:4；
- 人物资料直到 completed response 后才出现；
- 历史缩略图和人物详情使用同一 URL；
- 图片、姓名、按钮和对话框不重叠；
- `document.documentElement.scrollWidth === window.innerWidth`。

- [ ] **Step 5: 部署并只做一次真实付费生成**

部署通过全部检查的提交到 Production。登录现有 Clerk 账号，使用一个伦敦坐标只点击一次 `Generate NPC`。确认：

```text
OpenRouter image calls: 1
Generated images: 1
Blob objects created: 1
Visible NPC rows created: 1
NPC portrait URL equals job portrait URL: true
```

同时确认照片是普通伦敦人物纪实风格、没有明显水印或文字，页面直到照片保存完成才整体展示。

- [ ] **Step 6: 检查失败保护而不产生第二次费用**

不再调用真实模型。使用 provider/store 测试替身复跑 timeout、429、Blob 失败和数据库失败用例，确认每个用例 provider 调用最多一次，数据库失败清理 Blob 一次，没有可见 NPC。

- [ ] **Step 7: 更新交接和架构文档**

`docs/HANDOFF.md` 把画像生成从 `Not Complete` 移到 `Working`，记录 Kimi 负责对话、OpenRouter GPT Image 2 负责画像、Vercel Blob 负责文件。环境变量列表加入 `OPENROUTER_IMAGE_MODEL` 和 `BLOB_READ_WRITE_TOKEN`。

`docs/architecture.md` 的 Mermaid 链路更新为：

```mermaid
flowchart LR
    NPCAPI[NPC generation API] --> PROFILE[Locked statistical profile]
    PROFILE --> IMAGE[OpenRouter GPT Image 2]
    IMAGE --> BLOB[Vercel Blob]
    BLOB --> DB[Atomic full NPC persistence]
    DB --> UI[Profile and portrait reveal]
```

- [ ] **Step 8: 提交验证后的文档或修复**

如果视觉或真实冒烟测试发现范围内缺陷，先用对应专项测试复现，再提交修复。最后提交文档：

```bash
git add docs/HANDOFF.md docs/architecture.md
git commit -m "docs: record NPC portrait pipeline"
```

- [ ] **Step 9: 最终工作树检查**

Run:

```bash
git status --short --branch
git log --oneline -10
```

Expected: 工作树干净；所有画像提交位于当前 `main` 顶部；不自动 push，除非用户明确要求。
