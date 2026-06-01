# 部署到 Vercel（含 Turso 持久化）

## 一、建立 Turso 数据库（一次性，约 3 分钟）

1. 打开 https://turso.tech ，用 GitHub 登录。
2. 控制台点 **Create Database**：
   - Name：`trae-dreams`（随意）
   - Region：`hkg / nrt / sjc` 任选最近的
3. 进入这个数据库的页面：
   - 顶部能看到 **Database URL**，形如 `libsql://trae-dreams-xxx.turso.io`
   - 右上 **Create Token** → 生成一个 **Auth Token**（点一次"copy"，妥善保存，离开页面无法再看）

## 二、把两个变量配进 Vercel

打开你的 Vercel 项目 → **Settings → Environment Variables**，添加两条（Production + Preview 都勾上）：

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | 上一步那个 `libsql://...turso.io` |
| `TURSO_AUTH_TOKEN`   | 上一步那个 token |

保存后到 **Deployments** → 点最新的那条 → **Redeploy**（不要勾"Use existing build cache"）。

## 三、验证

打开站点，写一条梦想 → 复制链接换台设备访问，依旧能看到 → 持久化生效。

---

## 本地开发

不配置环境变量时，数据库会自动落到 `./data/dreams.db`（文件式 SQLite），即开即用：

```bash
npm install
npm start          # 默认 http://localhost:3000
```

要本地直接连 Turso，也可以在 shell 里临时导出两个环境变量后再 `npm start`。
